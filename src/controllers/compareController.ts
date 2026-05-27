import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

import db from "../config/db";
import {
  compareProductsTable,
  compareTable,
  productsTable,
  searchesTable,
} from "../db/schema";
import { productCompareQueue } from "../queues/compare.queue";

type CompareSource = "EXISTING_PRODUCTS" | "PRODUCT_URLS";
type CompareHistoryFilter = "all" | "recent" | "favorites";

function isValidUrl(value: string) {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function normalizeProductUrls(productUrls: unknown) {
  if (!Array.isArray(productUrls)) return [];

  return productUrls
    .filter((url): url is string => typeof url === "string")
    .map((url) => url.trim())
    .filter(Boolean)
    .filter(isValidUrl);
}

function normalizeProductIds(productIds: unknown) {
  if (!Array.isArray(productIds)) return [];

  return productIds
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter(Boolean);
}

function buildFallbackCompareTitle({
  source,
  productCount,
}: {
  source: CompareSource;
  productCount: number;
}) {
  if (source === "EXISTING_PRODUCTS") {
    return `${productCount} selected products comparison`;
  }

  return `${productCount} product URLs comparison`;
}

function buildInitialInsights({
  source,
  totalProducts,
}: {
  source: CompareSource;
  totalProducts: number;
}) {
  return {
    source,
    status: "QUEUED",
    totalProducts,
    processedProducts: 0,
    failedProducts: 0,
    errorMessage: null,
    isFavorite: false,
    completedAt: null,
  };
}

function getInsightsValue(insights: unknown) {
  if (!insights || typeof insights !== "object" || Array.isArray(insights)) {
    return {};
  }

  return insights as Record<string, any>;
}

export const createCompareJob = async (req: Request, res: Response) => {
  try {
    const { source, productIds, productUrls } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    if (source !== "EXISTING_PRODUCTS" && source !== "PRODUCT_URLS") {
      return res.status(400).json({
        error: "Invalid comparison source",
      });
    }

    const compareId = uuidv4();
    const createdAt = new Date();

    if (source === "EXISTING_PRODUCTS") {
      const validProductIds = normalizeProductIds(productIds);

      if (validProductIds.length < 2) {
        return res.status(400).json({
          error: "At least 2 products are required for comparison",
        });
      }

      if (validProductIds.length > 4) {
        return res.status(400).json({
          error: "You can compare maximum 4 products",
        });
      }

      const ownedProducts = await db
        .select({
          id: productsTable.id,
          productUrl: productsTable.productUrl,
          productName: productsTable.productName,
        })
        .from(productsTable)
        .innerJoin(searchesTable, eq(productsTable.searchId, searchesTable.id))
        .where(
          and(
            inArray(productsTable.id, validProductIds),
            eq(searchesTable.userId, userId),
          ),
        );

      if (ownedProducts.length !== validProductIds.length) {
        return res.status(403).json({
          error: "Some selected products are invalid or not accessible",
        });
      }

      const urls = ownedProducts
        .map((product) => product.productUrl)
        .filter((url): url is string => Boolean(url));

      const fallbackTitle = buildFallbackCompareTitle({
        source,
        productCount: ownedProducts.length,
      });

      await db.insert(compareTable).values({
        id: compareId,
        userId,
        title: fallbackTitle,
        productUrl: urls,
        summary: "Comparison is being generated...",
        insights: buildInitialInsights({
          source,
          totalProducts: ownedProducts.length,
        }),
        createdAt,
      });

      await db.insert(compareProductsTable).values(
        ownedProducts.map((product) => ({
          id: uuidv4(),
          compareId,
          productId: product.id,
        })),
      );

      await productCompareQueue.add("product-compare", {
        compareId,
        userId,
        source,
        productIds: validProductIds,
      });

      return res.status(202).json({
        message: "Comparison job created successfully",
        compare: {
          id: compareId,
          title: fallbackTitle,
          source,
          status: "QUEUED",
          productIds: validProductIds,
          createdAt: createdAt.toISOString(),
        },
      });
    }

    const validProductUrls = normalizeProductUrls(productUrls);

    if (validProductUrls.length < 2) {
      return res.status(400).json({
        error: "At least 2 valid product URLs are required for comparison",
      });
    }

    if (validProductUrls.length > 4) {
      return res.status(400).json({
        error: "You can compare maximum 4 products",
      });
    }

    const fallbackTitle = buildFallbackCompareTitle({
      source,
      productCount: validProductUrls.length,
    });

    await db.insert(compareTable).values({
      id: compareId,
      userId,
      title: fallbackTitle,
      productUrl: validProductUrls,
      summary: "Comparison is being generated...",
      insights: buildInitialInsights({
        source,
        totalProducts: validProductUrls.length,
      }),
      createdAt,
    });

    await productCompareQueue.add("product-compare", {
      compareId,
      userId,
      source,
      productUrls: validProductUrls,
    });

    return res.status(202).json({
      message: "Comparison job created successfully",
      compare: {
        id: compareId,
        title: fallbackTitle,
        source,
        status: "QUEUED",
        productUrls: validProductUrls,
        createdAt: createdAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("Create comparison job error:", error);

    return res.status(500).json({
      error: "Failed to create comparison job",
    });
  }
};

export const getCompareById = async (req: Request, res: Response) => {
  try {
    const { compareId } = req.params;
    const userId = req.user?.id;

    if (!compareId) {
      return res.status(400).json({
        error: "Missing compareId",
      });
    }

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const [compare] = await db
      .select()
      .from(compareTable)
      .where(
        and(eq(compareTable.id, compareId), eq(compareTable.userId, userId)),
      );

    if (!compare) {
      return res.status(404).json({
        error: "Comparison not found",
      });
    }

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
      .from(compareProductsTable)
      .innerJoin(
        productsTable,
        eq(compareProductsTable.productId, productsTable.id),
      )
      .where(eq(compareProductsTable.compareId, compareId));

    return res.status(200).json({
      compare: {
        ...compare,
        products,
      },
    });
  } catch (error) {
    console.error("Get comparison by ID error:", error);

    return res.status(500).json({
      error: "Failed to fetch comparison",
    });
  }
};

export const getCompareHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
    const offset = (page - 1) * limit;

    const filter = String(req.query.filter || "all") as CompareHistoryFilter;

    const conditions = [eq(compareTable.userId, userId)];

    if (filter === "recent") {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      conditions.push(gte(compareTable.createdAt, last24Hours));
    }

    if (filter === "favorites") {
      conditions.push(sql`${compareTable.insights}->>'isFavorite' = 'true'`);
    }

    const whereCondition = and(...conditions);

    const [totalResult] = await db
      .select({
        count: count(),
      })
      .from(compareTable)
      .where(whereCondition);

    const compares = await db
      .select()
      .from(compareTable)
      .where(whereCondition)
      .orderBy(desc(compareTable.createdAt))
      .limit(limit)
      .offset(offset);

    const total = Number(totalResult?.count || 0);
    const totalPages = Math.ceil(total / limit);

    return res.status(200).json({
      success: true,
      filter,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      compares: compares.map((compare) => {
        const insights = getInsightsValue(compare.insights);

        return {
          ...compare,
          status: insights.status || "UNKNOWN",
          totalProducts:
            insights.totalProducts || compare.productUrl?.length || 0,
          processedProducts: insights.processedProducts || 0,
          failedProducts: insights.failedProducts || 0,
          errorMessage: insights.errorMessage || null,
          isFavorite: Boolean(insights.isFavorite),
          completedAt: insights.completedAt || null,
        };
      }),
    });
  } catch (error) {
    console.error("Get comparison history error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch comparison history",
    });
  }
};

export const toggleCompareFavorite = async (req: Request, res: Response) => {
  try {
    const { compareId } = req.params;
    const userId = req.user?.id;

    if (!compareId) {
      return res.status(400).json({
        error: "Missing compareId",
      });
    }

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const [compare] = await db
      .select()
      .from(compareTable)
      .where(
        and(eq(compareTable.id, compareId), eq(compareTable.userId, userId)),
      );

    if (!compare) {
      return res.status(404).json({
        error: "Comparison not found",
      });
    }

    const currentInsights = getInsightsValue(compare.insights);
    const nextIsFavorite = !Boolean(currentInsights.isFavorite);

    const nextInsights = {
      ...currentInsights,
      isFavorite: nextIsFavorite,
    };

    await db
      .update(compareTable)
      .set({
        insights: nextInsights,
      })
      .where(
        and(eq(compareTable.id, compareId), eq(compareTable.userId, userId)),
      );

    return res.status(200).json({
      success: true,
      compare: {
        id: compareId,
        isFavorite: nextIsFavorite,
      },
    });
  } catch (error) {
    console.error("Toggle comparison favorite error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to update comparison favorite",
    });
  }
};

export const deleteCompare = async (req: Request, res: Response) => {
  try {
    const { compareId } = req.params;
    const userId = req.user?.id;

    if (!compareId) {
      return res.status(400).json({
        error: "Missing compareId",
      });
    }

    if (!userId) {
      return res.status(401).json({
        error: "Unauthorized",
      });
    }

    const [compare] = await db
      .select({
        id: compareTable.id,
      })
      .from(compareTable)
      .where(
        and(eq(compareTable.id, compareId), eq(compareTable.userId, userId)),
      );

    if (!compare) {
      return res.status(404).json({
        error: "Comparison not found",
      });
    }

    await db
      .delete(compareTable)
      .where(
        and(eq(compareTable.id, compareId), eq(compareTable.userId, userId)),
      );

    return res.status(200).json({
      success: true,
      message: "Comparison deleted successfully",
    });
  } catch (error) {
    console.error("Delete comparison error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to delete comparison",
    });
  }
};
