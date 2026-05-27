import { v4 as uuidv4 } from "uuid";
import { eq } from "drizzle-orm";

import type { ProductSearchJobData } from "../types/search.types";
import db from "../config/db";

import { productsTable, searchesTable } from "../db/schema";

import { publishSearchEvent } from "../events/search-event.publisher";
import { tavilyUrlResolverTool } from "../tools/tavily-url-resolver.tool";
import { tavilyProductExtractTool } from "../tools/tavily-product-extract.tool";
import { productJsonParserTool } from "../tools/product-json-parser.tool";
import { serpApiSearchTool } from "../tools/serpapi.tool";
import { generateSearchTitle } from "../helper/generate-title";

const MAX_PRODUCTS_TO_PROCESS = 3;
const SERP_API_LIMIT = 10;
const MAX_EXTRACTED_CONTENT_FOR_PARSER = 45_000;

function isValidURL(input?: string): input is string {
  if (!input) return false;

  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

function isGoogleShoppingUrl(url?: string) {
  if (!url) return false;
  return url.includes("google.com/search") || url.includes("ibp=oshop");
}

function preview(value: unknown, maxLength = 2000) {
  const text =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);

  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Unknown error";
}

function getErrorStack(error: unknown) {
  if (error instanceof Error) return error.stack;
  return undefined;
}

function truncate(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (!text) return null;

  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function trimForParser(
  value: string,
  maxLength = MAX_EXTRACTED_CONTENT_FOR_PARSER
) {
  if (!value) return "";

  if (value.length <= maxLength) {
    return value;
  }

  return value.slice(0, maxLength);
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d.]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function toInteger(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }

  if (typeof value === "string") {
    const cleaned = value.replace(/[^\d]/g, "");
    const parsed = Number(cleaned);

    if (Number.isFinite(parsed)) return Math.floor(parsed);
  }

  return null;
}

function normalizeStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.map((item) => truncate(item, 2048)).filter(Boolean) as string[];
}

function normalizeProductInfo(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, string> = {};

  Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
    if (!key || item === null || item === undefined) return;

    result[key] = String(item);
  });

  return result;
}

function getDurationMs(start: number) {
  return Date.now() - start;
}

async function updateSearch(
  searchId: string,
  values: Partial<typeof searchesTable.$inferInsert>
) {
  await db
    .update(searchesTable)
    .set({
      ...values,
      updatedAt: new Date(),
    })
    .where(eq(searchesTable.id, searchId));
}

function buildFallbackProduct(item: any, searchId: string, url: string) {
  return {
    id: uuidv4(),
    searchId,

    productName: truncate(item.title, 255),
    brand: null,
    model: null,

    price: truncate(item.price, 50),
    originalPrice: null,
    savings: null,

    image: truncate(item.thumbnail, 1024),
    images: item.thumbnail ? [item.thumbnail] : [],

    rating: toNumber(item.rating),
    reviews: toInteger(item.reviews),

    productUrl: truncate(url, 1024),
    store: truncate(item.source, 255),
    asin: null,

    category: null,
    description: null,

    productInfo: {},
    featureBullets: [],

    pros: [],
    cons: [],

    createdAt: new Date(),
  };
}

function buildProductInsert({
  productId,
  searchId,
  product,
  item,
  finalProductUrl,
  originalUrl,
}: {
  productId: string;
  searchId: string;
  product: Record<string, any>;
  item: any;
  finalProductUrl: string;
  originalUrl: string;
}) {
  return {
    id: productId,
    searchId,

    productName: truncate(product.productName || item.title, 255),
    brand: truncate(product.brand, 255),
    model: truncate(product.model, 255),

    price: truncate(product.price || item.price, 50),
    originalPrice: truncate(product.originalPrice, 50),
    savings: truncate(product.savings, 50),

    image: truncate(product.image || item.thumbnail, 1024),
    images: normalizeStringArray(
      product.images || (item.thumbnail ? [item.thumbnail] : [])
    ),

    rating: toNumber(product.rating ?? item.rating),
    reviews: toInteger(product.reviews ?? item.reviews),

    productUrl: truncate(
      product.productUrl || finalProductUrl || originalUrl,
      1024
    ),

    store: truncate(product.store || item.source, 255),
    asin: truncate(product.asin, 50),

    category: truncate(product.category, 1024),
    description: truncate(product.description, 2048),

    productInfo: normalizeProductInfo(product.productInfo),
    featureBullets: normalizeStringArray(product.featureBullets),

    pros: normalizeStringArray(product.pros),
    cons: normalizeStringArray(product.cons),

    createdAt: new Date(),
  };
}

export async function runProductSearchJob(data: ProductSearchJobData) {
  const { searchId, query, filters } = data as ProductSearchJobData & {
    filters?: Record<string, string | number | boolean | string[]>;
  };

  console.log("\n========================================");
  console.log("🔍 runProductSearchJob START");
  console.log("========================================");
  console.log("searchId:", searchId);
  console.log("query:", query);

  let processed = 0;
  let failed = 0;
  let total = 0;

  try {
    await updateSearch(searchId, {
      status: "PROCESSING",
      totalProductsFound: 0,
      processedProducts: 0,
      failedProducts: 0,
      errorMessage: null,
      completedAt: null,
    });

    await publishSearchEvent({
      type: "SEARCH_STARTED",
      searchId,
      message: "Searching products...",
    });

    try {
      console.log("\n📝 Generating search title...");

      const titleStart = Date.now();
      const generatedTitle = await generateSearchTitle(query, filters);

      console.log("⏱️ Title generation time:", getDurationMs(titleStart), "ms");

      if (generatedTitle) {
        await updateSearch(searchId, {
          title: generatedTitle,
        });

        console.log("✅ Search title updated:", generatedTitle);
      }
    } catch (titleError) {
      console.error(
        "⚠️ Search title generation failed:",
        getErrorMessage(titleError)
      );
    }

    console.log("\n🔎 Calling SerpAPI tool...");

    const serpStart = Date.now();

    const serpRaw = await serpApiSearchTool.invoke({
      query,
      limit: SERP_API_LIMIT,
    });

    console.log("⏱️ SerpAPI time:", getDurationMs(serpStart), "ms");
    console.log("✅ SerpAPI raw response received");
    console.log("SerpAPI raw preview:", preview(serpRaw, 800));

    let shoppingResults: Array<{
      title?: string;
      price?: string;
      source?: string;
      rating?: number;
      reviews?: number;
      thumbnail?: string;
      product_link?: string;
      link?: string;
    }> = [];

    try {
      shoppingResults = JSON.parse(serpRaw);
    } catch (error) {
      console.error("❌ Failed to parse SerpAPI output");
      console.error("Raw SerpAPI output:", preview(serpRaw, 1500));
      throw error;
    }

    const limitedResults = shoppingResults.slice(0, MAX_PRODUCTS_TO_PROCESS);
    total = limitedResults.length;

    console.log("✅ Parsed shopping results:", shoppingResults.length);
    console.log(`🧪 Processing only ${total} products`);

    await updateSearch(searchId, {
      status: "PROCESSING",
      totalProductsFound: total,
      processedProducts: 0,
      failedProducts: 0,
      errorMessage: null,
    });

    await publishSearchEvent({
      type: "PRODUCTS_FOUND",
      searchId,
      total,
      processed: 0,
      message: `${total} products found`,
    });

    for (let index = 0; index < limitedResults.length; index++) {
      const item = limitedResults[index];
      const originalUrl = item.product_link || item.link;

      console.log("\n----------------------------------------");
      console.log(`📦 PRODUCT ${index + 1}/${total}`);
      console.log("----------------------------------------");
      console.log("Title:", item.title);
      console.log("Source:", item.source);
      console.log("Price:", item.price);
      console.log("Original URL:", originalUrl);

      if (!isValidURL(originalUrl)) {
        failed++;

        await updateSearch(searchId, {
          status: "PROCESSING",
          processedProducts: processed,
          failedProducts: failed,
          totalProductsFound: total,
          errorMessage: "Invalid product URL",
        });

        await publishSearchEvent({
          type: "PRODUCT_FAILED",
          searchId,
          processed,
          total,
          failed,
          error: "Invalid product URL",
        });

        continue;
      }

      try {
        await publishSearchEvent({
          type: "PRODUCT_SCRAPING_STARTED",
          searchId,
          processed,
          total,
          message: `Processing ${item.title || "product"}...`,
        });

        let finalProductUrl = originalUrl;
        let product: any = null;

        if (isGoogleShoppingUrl(originalUrl)) {
          console.log("⚠️ Google Shopping URL detected");
          console.log("🔗 Resolving real product URL with Tavily...");

          const resolverStart = Date.now();

          const resolverRaw = await tavilyUrlResolverTool.invoke({
            title: item.title || "",
            source: item.source || "",
            price: item.price || "",
            googleProductUrl: originalUrl,
          });

          console.log(
            "⏱️ Tavily resolver time:",
            getDurationMs(resolverStart),
            "ms"
          );
          console.log("✅ Tavily resolver raw:", preview(resolverRaw, 1000));

          let resolverResult: any = {};

          try {
            resolverResult = JSON.parse(resolverRaw);
          } catch (error) {
            console.error("❌ Failed to parse resolver result");
            console.error("Resolver raw:", preview(resolverRaw, 1500));
          }

          if (
            resolverResult?.resolvedUrl &&
            isValidURL(resolverResult.resolvedUrl)
          ) {
            finalProductUrl = resolverResult.resolvedUrl;
            console.log("✅ Resolved real product URL:", finalProductUrl);
          } else {
            console.log("⚠️ No real product URL resolved");
            console.log("✅ Using fallback SerpAPI product data");

            product = {
              productName: item.title || null,
              brand: null,
              model: null,
              price: item.price || null,
              originalPrice: null,
              savings: null,
              image: item.thumbnail || null,
              images: item.thumbnail ? [item.thumbnail] : [],
              rating: item.rating || null,
              reviews: item.reviews || null,
              store: item.source || null,
              productUrl: finalProductUrl || originalUrl,
              asin: null,
              category: null,
              description: null,
              productInfo: {},
              featureBullets: [],
              pros: [],
              cons: [],
            };
          }
        }

        if (!product) {
          console.log("📄 Extracting product page with Tavily...");
          console.log("Extract URL:", finalProductUrl);

          const extractStart = Date.now();

          const extractedRaw = await tavilyProductExtractTool.invoke({
            url: finalProductUrl,
          });

          console.log(
            "⏱️ Tavily extract time:",
            getDurationMs(extractStart),
            "ms"
          );
          console.log("📦 Tavily extract size:", extractedRaw.length, "chars");
          console.log("✅ Tavily extract received");
          console.log("Extract preview:", preview(extractedRaw, 1000));

          const parserInput = trimForParser(extractedRaw);

          console.log("🧠 Parsing extracted data into product JSON...");
          console.log("📦 Parser input size:", parserInput.length, "chars");

          const parserStart = Date.now();

          const parsedRaw = await productJsonParserTool.invoke({
            extractedContent: parserInput,
            fallbackProduct: JSON.stringify(item),
            resolvedUrl: finalProductUrl,
          });

          console.log("⏱️ Parser time:", getDurationMs(parserStart), "ms");
          console.log("✅ Product JSON parser response:", preview(parsedRaw, 1200));

          try {
            product = JSON.parse(parsedRaw);
          } catch (error) {
            console.error("❌ Failed to parse product parser output");
            console.error("Parser raw:", preview(parsedRaw, 2500));
            throw error;
          }
        }

        const productId = uuidv4();

        const productInsert = buildProductInsert({
          productId,
          searchId,
          product,
          item,
          finalProductUrl,
          originalUrl,
        });

        console.log("💾 Inserting product into DB...");
        console.log("Product insert preview:", preview(productInsert, 1500));

        const dbStart = Date.now();

        await db.insert(productsTable).values(productInsert);

        console.log("⏱️ DB save time:", getDurationMs(dbStart), "ms");

        processed++;

        await updateSearch(searchId, {
          status: "PROCESSING",
          processedProducts: processed,
          failedProducts: failed,
          totalProductsFound: total,
          errorMessage: null,
        });

        await publishSearchEvent({
          type: "PRODUCT_SAVED",
          searchId,
          processed,
          total,
          failed,
          product: productInsert,
          message: `${processed}/${total} products processed`,
        });

        console.log("✅ Product saved:", productId);
      } catch (error) {
        failed++;

        console.error("\n❌ PRODUCT PROCESSING FAILED");
        console.error("Product index:", index + 1);
        console.error("Product title:", item.title);
        console.error("Error message:", getErrorMessage(error));
        console.error("Error stack:", getErrorStack(error));

        const fallbackProductInsert = buildFallbackProduct(
          item,
          searchId,
          originalUrl
        );

        try {
          console.log("💾 Saving fallback product...");

          const dbStart = Date.now();

          await db.insert(productsTable).values(fallbackProductInsert);

          console.log("⏱️ Fallback DB save time:", getDurationMs(dbStart), "ms");

          processed++;

          await updateSearch(searchId, {
            status: "PROCESSING",
            processedProducts: processed,
            failedProducts: failed,
            totalProductsFound: total,
            errorMessage: getErrorMessage(error),
          });

          await publishSearchEvent({
            type: "PRODUCT_SAVED",
            searchId,
            processed,
            total,
            failed,
            product: fallbackProductInsert,
            message: `${processed}/${total} products processed with fallback data`,
          });

          console.log("✅ Fallback product saved");
        } catch (fallbackError) {
          console.error("❌ Failed to save fallback product");
          console.error("Fallback error:", getErrorMessage(fallbackError));

          await updateSearch(searchId, {
            status: "PROCESSING",
            processedProducts: processed,
            failedProducts: failed,
            totalProductsFound: total,
            errorMessage: getErrorMessage(fallbackError),
          });

          await publishSearchEvent({
            type: "PRODUCT_FAILED",
            searchId,
            processed,
            total,
            failed,
            error: getErrorMessage(error),
          });
        }
      }
    }

    await updateSearch(searchId, {
      status: "COMPLETED",
      processedProducts: processed,
      failedProducts: failed,
      totalProductsFound: total,
      errorMessage: failed > 0 ? `${failed} products failed` : null,
      completedAt: new Date(),
    });

    await publishSearchEvent({
      type: "SEARCH_COMPLETED",
      searchId,
      processed,
      total,
      failed,
      message: `Search completed. ${processed} saved, ${failed} failed.`,
    });

    console.log("✅ SEARCH_COMPLETED event published");
  } catch (error) {
    console.error("\n❌ runProductSearchJob MAIN FAILURE");
    console.error("searchId:", searchId);
    console.error("query:", query);
    console.error("Error message:", getErrorMessage(error));
    console.error("Error stack:", getErrorStack(error));

    await updateSearch(searchId, {
      status: "FAILED",
      processedProducts: processed,
      failedProducts: failed,
      totalProductsFound: total,
      errorMessage: getErrorMessage(error),
      completedAt: new Date(),
    });

    await publishSearchEvent({
      type: "SEARCH_FAILED",
      searchId,
      error: getErrorMessage(error),
      message: "Search failed",
    });

    throw error;
  }
}