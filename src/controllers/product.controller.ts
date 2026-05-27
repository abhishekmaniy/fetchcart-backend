import { and, eq } from "drizzle-orm";
import { Request, Response } from "express";

import db from "../config/db";
import { productsTable, searchesTable } from "../db/schema";

export const toggleProductLike = async (req: Request, res: Response) => {
  try {
    const { productId } = req.params;
    const userId = req.user?.id;

    if (!productId) {
      return res.status(400).json({
        success: false,
        error: "Missing productId",
      });
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Unauthorized",
      });
    }

    const [product] = await db
      .select({
        id: productsTable.id,
        isLiked: productsTable.isLiked,
      })
      .from(productsTable)
      .innerJoin(searchesTable, eq(productsTable.searchId, searchesTable.id))
      .where(
        and(
          eq(productsTable.id, productId),
          eq(searchesTable.userId, userId)
        )
      );

    if (!product) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    const nextLikedValue = !product.isLiked;

    const [updatedProduct] = await db
      .update(productsTable)
      .set({
        isLiked: nextLikedValue,
      })
      .where(eq(productsTable.id, productId))
      .returning({
        id: productsTable.id,
        isLiked: productsTable.isLiked,
      });

    return res.status(200).json({
      success: true,
      message: nextLikedValue
        ? "Product liked successfully"
        : "Product removed from liked list",
      product: updatedProduct,
    });
  } catch (error) {
    console.error("Toggle product like error:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to update product like status",
    });
  }
};