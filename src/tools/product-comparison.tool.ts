import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { model } from "../config/llm";

function extractJsonObject(text: string) {
  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);

  if (!match) {
    throw new Error("No JSON object found in comparison output");
  }

  return JSON.parse(match[0]);
}

export const productComparisonTool = new DynamicStructuredTool({
  name: "product_comparison_generator",
  description:
    "Generate a structured product comparison from normalized product data.",
  schema: z.object({
    products: z.string(),
  }),
  func: async ({ products }) => {
    const prompt = `
You are an expert product comparison assistant.

Compare the given products and return strict JSON only.

Return this exact JSON shape:

{
  "title": string,
  "summary": string,
  "winner": {
    "productName": string,
    "reason": string
  },
  "bestFor": [
    {
      "label": string,
      "productName": string,
      "reason": string
    }
  ],
  "comparisonTable": [
    {
      "feature": string,
      "values": {
        "[productName]": string
      }
    }
  ],
  "insights": {
    "status": "COMPLETED",
    "totalProducts": number,
    "processedProducts": number,
    "failedProducts": number,
    "errorMessage": null,
    "isFavorite": false,
    "completedAt": string,
    "recommendation": string,
    "keyDifferences": string[],
    "priceVerdict": string,
    "qualityVerdict": string
  }
}

Rules:
- Return only JSON.
- No markdown.
- No explanation.
- Do not invent specs that are not present.
- If exact data is missing, say "Not available".
- Keep summary practical and user-friendly.
- title should be short, like "JBL Earbuds Comparison".
- recommendation should clearly tell which product is better and why.

Products:
${products}
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