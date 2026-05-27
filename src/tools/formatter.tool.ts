import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { env } from "../config/env";
import { model } from "../config/llm";

function preview(value: unknown, maxLength = 1200) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  if (!text) return "";

  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function extractJsonObject(text: string) {
  console.log("[formatterTool] Extracting JSON from model output...");
  console.log("[formatterTool] Raw model output preview:", preview(text, 1500));

  const cleaned = text.replace(/```json/g, "").replace(/```/g, "").trim();
  const match = cleaned.match(/\{[\s\S]*\}/);

  if (!match) {
    console.error("[formatterTool] ❌ No JSON object found");
    console.error("[formatterTool] Cleaned output:", preview(cleaned, 3000));
    throw new Error("No JSON object found in model output");
  }

  try {
    return JSON.parse(match[0]);
  } catch (error) {
    console.error("[formatterTool] ❌ JSON.parse failed");
    console.error("[formatterTool] JSON candidate:", preview(match[0], 3000));
    throw error;
  }
}

export const productFormatterTool = new DynamicStructuredTool({
  name: "product_formatter",
  description: "Convert raw scraped product data into normalized product JSON.",
  schema: z.object({
    rawProduct: z.string(),
    fallbackProductUrl: z.string().optional(),
  }),
  func: async ({ rawProduct, fallbackProductUrl }) => {
    console.log("\n🧠 [formatterTool] START");
    console.log("[formatterTool] Has GOOGLE_API_KEY:", Boolean(env.GOOGLE_API_KEY));
    console.log("[formatterTool] Model: gemini-3.5-flash");
    console.log("[formatterTool] fallbackProductUrl:", fallbackProductUrl);
    console.log("[formatterTool] rawProduct length:", rawProduct.length);
    console.log("[formatterTool] rawProduct preview:", preview(rawProduct, 1000));

    const prompt = `
You are a strict product data formatter.

Convert this raw product data into this exact JSON shape:

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
- If productUrl is missing, use: ${fallbackProductUrl || ""}

Raw product:
${rawProduct}
`;

    try {
      console.log("[formatterTool] Calling Gemini model...");
      console.log("[formatterTool] Prompt length:", prompt.length);

      const result = await model.invoke(prompt);

      console.log("[formatterTool] ✅ Gemini response received");
      console.log("[formatterTool] Full result preview:", preview(result, 1500));

      const content =
        typeof result.content === "string"
          ? result.content
          : JSON.stringify(result.content);

      console.log("[formatterTool] Content preview:", preview(content, 1500));

      const parsed = extractJsonObject(content);

      console.log("[formatterTool] ✅ JSON extracted successfully");
      console.log("[formatterTool] Parsed product preview:", preview(parsed, 1500));

      return JSON.stringify(parsed);
    } catch (error) {
      console.error("[formatterTool] ❌ Failed");

      if (error instanceof Error) {
        console.error("[formatterTool] Error message:", error.message);
        console.error("[formatterTool] Error stack:", error.stack);
      } else {
        console.error("[formatterTool] Raw error:", error);
      }

      throw error;
    }
  },
});