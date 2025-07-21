import { sql } from 'drizzle-orm'
import {
  boolean,
  pgTable,
  timestamp,
  uuid,
  varchar
} from 'drizzle-orm/pg-core'

// Users table
export const usersTable = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  name: varchar('name', { length: 255 }).notNull(),

  email: varchar('email', { length: 255 }).notNull().unique(),

  imageUrl: varchar('image_url', { length: 255 }),

  password: varchar('password', { length: 255 }),

  verified: boolean('verified').notNull().default(false),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow(),

  updatedAt: timestamp('updated_at', { mode: 'date' }).defaultNow()
})

// Tokens table
export const tokenTable = pgTable('tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),

  userId: uuid('user_id')
    .notNull()
    .references(() => usersTable.id, {
      onDelete: 'cascade'
    }),

  token: varchar('token', { length: 255 }).notNull(),

  createdAt: timestamp('created_at', { mode: 'date' }).defaultNow()
})
