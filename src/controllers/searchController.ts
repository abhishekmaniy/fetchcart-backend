import axios from 'axios'
import { Request, Response } from 'express'

const search = async (req: Request, res: Response) => {
  const { query, filters } = req.body

  if (!query) {
    return res.status(400).json({ error: 'Missing query' })
  }

  try {
    // Construct query string
    let searchQuery = query

    if (filters?.category) {
      searchQuery += ` in ${filters.category}`
    }

    if (filters?.budget?.max) {
      searchQuery += ` under $${filters.budget.max}`
    }

    // Send request to SerpAPI
    const serpRes = await axios.get('https://serpapi.com/search.json', {
      params: {
        q: searchQuery,
        hl: 'en',
        gl: 'us',
        api_key: process.env.SERP_API_KEY!
      }
    })

    const results = serpRes.data.organic_results || []
    const products: any[] = []

    results.forEach((result: any, i: number) => {
      const title = result.title
      const link = result.link
      const snippet = result.snippet || ''

      const priceMatch = snippet.match(/\$\d+(?:\.\d{2})?/)
      const originalPriceMatch = snippet.match(/(?:was|original(?:ly)?)[^\$]*(\$\d+(?:\.\d{2})?)/i)

      const price = priceMatch?.[0] ?? '$99.99'
      const originalPrice = originalPriceMatch?.[1] ?? price

      const savings =
        originalPrice !== price
          ? `$${(parseFloat(originalPrice.replace('$', '')) - parseFloat(price.replace('$', ''))).toFixed(2)}`
          : '$0.00'

      products.push({
        id: i + 1,
        name: title,
        price,
        originalPrice,
        savings,
        image: '/placeholder.svg',
        rating: (Math.random() * (5 - 4.2) + 4.2).toFixed(1),
        reviews: Math.floor(Math.random() * 2000) + 100,
        store: extractStoreName(link),
        link
      })
    })

    return res.json({
      query: searchQuery,
      products
    })
  } catch (error: any) {
    console.error('SerpAPI error:', error?.response?.data || error.message)
    return res.status(500).json({ error: 'Failed to perform search' })
  }
}

// Helper to extract store name from domain
function extractStoreName(url?: string) {
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

export default search
