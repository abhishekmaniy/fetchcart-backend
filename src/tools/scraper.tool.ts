import axios from "axios";
import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { env } from "../config/env";

function getAxiosErrorDetails(error: unknown) {
  if (axios.isAxiosError(error)) {
    return {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data:
        typeof error.response?.data === "string"
          ? error.response.data.slice(0, 1000)
          : error.response?.data,
      url: error.config?.url,
      params: error.config?.params,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: "Unknown error",
    raw: error,
  };
}

export const scraperApiTool = new DynamicStructuredTool({
  name: "scraperapi_product_scraper",
  description: "Scrape a product page and return raw product data.",
  schema: z.object({
    url: z.string().url(),
  }),
  func: async ({ url }) => {
    console.log("\n🕷️ [scraperApiTool] START");
    console.log("[scraperApiTool] URL:", url);
    console.log("[scraperApiTool] Has SCRAPER_API:", Boolean(env.SCRAPER_API));

    try {
      const response = await axios.get("https://api.scraperapi.com/", {
        params: {
          api_key: env.SCRAPER_API,
          url,
          output_format: "json",
          autoparse: true,
          device_type: "desktop",
          country_code: "in",
        },
        timeout: 60_000,
      });

      console.log("[scraperApiTool] ✅ Success");
      console.log("[scraperApiTool] Status:", response.status);
      console.log(
        "[scraperApiTool] Response type:",
        typeof response.data,
        Array.isArray(response.data) ? "array" : ""
      );

      const stringified = JSON.stringify(response.data);

      console.log("[scraperApiTool] Response length:", stringified.length);
      console.log(
        "[scraperApiTool] Response preview:",
        stringified.slice(0, 1200)
      );

      return stringified;
    } catch (error) {
      const details = getAxiosErrorDetails(error);

      console.error("[scraperApiTool] ❌ Failed");
      console.error("[scraperApiTool] Details:", JSON.stringify(details, null, 2));

      throw error;
    }
  },
});