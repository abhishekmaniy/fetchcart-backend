import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { model } from "../config/llm";

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("No JSON object found in product parser output");
  }

  return JSON.parse(match[0]);
}

export const productJsonParserTool = new DynamicStructuredTool({
  name: "product_json_parser",
  description:
    "Convert extracted raw product page content into strict normalized product JSON.",
  schema: z.object({
    extractedContent: z.string(),
    fallbackProduct: z.string(),
    resolvedUrl: z.string().optional(),
  }),
  func: async ({ extractedContent, fallbackProduct, resolvedUrl }) => {
    console.log("\n🧠 [productJsonParserTool] START");
    console.log("[parser] extractedContent length:", extractedContent.length);
    console.log("[parser] resolvedUrl:", resolvedUrl);

    const prompt = `
You are a strict product data parser.

Use the extracted product page content and fallback product data to create this exact JSON:

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

Rules:
- Return only JSON.
- No markdown.
- No explanation.
- Prefer extracted page content.
- Use fallback data when extracted content is missing.
- Use this productUrl if valid: ${resolvedUrl || ""}

Fallback product:
${fallbackProduct}

Extracted content:
${extractedContent}
`;

    const result = await model.invoke(prompt);

    const content =
      typeof result.content === "string"
        ? result.content
        : JSON.stringify(result.content);

    const parsed = extractJsonObject(content);

    return JSON.stringify(parsed);
  },
});