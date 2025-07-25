import { GoogleGenerativeAI } from '@google/generative-ai'
import axios from 'axios'
import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db/db'
import { productsTable, searchesTable } from '../db/schema'
import fs from 'fs/promises'
import path from 'path'

const BATCH_SIZE = 8
const MAX_RETRIES = 3
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)

function createPrompt (rawItems: any[], previousAttempts: any[] = []) {
  return `
You are a strict JSON formatter. Return only a valid JSON array and nothing else.

Format:
[
  {
    "name": "string",
    "price": "string (starts with $)",
    "originalPrice": "string (starts with $ or null)",
    "savings": "string (starts with $ or null)",
    "image": "valid image URL",
    "rating": number or null,
    "reviews": number or null,
    "store": "string or null",
    "link": "valid URL"
  }
]

Here is the raw data:
${JSON.stringify(rawItems, null, 2)}

Previously generated attempts:
${JSON.stringify(previousAttempts, null, 2)}

Return a valid JSON array only.`
}

async function extractValidJson (model: any, rawItems: any[]): Promise<any[]> {
  let attempts = 0
  let previousAttempts: string[] = []

  while (attempts < MAX_RETRIES) {
    try {
      const prompt = createPrompt(rawItems, previousAttempts)
      const raw = (await (await model.generateContent(prompt)).response).text()
      const cleanedRaw = raw.replace(/```json|```/g, '').trim()

      const start = cleanedRaw.indexOf('[')
      const end = cleanedRaw.lastIndexOf(']')
      if (start === -1 || end === -1) throw new Error('No JSON array found')

      const parsed = JSON.parse(cleanedRaw.slice(start, end + 1))
      if (!Array.isArray(parsed)) throw new Error('Not an array')

      return parsed
    } catch (err: any) {
      console.warn(`⚠️ Attempt ${attempts + 1} failed: ${err.message}`)
      previousAttempts.push(err.message)
      attempts++
    }
  }

  throw new Error('AI returned invalid JSON format after retries')
}

const search = async (req: Request, res: Response) => {
  try {
    const { query, filters } = req.body
    const userId = req.user?.id

    if (!query || !userId) {
      return res.status(400).json({ error: 'Missing query or userId' })
    }

    let searchQuery = `${query} product`
    if (filters) {
      Object.entries(filters).forEach(([key, value]) => {
        if (key === 'budget' && typeof value === 'number') {
          searchQuery += ` under $${value}`
        } else if (Array.isArray(value)) {
          searchQuery += ` with ${value.join(', ')}`
        } else if (typeof value === 'string') {
          searchQuery += ` ${value}`
        }
      })
    }

    const serpApiRes = await axios.get('https://serpapi.com/search.json', {
      params: {
        engine: 'google_shopping',
        q: searchQuery,
        hl: 'en',
        gl: 'us',
        api_key: process.env.SERP_API_KEY!
      }
    })

    console.log(serpApiRes)

    const shoppingResults = serpApiRes.data.shopping_results?.slice(0, 25) || []

    if (!shoppingResults.length) {
      return res.status(404).json({ error: 'No shopping results found' })
    }

    // 🤖 Use Gemini to structure output
    const prompt = `
You are a product structuring assistant. Convert the following shopping_results array into a JSON array of product objects matching this schema:

[
  {
    "productName": string,
    "price": string,
    "originalPrice": string,
    "savings": string,
    "image": string,
    "rating": number,
    "reviews": number,
    "store": string,
    "productUrl": string,
    "features": string[],
    "pros": string[],
    "cons": string[]
  }
]

Here is the shopping_results array:
${JSON.stringify(shoppingResults, null, 2)}
    `

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()

    const jsonMatch = text.match(/```(?:json)?\n([\s\S]*?)```/)
    const jsonString = jsonMatch ? jsonMatch[1] : text

    let structuredProducts: any[]
    try {
      structuredProducts = JSON.parse(jsonString)
    } catch (err) {
      throw new Error('Failed to parse Gemini output as JSON')
    }

    if (!Array.isArray(structuredProducts)) {
      return res.status(500).json({ error: 'Gemini did not return an array' })
    }

    // 📥 Save search and products
    const searchId = uuidv4()

    await db.insert(searchesTable).values({
      id: searchId,
      userId,
      query: searchQuery
    })

    const productInsertValues = structuredProducts.map(product => ({
      id: uuidv4(),
      searchId,
      productName: product.productName || null,
      price: product.price || null,
      originalPrice: product.originalPrice || null,
      savings: product.savings || null,
      image: product.image || null,
      rating: product.rating || null,
      reviews: product.reviews || null,
      store: product.store || null,
      productUrl: product.productUrl || null,
      features: product.features || [],
      pros: product.pros || [],
      cons: product.cons || []
    }))

    await db.insert(productsTable).values(productInsertValues)

    return res.json({ products: structuredProducts })
  } catch (err: any) {
    console.error('Search error:', err.message)
    return res.status(500).json({ error: 'Product search failed' })
  }
}

function extractStoreName (url?: string) {
  if (!url) return 'Unknown'
  try {
    const hostname = new URL(url).hostname
    if (hostname.includes('amazon')) return 'Amazon'
    if (hostname.includes('bestbuy')) return 'Best Buy'
    if (hostname.includes('apple')) return 'Apple Store'
    return hostname.replace('www.', '').split('.')[0]
  } catch {
    return 'Unknown'
  }
}

const generateForm = async (req: Request, res: Response) => {
  try {
    const { query } = req.body

    if (!query) {
      return res.status(400).json({ error: 'Missing query' })
    }

    const prompt = `
You are a helpful assistant that generates dynamic form schemas for user queries.
Generate a JSON array representing form fields for the following user query: "${query}"

Each form field should follow this schema:
{
  "name": string,              // unique field identifier
  "label": string,             // label shown to user
  "type": "text" | "slider" | "checkbox" | "radio",
  "options"?: string[],        // for checkbox or radio
  "min"?: number,              // for slider
  "max"?: number,              // for slider
  "step"?: number              // for slider
}

Include a variety of fields:
- A slider field (e.g., budget)
- A checkbox group (e.g., preferred features)
- A text input (e.g., brand or model)
- A radio field (e.g., urgency)

Output only the pure JSON array. No explanation or formatting.
`

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

    const result = await model.generateContent(prompt)
    const response = await result.response
    const raw = response.text()

    // Parse the JSON (safely)
    const start = raw.indexOf('[')
    const end = raw.lastIndexOf(']')
    const jsonString = raw.substring(start, end + 1)

    let fields
    try {
      fields = JSON.parse(jsonString)
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response' })
    }

    return res.json({ formSchema: fields })
  } catch (err) {
    console.error('Form generation error:', err)
    return res.status(500).json({ error: 'Internal Server Error' })
  }
}

export { search, generateForm }
