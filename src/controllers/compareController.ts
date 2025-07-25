import axios from 'axios'
import { Request, Response } from 'express'
import { randomUUID } from 'crypto'
import path from 'path'
import fs from 'fs/promises'
import { GoogleGenerativeAI } from '@google/generative-ai'
import dotenv from 'dotenv'
import * as cheerio from 'cheerio'

dotenv.config()

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)

function isValidURL (input: string): boolean {
  try {
    new URL(input)
    return true
  } catch {
    return false
  }
}

// ✅ Gemini call
export async function sendToGemini (scrapedContent: string) {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const prompt = `
You are an AI that extracts product information from a web page.

From the following raw product page content, extract only these fields in strict JSON format:

{
  "title": string,
  "price": string,
  "image": string (URL),
  "store": string (e.g. Amazon, Flipkart),
  "rating": string,
  "reviews": string
}

Respond only with valid JSON, no explanations or markdown.

---START OF CONTENT---
${scrapedContent}
---END OF CONTENT---
    `.trim()

    const result = await model.generateContent(prompt)
    const response = await result.response
    let text = response.text().trim()

    // 🛠️ Remove Markdown fences
    if (text.startsWith('```')) {
      text = text.replace(/^```json\s*|```$/g, '').trim()
    }

    try {
      return JSON.parse(text)
    } catch (err) {
      console.warn('❌ JSON parse error:', err)
      console.warn('🔎 Gemini raw output:', text)
      throw new Error('Gemini returned invalid JSON')
    }
  } catch (error) {
    console.error('Gemini Error:', error)
    throw error
  }
}

export const scrapeProductPage = async (req: Request, res: Response) => {
  let { queries } = req.body

  if (!queries) return res.status(400).json({ error: 'Missing product input' })
  if (!Array.isArray(queries)) queries = [queries]

  const results: any[] = []
  const rawCache: string[] = []
  const structuredCache: string[] = []

  for (const input of queries.map((q: string) => q.trim())) {
    const fileId = randomUUID()
    console.log(`🔍 Scraping: ${input}`)

    if (!isValidURL(input)) {
      console.warn(`❌ Skipping non-URL input: ${input}`)
      continue
    }

    try {
      const scrapeRes = await axios.post(
        'https://scrapeninja.p.rapidapi.com/scrape',
        { url: input },
        {
          headers: {
            'Content-Type': 'application/json',
            'x-rapidapi-key': process.env.RAPIDAPI_KEY!,
            'x-rapidapi-host': 'scrapeninja.p.rapidapi.com'
          }
        }
      )

      console.log(scrapeRes)

      const html = scrapeRes.data.html || ''
      const rawDir = path.join(process.cwd(), 'serp-cache', 'raw')
      await fs.mkdir(rawDir, { recursive: true })
      const rawFilePath = path.join(rawDir, `raw-${fileId}.html`)
      await fs.writeFile(rawFilePath, html, 'utf8')
      rawCache.push(`raw-${fileId}.html`)

      const $ = cheerio.load(html)

      const title =
        $('#productTitle').text().trim() ||
        $('span#productTitle').text().trim() ||
        $('title').text().trim() ||
        null

      const price =
        $('#priceblock_ourprice').text().trim() ||
        $('#priceblock_dealprice').text().trim() ||
        $('#priceblock_saleprice').text().trim() ||
        $('[data-asin-price]').text().trim() ||
        $('span.a-price > span.a-offscreen').first().text().trim() ||
        null

      const image =
        $('#landingImage').attr('src') ||
        $('#imgTagWrapperId img').attr('data-old-hires') ||
        $('#imgTagWrapperId img').attr('src') ||
        $('img').first().attr('src') ||
        null

      const rating =
        $('span.a-icon-alt').first().text().trim() ||
        $('span[aria-label*="out of 5 stars"]').first().attr('aria-label') ||
        null

      const reviews =
        $('#acrCustomerReviewText').text().trim() ||
        $('span[data-asin][aria-label*="ratings"]')
          .first()
          .attr('aria-label') ||
        $('span.a-size-base')
          .filter((i, el) => $(el).text().includes('ratings'))
          .first()
          .text()
          .trim() ||
        null

      const store = input.includes('amazon')
        ? 'Amazon'
        : input.includes('flipkart')
        ? 'Flipkart'
        : 'Unknown'

      console.log('🔎 Extracted Fields:')
      console.log({ title, price, image, rating, reviews })

      const cleanedData = {
        title,
        price,
        image,
        rating,
        reviews,
        store
      }

      const geminiResponse = await sendToGemini(JSON.stringify(cleanedData))

      // 🚫 No strict schema validation
      const structuredDir = path.join(process.cwd(), 'serp-cache')
      await fs.mkdir(structuredDir, { recursive: true })
      const structuredFile = `product-${fileId}.json`
      await fs.writeFile(
        path.join(structuredDir, structuredFile),
        JSON.stringify(geminiResponse, null, 2),
        'utf8'
      )
      structuredCache.push(structuredFile)
      results.push(geminiResponse)
    } catch (err: any) {
      console.error(`❌ Scraping failed for: ${input}`)
      console.error(err?.response?.data || err.message)
    }
  }

  if (results.length === 0) {
    return res.status(500).json({ error: 'No valid product data extracted' })
  }

  return res.json({
    products: results,
    cache: {
      raw: rawCache,
      structured: structuredCache
    }
  })
}
