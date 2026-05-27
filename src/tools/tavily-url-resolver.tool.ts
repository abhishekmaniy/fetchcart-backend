import { tavily } from "@tavily/core";
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { env } from "../config/env";

const client = tavily({ apiKey: env.TAVILY_API_KEY });

function isGoogleShoppingUrl(url?: string) {
  if (!url) return false;
  return url.includes("google.com/search") || url.includes("ibp=oshop");
}

function isLikelyProductUrl(url: string) {
  const blocked = ["google.com", "youtube.com", "facebook.com", "instagram.com"];
  if (blocked.some((domain) => url.includes(domain))) return false;

  const productSignals = [
    "/dp/",
    "/gp/product/",
    "/p/",
    "/product",
    "/products",
    "/buy",
    "amazon.",
    "flipkart.",
    "croma.",
    "reliancedigital.",
    "vijaysales.",
    "realme.",
    "samsung.",
  ];

  return productSignals.some((signal) => url.toLowerCase().includes(signal));
}

export const tavilyUrlResolverTool = new DynamicStructuredTool({
  name: "tavily_product_url_resolver",
  description:
    "Resolve a Google Shopping product result into a real ecommerce product URL.",
  schema: z.object({
    title: z.string(),
    source: z.string().optional(),
    price: z.string().optional(),
    googleProductUrl: z.string().optional(),
  }),
  func: async ({ title, source, price, googleProductUrl }) => {
    console.log("\n🔗 [tavilyUrlResolverTool] START");
    console.log("[resolver] title:", title);
    console.log("[resolver] source:", source);
    console.log("[resolver] price:", price);
    console.log("[resolver] googleProductUrl:", googleProductUrl);
    console.log("[resolver] Has TAVILY_API_KEY:", Boolean(env.TAVILY_API_KEY));

    const query = [
      title,
      source,
      price,
      "buy online India product page",
    ]
      .filter(Boolean)
      .join(" ");

    console.log("[resolver] Tavily search query:", query);

    const response = await client.search(query, {
      maxResults: 8,
      searchDepth: "advanced",
      includeAnswer: false,
      includeRawContent: false,
    });

    console.log("[resolver] Tavily results count:", response.results?.length || 0);

    const candidates =
      response.results
        ?.map((result: any) => ({
          title: result.title,
          url: result.url,
          content: result.content,
          score: result.score,
        }))
        .filter((item: any) => item.url && isLikelyProductUrl(item.url)) || [];

    console.log("[resolver] Candidate URLs:", candidates.map((c: any) => c.url));

    const best = candidates[0];

    return JSON.stringify({
      originalUrl: googleProductUrl,
      isGoogleShoppingUrl: isGoogleShoppingUrl(googleProductUrl),
      resolvedUrl: best?.url || null,
      resolvedTitle: best?.title || null,
      candidates,
    });
  },
});