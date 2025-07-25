import { eq, sql } from 'drizzle-orm'
import db from '../db/db'
import { usersTable, searchesTable, productsTable } from '../db/schema'

export const getUserNestedData = async (userId: string) => {
  // Step 1: Fetch the user
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
  console.log(user)

  if (!user) throw new Error('User not found')

  // Step 2: Fetch searches for this user
  const searches = await db
    .select()
    .from(searchesTable)
    .where(eq(searchesTable.userId, user.id))

  console.log("searches" , searches)

  const searchIds = searches.map(search => search.id)
  if (searchIds.length === 0) {
    return {
      user: {
        ...user,
        searches: []
      }
    }
  }

  // Step 3: Fetch all products linked to those searches
  const products = await db
    .select()
    .from(productsTable)
    .where(
      sql`${productsTable.searchId} IN (${sql.join(
        searchIds.map(id => sql`${id}`),
        sql`,`
      )})`
    )

  console.log("products" , products)

  // Step 4: Group products by searchId
  const productMap: Record<string, typeof products[0][]> = {}
  for (const product of products) {
    if (!productMap[product.searchId]) {
      productMap[product.searchId] = []
    }
    productMap[product.searchId].push(product)
  }

  console.log("productMap" , productMap)

  // Step 5: Build nested structure
  const nestedSearches = searches.map(search => ({
    ...search,
    products: productMap[search.id] || []
  }))

  console.log("nestedSearches" , nestedSearches)

  return {
    user: {
      ...user,
      searches: nestedSearches
    }
  }
}
