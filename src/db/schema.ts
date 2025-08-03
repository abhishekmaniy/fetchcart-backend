import {
  boolean, integer, jsonb, pgTable, real, timestamp, uuid, varchar
} from 'drizzle-orm/pg-core';

// Users table
export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),

  name: varchar('name', { length: 255 }).notNull(),

  email: varchar('email', { length: 255 }).notNull().unique(),

  imageUrl: varchar('image_url', { length: 255 }),

  password: varchar('password', { length: 255 }),

  verified: boolean('verified').notNull().default(false),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),

  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow()
});

export const searchesTable = pgTable('searches', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id),

  query: varchar('query', { length: 1024 }).notNull(),

  isFavorite: boolean('is_favorite').notNull().default(false),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
});

export const compareTable = pgTable('compares', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),

  title: varchar('title', { length: 255 }).notNull(),

  // Changed to array of strings
  productUrl: jsonb('product_url').$type<string[]>(),

  summary: varchar('summary', { length: 2048 }).notNull(),

  insights: jsonb('insights').$type<Record<string, any>>(),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
});

export const productsTable = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),

  // ✅ Nullable foreign keys
  searchId: uuid('search_id')
    .references(() => searchesTable.id, { onDelete: 'cascade' }),

  compareId: uuid('compare_id')
    .references(() => compareTable.id, { onDelete: 'cascade' }),

  productName: varchar('product_name', { length: 255 }),

  brand: varchar('brand', { length: 255 }),
  model: varchar('model', { length: 255 }),

  price: varchar('price', { length: 50 }),
  originalPrice: varchar('original_price', { length: 50 }),
  savings: varchar('savings', { length: 50 }),

  image: varchar('image', { length: 1024 }),
  images: jsonb('images').$type<string[] | null>(),

  rating: real('rating'),
  reviews: integer('reviews'),

  productUrl: varchar('product_url', { length: 1024 }),
  store: varchar('store', { length: 255 }),
  asin: varchar('asin', { length: 50 }),

  category: varchar('category', { length: 1024 }),
  description: varchar('description', { length: 2048 }),

  productInfo: jsonb('product_info').$type<Record<string, string>>(),
  featureBullets: jsonb('feature_bullets').$type<string[]>(),

  pros: jsonb('pros').$type<string[]>(),
  cons: jsonb('cons').$type<string[]>(),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
});

export const compareProductsTable = pgTable('compare_products', {
  id: uuid('id').primaryKey().defaultRandom(),

  compareId: uuid('compare_id')
    .notNull()
    .references(() => compareTable.id, { onDelete: 'cascade' }),

  productId: uuid('product_id')
    .notNull()
    .references(() => productsTable.id, { onDelete: 'cascade' })
});

export const tokenTable = pgTable('tokens', {
  id: uuid('id').primaryKey().defaultRandom(),

  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, { onDelete: 'cascade' }),

  token: varchar('token', { length: 255 }).notNull(),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
});
