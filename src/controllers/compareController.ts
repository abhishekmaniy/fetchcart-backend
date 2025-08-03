import { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
import axios from 'axios'
import * as dotenv from 'dotenv'
import db from '../db/db'
import { compareTable, productsTable, compareProductsTable } from '../db/schema'
import { InferInsertModel } from 'drizzle-orm'

dotenv.config()

type ProductInsert = InferInsertModel<typeof productsTable>
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)
const SCRAPER_API = process.env.SCRAPER_API!

function isValidURL(input: string): boolean {
  try {
    new URL(input)
    return true
  } catch {
    return false
  }
}

async function sendToGemini(prompt: string) {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
  const result = await model.generateContent(prompt)
  let text = result.response.text().trim()

  if (text.startsWith('```')) {
    text = text.replace(/^```json\s*|```$/g, '').trim()
  }

  try {
    return JSON.parse(text)
  } catch (err) {
    console.error('Gemini Output:', text)
    throw new Error('Invalid JSON from Gemini')
  }
}

function buildComparisonPrompt(products: any[]) {
  const productList = products
    .map((product, index) => `${index + 1}. ${JSON.stringify(product, null, 2)}`)
    .join('\n\n')

  return `
You are a product analyst.

Your task is to compare multiple products and return a structured JSON object in the following format:

{
  "bestProductIndex": number, // Index (1-based) of the best product
  "bestProductTitle": string,
  "reasons": string[], // Reasons why it's the best
  "summary": string // A brief summary of the comparison
}

Compare the following product objects:

${productList}
  `.trim()
}

function buildTransformPromptForOne(product: any) {
  return `
You are a data formatter. Convert the following product object into this structured format for PostgreSQL:

{
  "productName": string,
  "brand": string,
  "model": string,

  "price": string,
  "originalPrice": string,
  "savings": string,

  "image": string,
  "images": string[],

  "rating": number,
  "reviews": number,

  "productUrl": string,
  "store": string,
  "asin": string,

  "category": string,
  "description": string,

  "productInfo": { [key: string]: string },
  "featureBullets": string[],

  "pros": string[],
  "cons": string[]
}

Strictly return only a single JSON object in the above format. Do **not** include any markdown, explanation, or extra text.

Here is the raw product object:
${JSON.stringify(product)}
  `.trim();
}

export const scrapeProductPage = async (req: Request, res: Response) => {
  const { queries, userId } = req.body

  if (!queries || !Array.isArray(queries) || queries.length < 2) {
    return res.status(400).json({ error: 'Need at least 2 product URLs' })
  }

  const rawProductData = []
  const finalProductArray: ProductInsert[] = []

  for (const url of queries.map((q: string) => q.trim())) {
    if (!isValidURL(url)) continue

    try {
      const encodedUrl = encodeURIComponent(url);

      const scrapeRes = await axios.get(
        `https://api.scraperapi.com/?api_key=${SCRAPER_API}&url=${encodedUrl}&output_format=json&autoparse=true&country_code=in&device_type=desktop`
      );

      const scrapedProduct = scrapeRes.data
      scrapedProduct.productUrl = url

      // 🔁 Transform the scraped product into structured format
      const prompt = buildTransformPromptForOne(scrapedProduct)

      try {
        const structured = await sendToGemini(prompt)
        finalProductArray.push(structured)
        rawProductData.push(structured) // use structured format for comparison
      } catch (err: any) {
        console.error("Failed to transform product:", url, err.message)
      }

      await new Promise(resolve => setTimeout(resolve, 1000)) // throttle
    } catch (err: any) {
      console.error(`Error scraping ${url}:`, err?.message)
    }
  }

  if (finalProductArray.length < 2) {
    return res.status(500).json({ error: 'Failed to extract at least 2 valid products' })
  }

  // 🔍 Generate comparison using structured product data
  const comparisonPrompt = buildComparisonPrompt(rawProductData)
  const comparison = await sendToGemini(comparisonPrompt)

  // 💾 Insert into compareTable
  const [compareEntry] = await db
    .insert(compareTable)
    .values({
      id: randomUUID(),
      userId,
      title: `Comparison of ${finalProductArray.length} products`,
      productUrl: finalProductArray
        .map(p => p.productUrl)
        .filter((url): url is string => typeof url === 'string'),
      summary: comparison.summary,
      insights: {
        bestProductIndex: comparison.bestProductIndex,
        bestProductTitle: comparison.bestProductTitle,
        reasons: comparison.reasons,
      }
    })
    .returning();

  // 💾 Save structured products into productsTable
  const insertedProducts = await db
    .insert(productsTable)
    .values(
      finalProductArray.map(product => ({
        id: randomUUID(),
        compareId: compareEntry.id,
        ...product
      }))
    )
    .returning()

  // 🔗 Save into compareProductsTable
  await db.insert(compareProductsTable).values(
    insertedProducts.map(product => ({
      id: randomUUID(),
      compareId: compareEntry.id,
      productId: product.id
    }))
  )

  return res.json({
    data: {
      ...compareEntry,
      products: insertedProducts
    }
  })
}
