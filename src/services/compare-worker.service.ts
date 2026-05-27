import { and, eq, inArray } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

import db from "../config/db";

import {
  compareProductsTable,
  compareTable,
  productsTable,
  searchesTable,
} from "../db/schema";

import type { ProductCompareJobData } from "../types/compare.types";

import { publishCompareEvent } from "../events/compare-event.publisher";

import { tavilyProductExtractTool } from "../tools/tavily-product-extract.tool";
import { productJsonParserTool } from "../tools/product-json-parser.tool";
import { productComparisonTool } from "../tools/product-comparison.tool";

const MAX_EXTRACTED_CONTENT_FOR_PARSER = 45_000;

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

function getDurationMs(start: number) {
  return Date.now() - start;
}

function truncate(value: unknown, maxLength: number) {
  if (value === null || value === undefined) return null;

  const text = String(value).trim();
  if (!text) return null;

  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function trimForParser(
  value: string,
  maxLength = MAX_EXTRACTED_CONTENT_FOR_PARSER,
) {
  if (!value) return "";

  if (value.length <= maxLength) return value;

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

function getInsightsValue(insights: unknown) {
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) {
    return {};
  }

  return insights as Record<string, any>;
}

function getStoreFromUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.replace("www.", "");

    if (hostname.includes("amazon")) return "Amazon";
    if (hostname.includes("flipkart")) return "Flipkart";

    return hostname;
  } catch {
    return null;
  }
}

function extractAmazonAsin(url: string) {
  const match = url.match(/\/dp\/([A-Z0-9]{10})/i);

  return match?.[1] || null;
}

function extractTitleFromTavilyRaw(raw: string) {
  try {
    const parsed = JSON.parse(raw);

    const title = parsed?.results?.[0]?.title;

    if (typeof title === "string" && title.trim()) {
      return title.trim();
    }

    return null;
  } catch {
    return null;
  }
}

function extractImageFromTavilyRaw(raw: string) {
  try {
    const parsed = JSON.parse(raw);
    const content = parsed?.results?.[0]?.rawContent;

    if (typeof content !== "string") return null;

    const imageMatch = content.match(/!\[[^\]]*]\((https?:\/\/[^)]+)\)/);

    if (!imageMatch?.[1]) return null;

    const imageUrl = imageMatch[1];

    if (imageUrl.includes("m.media-amazon.com")) {
      return imageUrl;
    }

    if (imageUrl.includes("amazon") || imageUrl.includes("media")) {
      return imageUrl;
    }

    return null;
  } catch {
    return null;
  }
}

async function getCompareOrThrow(compareId: string, userId: string) {
  console.log("🔎 Checking comparison row...");
  console.log("compareId:", compareId);
  console.log("userId:", userId);

  const [compare] = await db
    .select()
    .from(compareTable)
    .where(
      and(eq(compareTable.id, compareId), eq(compareTable.userId, userId)),
    );

  if (!compare) {
    throw new Error("Comparison not found");
  }

  console.log("✅ Comparison row found:", compare.id);

  return compare;
}

async function updateCompareInsights(
  compareId: string,
  values: Record<string, any>,
) {
  console.log("📝 Updating comparison insights...");
  console.log("compareId:", compareId);
  console.log("values:", preview(values, 1000));

  const [compare] = await db
    .select({
      insights: compareTable.insights,
    })
    .from(compareTable)
    .where(eq(compareTable.id, compareId));

  const currentInsights = getInsightsValue(compare?.insights);

  await db
    .update(compareTable)
    .set({
      insights: {
        ...currentInsights,
        ...values,
      },
    })
    .where(eq(compareTable.id, compareId));

  console.log("✅ Comparison insights updated");
}

async function updateCompareResult({
  compareId,
  title,
  summary,
  insights,
}: {
  compareId: string;
  title?: string | null;
  summary: string;
  insights: Record<string, any>;
}) {
  console.log("💾 Updating final comparison result...");
  console.log("compareId:", compareId);
  console.log("title:", title);
  console.log("summary preview:", preview(summary, 500));

  const [compare] = await db
    .select({
      insights: compareTable.insights,
    })
    .from(compareTable)
    .where(eq(compareTable.id, compareId));

  const currentInsights = getInsightsValue(compare?.insights);

  const updateValues: Partial<typeof compareTable.$inferInsert> = {
    summary: truncate(summary, 2048) || "Comparison completed.",
    insights: {
      ...currentInsights,
      ...insights,
      status: "COMPLETED",
      completedAt: new Date().toISOString(),
    },
  };

  const safeTitle = truncate(title, 255);

  if (safeTitle) {
    updateValues.title = safeTitle;
  }

  const updateStart = Date.now();

  await db
    .update(compareTable)
    .set(updateValues)
    .where(eq(compareTable.id, compareId));

  console.log(
    "⏱️ Final comparison update time:",
    getDurationMs(updateStart),
    "ms",
  );
  console.log("✅ Final comparison result updated");
}

function buildProductInsertFromParsed({
  compareId,
  product,
  productUrl,
}: {
  compareId: string;
  product: Record<string, any>;
  productUrl: string;
}) {
  return {
    id: uuidv4(),

    compareId,

    productName: truncate(product.productName, 255),
    brand: truncate(product.brand, 255),
    model: truncate(product.model, 255),

    price: truncate(product.price, 50),
    originalPrice: truncate(product.originalPrice, 50),
    savings: truncate(product.savings, 50),

    image: truncate(product.image, 1024),
    images: normalizeStringArray(product.images),

    rating: toNumber(product.rating),
    reviews: toInteger(product.reviews),

    productUrl: truncate(product.productUrl || productUrl, 1024),
    store: truncate(product.store, 255) || getStoreFromUrl(productUrl),
    asin: truncate(product.asin, 50) || extractAmazonAsin(productUrl),

    category: truncate(product.category, 1024),
    description: truncate(product.description, 2048),

    productInfo: normalizeProductInfo(product.productInfo),
    featureBullets: normalizeStringArray(product.featureBullets),

    pros: normalizeStringArray(product.pros),
    cons: normalizeStringArray(product.cons),

    createdAt: new Date(),
  };
}

function buildFallbackProductFromUrl({
  compareId,
  productUrl,
  title,
  extractedRaw,
}: {
  compareId: string;
  productUrl: string;
  title: string;
  extractedRaw?: string;
}) {
  const image = extractedRaw ? extractImageFromTavilyRaw(extractedRaw) : null;

  return {
    id: uuidv4(),

    compareId,

    productName: truncate(title, 255),
    brand: null,
    model: null,

    price: null,
    originalPrice: null,
    savings: null,

    image: truncate(image, 1024),
    images: image ? [image] : [],

    rating: null,
    reviews: null,

    productUrl: truncate(productUrl, 1024),
    store: getStoreFromUrl(productUrl),
    asin: extractAmazonAsin(productUrl),

    category: null,
    description: "Fallback product data saved because parser failed.",

    productInfo: {},
    featureBullets: [],

    pros: [],
    cons: [],

    createdAt: new Date(),
  };
}

async function loadExistingProducts({
  compareId,
  userId,
  productIds,
}: {
  compareId: string;
  userId: string;
  productIds: string[];
}) {
  console.log("\n📦 Loading existing products for comparison...");
  console.log("compareId:", compareId);
  console.log("productIds:", productIds);

  const loadStart = Date.now();

  const products = await db
    .select({
      id: productsTable.id,
      searchId: productsTable.searchId,
      compareId: productsTable.compareId,
      productName: productsTable.productName,
      brand: productsTable.brand,
      model: productsTable.model,
      price: productsTable.price,
      originalPrice: productsTable.originalPrice,
      savings: productsTable.savings,
      image: productsTable.image,
      images: productsTable.images,
      rating: productsTable.rating,
      reviews: productsTable.reviews,
      productUrl: productsTable.productUrl,
      store: productsTable.store,
      asin: productsTable.asin,
      category: productsTable.category,
      description: productsTable.description,
      productInfo: productsTable.productInfo,
      featureBullets: productsTable.featureBullets,
      pros: productsTable.pros,
      cons: productsTable.cons,
      createdAt: productsTable.createdAt,
    })
    .from(productsTable)
    .innerJoin(searchesTable, eq(productsTable.searchId, searchesTable.id))
    .where(
      and(
        inArray(productsTable.id, productIds),
        eq(searchesTable.userId, userId),
      ),
    );

  console.log(
    "⏱️ Existing products load time:",
    getDurationMs(loadStart),
    "ms",
  );
  console.log("✅ Existing products loaded:", products.length);

  if (products.length !== productIds.length) {
    console.error("❌ Existing product count mismatch");
    console.error("Expected:", productIds.length);
    console.error("Found:", products.length);

    throw new Error("Some products are invalid or not accessible");
  }

  await publishCompareEvent({
    type: "COMPARE_PRODUCTS_LOADED",
    compareId,
    total: products.length,
    processed: products.length,
    failed: 0,
    message: `${products.length} products loaded from existing search results`,
  });

  return products;
}

async function extractProductsFromUrls({
  compareId,
  productUrls,
}: {
  compareId: string;
  productUrls: string[];
}) {
  console.log("\n📄 Extracting products from URLs...");
  console.log("compareId:", compareId);
  console.log("total URLs:", productUrls.length);
  console.log("URLs:", productUrls);

  const products: Array<typeof productsTable.$inferSelect> = [];

  let processed = 0;
  let failed = 0;

  for (let index = 0; index < productUrls.length; index++) {
    const productUrl = productUrls[index];

    let extractedRaw = "";
    let fallbackTitle = "Product";

    console.log("\n----------------------------------------");
    console.log(`⚖️ COMPARISON PRODUCT ${index + 1}/${productUrls.length}`);
    console.log("----------------------------------------");
    console.log("URL:", productUrl);

    try {
      await publishCompareEvent({
        type: "COMPARE_PRODUCT_EXTRACTION_STARTED",
        compareId,
        total: productUrls.length,
        processed,
        failed,
        message: `Extracting product ${index + 1}/${productUrls.length}`,
      });

      console.log("📄 Calling Tavily extract tool...");

      const extractStart = Date.now();

      extractedRaw = await tavilyProductExtractTool.invoke({
        url: productUrl,
      });

      console.log("⏱️ Tavily extract time:", getDurationMs(extractStart), "ms");
      console.log("📦 Tavily extract size:", extractedRaw.length, "chars");
      console.log("✅ Tavily extract received");
      console.log("Extract preview:", preview(extractedRaw, 1000));

      fallbackTitle = extractTitleFromTavilyRaw(extractedRaw) || "Product";

      console.log("Fallback title:", fallbackTitle);

      const parserInput = trimForParser(extractedRaw);

      console.log("🧠 Parsing extracted product...");
      console.log("📦 Parser input size:", parserInput.length, "chars");

      const parserStart = Date.now();

      const parsedRaw = await productJsonParserTool.invoke({
        extractedContent: parserInput,
        fallbackProduct: JSON.stringify({
          title: fallbackTitle,
          productUrl,
        }),
        resolvedUrl: productUrl,
      });

      console.log("⏱️ Parser time:", getDurationMs(parserStart), "ms");
      console.log("✅ Parser raw response:", preview(parsedRaw, 1500));

      let parsedProduct: Record<string, any>;

      try {
        parsedProduct = JSON.parse(parsedRaw);
      } catch (parseError) {
        console.error("❌ Failed to JSON.parse parser output");
        console.error("Parser output:", preview(parsedRaw, 2500));
        throw parseError;
      }

      console.log("✅ Parsed product JSON");
      console.log("Product name:", parsedProduct.productName);
      console.log("Price:", parsedProduct.price);
      console.log("Store:", parsedProduct.store);

      const productInsert = buildProductInsertFromParsed({
        compareId,
        product: parsedProduct,
        productUrl,
      });

      console.log("💾 Saving comparison product...");
      console.log("Product insert preview:", preview(productInsert, 1500));

      const dbStart = Date.now();

      await db.insert(productsTable).values(productInsert);

      await db.insert(compareProductsTable).values({
        id: uuidv4(),
        compareId,
        productId: productInsert.id,
      });

      console.log("⏱️ Product DB save time:", getDurationMs(dbStart), "ms");

      processed++;

      products.push(productInsert as typeof productsTable.$inferSelect);

      await updateCompareInsights(compareId, {
        status: "PROCESSING",
        processedProducts: processed,
        failedProducts: failed,
      });

      await publishCompareEvent({
        type: "COMPARE_PRODUCT_EXTRACTED",
        compareId,
        total: productUrls.length,
        processed,
        failed,
        product: productInsert,
        message: `${processed}/${productUrls.length} products extracted`,
      });

      console.log("✅ Comparison product saved:", productInsert.id);
    } catch (error) {
      failed++;

      console.error("\n❌ COMPARISON PRODUCT EXTRACTION FAILED");
      console.error("Product index:", index + 1);
      console.error("URL:", productUrl);
      console.error("Error message:", getErrorMessage(error));
      console.error("Error stack:", getErrorStack(error));

      try {
        console.log("💾 Saving fallback comparison product...");

        const fallbackProductInsert = buildFallbackProductFromUrl({
          compareId,
          productUrl,
          title: fallbackTitle,
          extractedRaw,
        });

        console.log(
          "Fallback product insert preview:",
          preview(fallbackProductInsert, 1500),
        );

        const fallbackDbStart = Date.now();

        await db.insert(productsTable).values(fallbackProductInsert);

        await db.insert(compareProductsTable).values({
          id: uuidv4(),
          compareId,
          productId: fallbackProductInsert.id,
        });

        console.log(
          "⏱️ Fallback DB save time:",
          getDurationMs(fallbackDbStart),
          "ms",
        );

        processed++;

        products.push(
          fallbackProductInsert as unknown as typeof productsTable.$inferSelect,
        );

        await updateCompareInsights(compareId, {
          status: "PROCESSING",
          processedProducts: processed,
          failedProducts: failed,
          errorMessage: getErrorMessage(error),
        });

        await publishCompareEvent({
          type: "COMPARE_PRODUCT_EXTRACTED",
          compareId,
          total: productUrls.length,
          processed,
          failed,
          product: fallbackProductInsert,
          message: `${processed}/${productUrls.length} products extracted with fallback data`,
        });

        console.log(
          "✅ Fallback comparison product saved:",
          fallbackProductInsert.id,
        );
      } catch (fallbackError) {
        console.error("❌ Failed to save fallback comparison product");
        console.error("Fallback error:", getErrorMessage(fallbackError));
        console.error("Fallback stack:", getErrorStack(fallbackError));

        await updateCompareInsights(compareId, {
          status: "PROCESSING",
          processedProducts: processed,
          failedProducts: failed,
          errorMessage: getErrorMessage(fallbackError),
        });

        await publishCompareEvent({
          type: "COMPARE_PRODUCT_FAILED",
          compareId,
          total: productUrls.length,
          processed,
          failed,
          error: getErrorMessage(error),
        });
      }
    }
  }

  console.log("\n📊 Product extraction summary");
  console.log("Total URLs:", productUrls.length);
  console.log("Saved products:", products.length);
  console.log("Processed:", processed);
  console.log("Failed:", failed);

  if (products.length < 2) {
    throw new Error(
      `At least 2 products are required to generate comparison. Only ${products.length} product(s) were saved.`,
    );
  }

  return {
    products,
    processed,
    failed,
  };
}

function buildComparisonInput(products: unknown[]) {
  return products.map((product: any) => ({
    id: product.id,
    productName: product.productName,
    brand: product.brand,
    model: product.model,
    price: product.price,
    originalPrice: product.originalPrice,
    savings: product.savings,
    rating: product.rating,
    reviews: product.reviews,
    store: product.store,
    category: product.category,
    description: product.description,
    productInfo: product.productInfo,
    featureBullets: product.featureBullets,
    pros: product.pros,
    cons: product.cons,
    productUrl: product.productUrl,
  }));
}

export async function runProductCompareJob(data: ProductCompareJobData) {
  const { compareId, userId, source, productIds = [], productUrls = [] } = data;

  console.log("\n========================================");
  console.log("⚖️ runProductCompareJob START");
  console.log("========================================");
  console.log("compareId:", compareId);
  console.log("userId:", userId);
  console.log("source:", source);
  console.log("productIds:", productIds);
  console.log("productUrls:", productUrls);

  let total = 0;
  let processed = 0;
  let failed = 0;

  try {
    const compare = await getCompareOrThrow(compareId, userId);

    console.log("📝 Setting comparison status to PROCESSING...");

    await updateCompareInsights(compareId, {
      status: "PROCESSING",
      errorMessage: null,
      completedAt: null,
    });

    await publishCompareEvent({
      type: "COMPARE_STARTED",
      compareId,
      message: "Comparison started...",
    });

    let products: unknown[] = [];

    switch (source) {
      case "EXISTING_PRODUCTS": {
        console.log("\n📦 Source: EXISTING_PRODUCTS");

        total = productIds.length;

        if (productIds.length < 2) {
          throw new Error("At least 2 productIds are required");
        }

        products = await loadExistingProducts({
          compareId,
          userId,
          productIds,
        });

        processed = products.length;
        failed = 0;

        await updateCompareInsights(compareId, {
          status: "PROCESSING",
          totalProducts: total,
          processedProducts: processed,
          failedProducts: failed,
        });

        break;
      }

      case "PRODUCT_URLS": {
        console.log("\n🔗 Source: PRODUCT_URLS");

        total = productUrls.length;

        if (productUrls.length < 2) {
          throw new Error("At least 2 productUrls are required");
        }

        const result = await extractProductsFromUrls({
          compareId,
          productUrls,
        });

        products = result.products;
        processed = result.processed;
        failed = result.failed;

        await updateCompareInsights(compareId, {
          status: "PROCESSING",
          totalProducts: total,
          processedProducts: processed,
          failedProducts: failed,
        });

        break;
      }

      default: {
        throw new Error("Invalid comparison source");
      }
    }

    console.log("\n🧠 Starting AI comparison generation...");
    console.log("Products for comparison:", products.length);

    await publishCompareEvent({
      type: "COMPARE_ANALYSIS_STARTED",
      compareId,
      total,
      processed,
      failed,
      message: "Generating AI comparison...",
    });

    const comparisonInput = buildComparisonInput(products);

    console.log("Comparison input preview:", preview(comparisonInput, 2500));

    const comparisonStart = Date.now();

    const comparisonRaw = await productComparisonTool.invoke({
      products: JSON.stringify(comparisonInput, null, 2),
    });

    console.log(
      "⏱️ Comparison AI generation time:",
      getDurationMs(comparisonStart),
      "ms",
    );
    console.log("✅ Comparison raw response:", preview(comparisonRaw, 2500));

    let comparison: Record<string, any>;

    try {
      comparison = JSON.parse(comparisonRaw);
    } catch (error) {
      console.error("❌ Failed to parse comparison AI output");
      console.error("Comparison raw:", preview(comparisonRaw, 3000));
      throw error;
    }

    const finalInsights = {
      ...getInsightsValue(compare.insights),
      ...(comparison.insights || {}),
      source,
      status: "COMPLETED",
      totalProducts: total,
      processedProducts: processed,
      failedProducts: failed,
      errorMessage: failed > 0 ? `${failed} products failed` : null,
      completedAt: new Date().toISOString(),
      comparisonTable: comparison.comparisonTable || [],
      winner: comparison.winner || null,
      bestFor: comparison.bestFor || [],
    };

    await updateCompareResult({
      compareId,
      title: comparison.title,
      summary: comparison.summary || "Comparison completed.",
      insights: finalInsights,
    });

    await publishCompareEvent({
      type: "COMPARE_COMPLETED",
      compareId,
      total,
      processed,
      failed,
      message: "Comparison completed successfully",
    });

    console.log("\n========================================");
    console.log("✅ runProductCompareJob COMPLETED");
    console.log("========================================");
    console.log("compareId:", compareId);
    console.log("total:", total);
    console.log("processed:", processed);
    console.log("failed:", failed);
  } catch (error) {
    console.error("\n========================================");
    console.error("❌ runProductCompareJob MAIN FAILURE");
    console.error("========================================");
    console.error("compareId:", compareId);
    console.error("source:", source);
    console.error("Error message:", getErrorMessage(error));
    console.error("Error stack:", getErrorStack(error));

    await updateCompareInsights(compareId, {
      status: "FAILED",
      totalProducts: total,
      processedProducts: processed,
      failedProducts: failed,
      errorMessage: getErrorMessage(error),
      completedAt: new Date().toISOString(),
    });

    await publishCompareEvent({
      type: "COMPARE_FAILED",
      compareId,
      error: getErrorMessage(error),
      message: "Comparison failed",
    });

    throw error;
  }
}
