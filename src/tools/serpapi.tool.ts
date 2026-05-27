import axios from "axios";
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { env } from "../config/env";

export const serpApiSearchTool = new DynamicStructuredTool({
  name: "serpapi_google_shopping_search",
  description: "Search Google Shopping products using SerpAPI.",
  schema: z.object({
    query: z.string(),
    limit: z.number().default(25),
  }),
  func: async ({ query, limit }) => {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google_shopping",
        q: query,
        hl: "en",
        gl: "in",
        api_key: env.SERP_API_KEY,
      },
    });

    const results = response.data.shopping_results?.slice(0, limit) || [];

    return JSON.stringify(
      results.map((p: any) => ({
        title: p.title,
        price: p.price,
        source: p.source,
        rating: p.rating,
        reviews: p.reviews,
        thumbnail: p.thumbnail,
        product_link: p.product_link,
        link: p.link,
      }))
    );
  },
});