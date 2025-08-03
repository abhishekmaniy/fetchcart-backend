import { eq, sql, inArray } from 'drizzle-orm';
import db from '../db/db';
import {
  usersTable,
  searchesTable,
  productsTable,
  compareTable,
  compareProductsTable
} from '../db/schema';

export const getUserNestedData = async (userId: string) => {
  // Step 1: Fetch the user
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) throw new Error('User not found');

  // -----------------------------
  // SEARCHES -> PRODUCTS
  // -----------------------------
  const searches = await db
    .select()
    .from(searchesTable)
    .where(eq(searchesTable.userId, user.id));

  const searchIds = searches.map((s) => s.id);
  const productsFromSearches = searchIds.length
    ? await db
        .select()
        .from(productsTable)
        .where(inArray(productsTable.searchId, searchIds))
    : [];

  const searchProductMap: Record<string, typeof productsFromSearches[0][]> = {};
  for (const p of productsFromSearches) {
    const sid = p.searchId;
    if (!sid) continue;
    if (!searchProductMap[sid]) searchProductMap[sid] = [];
    searchProductMap[sid].push(p);
  }

  const nestedSearches = searches.map((s) => ({
    ...s,
    products: searchProductMap[s.id] || []
  }));

  // -----------------------------
  // COMPARISONS -> PRODUCTS
  // -----------------------------
  const comparisons = await db
    .select()
    .from(compareTable)
    .where(eq(compareTable.userId, user.id));

  const comparisonIds = comparisons.map((c) => c.id);

  const compareProductLinks = comparisonIds.length
    ? await db
        .select()
        .from(compareProductsTable)
        .where(inArray(compareProductsTable.compareId, comparisonIds))
    : [];

  const allProductIds = compareProductLinks.map((cp) => cp.productId);
  const productsFromComparisons = allProductIds.length
    ? await db
        .select()
        .from(productsTable)
        .where(inArray(productsTable.id, allProductIds))
    : [];

  // Group products by compareId using compareProductsTable
  const compareProductMap: Record<string, typeof productsFromComparisons[0][]> = {};
  for (const cp of compareProductLinks) {
    const compareId = cp.compareId;
    const product = productsFromComparisons.find((p) => p.id === cp.productId);
    if (!product) continue;
    if (!compareProductMap[compareId]) compareProductMap[compareId] = [];
    compareProductMap[compareId].push(product);
  }

  const nestedComparisons = comparisons.map((c) => ({
    ...c,
    products: compareProductMap[c.id] || []
  }));

  console.log(nestedComparisons)

  // -----------------------------
  // FINAL STRUCTURE
  // -----------------------------
  return {
    user: {
      ...user,
      searches: nestedSearches,
      comparisons: nestedComparisons
    }
  };
};
