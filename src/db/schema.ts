import { sql } from 'drizzle-orm'
import {
  boolean,
  integer,
  jsonb,
  pgTable,
  real,
  timestamp,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'

// Users table
export const usersTable = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  name: varchar('name', { length: 255 }).notNull(),

  email: varchar('email', { length: 255 }).notNull().unique(),

  imageUrl: varchar('image_url', { length: 255 }),

  password: varchar('password', { length: 255 }),

  verified: boolean('verified').notNull().default(false),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),

  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow()
})

export const searchesTable = pgTable('searches', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id),

  query: varchar('query', { length: 1024 }).notNull(),

  isFavorite: boolean('is_favorite').notNull().default(false),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
})

export const productsTable = pgTable('products', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  searchId: uuid('search_id')
    .notNull()
    .references(() => searchesTable.id),

  productName: varchar('product_name', { length: 255 }), // Optional

  price: varchar('price', { length: 50 }), // Optional
  originalPrice: varchar('original_price', { length: 50 }),
  savings: varchar('savings', { length: 50 }),

  image: varchar('image', { length: 255 }), // Optional

  rating: real('rating'), // Optional
  reviews: integer('reviews'), // Optional

  store: varchar('store', { length: 100 }), // Optional

  features: jsonb('features').$type<string[]>(), // New
  pros: jsonb('pros').$type<string[]>(), // New
  cons: jsonb('cons').$type<string[]>() // New
})

export const compareTable = pgTable('compares', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),

  title: varchar('title', { length: 255 }).notNull(),

  productUrl: varchar('product_url', { length: 1024 }),

  summary: varchar('summary', { length: 2048 }).notNull(),

  insights: jsonb('insights').$type<Record<string, any>>(), 

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
})

// Join table: many-to-many between compares and products
export const compareProductsTable = pgTable('compare_products', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  compareId: uuid('compare_id')
    .notNull()
    .references(() => compareTable.id, { onDelete: 'cascade' }),

  productId: uuid('product_id')
    .notNull()
    .references(() => productsTable.id, { onDelete: 'cascade' })
})

// Tokens table
export const tokenTable = pgTable('tokens', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),

  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, {
      onDelete: 'cascade'
    }),

  token: varchar('token', { length: 255 }).notNull(),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
})
