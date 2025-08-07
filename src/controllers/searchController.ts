import { GoogleGenerativeAI } from '@google/generative-ai'
import axios from 'axios'
import { Request, Response } from 'express'
import { v4 as uuidv4 } from 'uuid'
import db from '../db/db'
import { productsTable, searchesTable } from '../db/schema'
import fs from 'fs';
import path from "path"
import { InferInsertModel } from 'drizzle-orm'

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!)
const SCRAPER_API = process.env.SCRAPER_API!

type ProductInsert = InferInsertModel<typeof productsTable>

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
  `.trim()
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

function isValidURL(input: string): boolean {
  try {
    new URL(input)
    return true
  } catch {
    return false
  }
}

const search = async (req: Request, res: Response) => {
  const finalProductArray: ProductInsert[] = []

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
        gl: 'in',
        api_key: process.env.SERP_API_KEY!
      }
    })

    const data = serpApiRes.data
    const filePath = path.join(__dirname, 'serpapi-response.json')
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    console.log('Saved SERP API response to:', filePath)

    const shoppingResults = serpApiRes.data.shopping_results?.slice(0, 25) || []

    if (!shoppingResults.length) {
      return res.status(404).json({ error: 'No shopping results found' })
    }

    const productLinks = shoppingResults
      .map((p: any) => p.product_link)
      .filter((link: string) => isValidURL(link))
    for (const url of productLinks) {
      try {
        const encodedUrl = encodeURIComponent(url)

        const scrapeRes = await axios.get(
          `https://api.scraperapi.com/structured/google/shopping?api_key=${SCRAPER_API}&query=${encodedUrl}&country_code=in`
        )

        const scrapedProduct = scrapeRes.data
        scrapedProduct.productUrl = url

        const prompt = buildTransformPromptForOne(scrapedProduct)

        try {
          const structured = await sendToGemini(prompt)
          finalProductArray.push(structured)
        } catch (err: any) {
          console.error('Gemini parse failed for URL:', url, err.message)
        }

        await new Promise((resolve) => setTimeout(resolve, 1000))
      } catch (error) {
        console.log('Scrape error for URL:', url, error)
      }
    }


    const structuredProducts = finalProductArray

    if (!structuredProducts.length) {
      return res.status(500).json({ error: 'Failed to extract product data' })
    }

    const searchId = uuidv4()
    const createdAt = new Date()

    await db.insert(searchesTable).values({
      id: searchId,
      userId,
      query: searchQuery,
      createdAt
    })

    const productInsertValues = structuredProducts.map((product) => ({
      id: uuidv4(),
      searchId,
      productName: product.productName || null,
      brand: product.brand || null,
      model: product.model || null,
      price: product.price || null,
      originalPrice: product.originalPrice || null,
      savings: product.savings || null,
      image: product.image || null,
      images: product.images || null,
      rating: product.rating || null,
      reviews: product.reviews || null,
      store: product.store || null,
      productUrl: product.productUrl || null,
      asin: product.asin || null,
      category: product.category || null,
      description: product.description || null,
      productInfo: product.productInfo || {},
      featureBullets: product.featureBullets || [],
      pros: product.pros || [],
      cons: product.cons || [],
      createdAt
    }))

    await db.insert(productsTable).values(productInsertValues)

    return res.json({
      search: {
        id: searchId,
        query: searchQuery,
        createdAt: createdAt.toISOString(),
        products: structuredProducts
      }
    })
  } catch (err: any) {
    console.error('Search error:', err.message)
    return res.status(500).json({ error: 'Product search failed' })
  }
}



const generateForm = async (req: Request, res: Response) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: 'Missing query' });
    }

    const prompt = `
You are a helpful AI assistant generating smart, dynamic form schemas for user queries.

### Objective:
Generate a JSON array of form fields based on the user query: "${query}"

### Rules:
1. If the query already includes information (e.g., color = blue, brand = Nike), **do not ask again**.
2. All price-related fields should use **INR (₹)** with a **realistic price range** for the product type (e.g., phones start at ₹5000, laptops ₹20000, t-shirts ₹300, etc.).
3. Do not include placeholder or generic prices like 0-100 unless they are meaningful.
4. Include at least:
   - One **slider** (e.g., budget or quantity) with appropriate 'min', 'max', and 'step'.
   - One **checkbox** group (e.g., preferred features or brands).
   - One **text** input (e.g., model or description).
   - One **radio** group (e.g., urgency, delivery options).
5. Only include questions that gather **missing** or **important** product preferences not already mentioned.

### Output format:
Only return a pure JSON array of form fields like this:
[
  {
    "name": "budget",
    "label": "Select your budget (₹)",
    "type": "slider",
    "min": 1000,
    "max": 5000,
    "step": 500
  },
  {
    "name": "features",
    "label": "Preferred Features",
    "type": "checkbox",
    "options": ["Waterproof", "Wireless", "Touchscreen"]
  },
  ...
]
`;

    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const raw = response.text();

    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    const jsonString = raw.substring(start, end + 1);

    let fields;
    try {
      fields = JSON.parse(jsonString);
    } catch (e) {
      return res.status(500).json({ error: 'Failed to parse AI response' });
    }

    return res.json({ formSchema: fields });
  } catch (err) {
    console.error('Form generation error:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};


export { generateForm, search }

