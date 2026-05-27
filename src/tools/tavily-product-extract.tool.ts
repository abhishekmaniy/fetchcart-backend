import { tavily } from "@tavily/core";
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { env } from "../config/env";

const client = tavily({ apiKey: env.TAVILY_API_KEY });

function preview(value: unknown, maxLength = 1500) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

export const tavilyProductExtractTool = new DynamicStructuredTool({
  name: "tavily_product_extract",
  description:
    "Extract product page content from a real ecommerce product URL using Tavily Extract.",
  schema: z.object({
    url: z.string().url(),
  }),
  func: async ({ url }) => {
    console.log("\n📄 [tavilyProductExtractTool] START");
    console.log("[extract] url:", url);

    const response = await client.extract([url], {
      extractDepth: "advanced",
      format: "markdown",
    });

    console.log("[extract] Raw response preview:", preview(response, 2000));

    return JSON.stringify(response);
  },
});