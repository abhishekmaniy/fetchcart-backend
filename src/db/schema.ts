import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  timestamp,
  uuid,
  varchar,
  uniqueIndex,
  index,
  text
} from "drizzle-orm/pg-core";

export const planEnum = pgEnum("plan", ["FREE", "PRO", "MAX"]);

export const paymentStatusEnum = pgEnum("payment_status", [
  "CREATED",
  "PAID",
  "FAILED",
  "REFUNDED",
]);

// Users table
export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),

  name: varchar("name", { length: 255 }).notNull(),

  email: varchar("email", { length: 255 }).notNull().unique(),

  imageUrl: varchar("image_url", { length: 255 }),

  password: varchar("password", { length: 255 }),

  verified: boolean("verified").notNull().default(false),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),

  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
});

export const searchesTable = pgTable("searches", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id),

  title: varchar("title", { length: 255 }),

  query: varchar("query", { length: 1024 }).notNull(),

  status: varchar("status", { length: 50 }).notNull().default("QUEUED"),

  totalProductsFound: integer("total_products_found").notNull().default(0),

  processedProducts: integer("processed_products").notNull().default(0),

  failedProducts: integer("failed_products").notNull().default(0),

  errorMessage: varchar("error_message", { length: 2048 }),

  isFavorite: boolean("is_favorite").notNull().default(false),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),

  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),

  completedAt: timestamp("completed_at", { mode: "date" }),
});

export const compareTable = pgTable("compares", {
  id: uuid("id").primaryKey().defaultRandom(),

  userId: uuid("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),

  title: varchar("title", { length: 255 }).notNull(),

  productUrl: jsonb("product_url").$type<string[]>(),

  summary: varchar("summary", { length: 2048 }).notNull(),

  insights: jsonb("insights").$type<Record<string, any>>(),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const productsTable = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),

  searchId: uuid("search_id").references(() => searchesTable.id, {
    onDelete: "cascade",
  }),

  compareId: uuid("compare_id").references(() => compareTable.id, {
    onDelete: "cascade",
  }),

  productName: varchar("product_name", { length: 255 }),

  brand: varchar("brand", { length: 255 }),

  model: varchar("model", { length: 255 }),

  price: varchar("price", { length: 50 }),

  originalPrice: varchar("original_price", { length: 50 }),

  savings: varchar("savings", { length: 50 }),

  image: varchar("image", { length: 1024 }),

  images: jsonb("images").$type<string[] | null>(),

  rating: real("rating"),

  reviews: integer("reviews"),

  productUrl: varchar("product_url", { length: 1024 }),

  store: varchar("store", { length: 255 }),

  asin: varchar("asin", { length: 50 }),

  category: varchar("category", { length: 1024 }),

  description: varchar("description", { length: 2048 }),

  productInfo: jsonb("product_info").$type<Record<string, string>>(),

  featureBullets: jsonb("feature_bullets").$type<string[]>(),

  pros: jsonb("pros").$type<string[]>(),

  cons: jsonb("cons").$type<string[]>(),

  isLiked: boolean("is_liked").notNull().default(false),

  createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),
});

export const compareProductsTable = pgTable("compare_products", {
  id: uuid("id").primaryKey().defaultRandom(),

  compareId: uuid("compare_id")
    .notNull()
    .references(() => compareTable.id, { onDelete: "cascade" }),

  productId: uuid("product_id")
    .notNull()
    .references(() => productsTable.id, { onDelete: "cascade" }),
});

export const userPlansTable = pgTable(
  "user_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    plan: planEnum("plan").notNull().default("FREE"),

    startsAt: timestamp("starts_at", { mode: "date" }),

    expiresAt: timestamp("expires_at", { mode: "date" }),

    isActive: boolean("is_active").notNull().default(true),

    lastPaymentId: uuid("last_payment_id"),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),

    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (table) => {
    return {
      userIdx: uniqueIndex("user_plans_user_id_idx").on(table.userId),
      planIdx: index("user_plans_plan_idx").on(table.plan),
      expiresAtIdx: index("user_plans_expires_at_idx").on(table.expiresAt),
    };
  }
);


export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),

    plan: planEnum("plan").notNull(),

    status: paymentStatusEnum("status").notNull().default("CREATED"),

    razorpayOrderId: varchar("razorpay_order_id", {
      length: 255,
    }).notNull(),

    razorpayPaymentId: varchar("razorpay_payment_id", {
      length: 255,
    }),

    razorpaySignature: varchar("razorpay_signature", {
      length: 512,
    }),

    errorCode: varchar("error_code", { length: 255 }),

    errorDescription: varchar("error_description", { length: 2048 }),

    paidAt: timestamp("paid_at", { mode: "date" }),

    planStartsAt: timestamp("plan_starts_at", { mode: "date" }),

    planExpiresAt: timestamp("plan_expires_at", { mode: "date" }),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),

    updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow(),
  },
  (table) => {
    return {
      userIdx: index("payments_user_id_idx").on(table.userId),

      statusIdx: index("payments_status_idx").on(table.status),

      razorpayOrderIdx: uniqueIndex("payments_razorpay_order_id_idx").on(
        table.razorpayOrderId
      ),

      razorpayPaymentIdx: uniqueIndex("payments_razorpay_payment_id_idx").on(
        table.razorpayPaymentId
      ),
    };
  }
);  


export const paymentEventsTable = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    razorpayEventId: varchar("razorpay_event_id", {
      length: 255,
    }).unique(),

    eventType: varchar("event_type", { length: 100 }).notNull(),

    razorpayOrderId: varchar("razorpay_order_id", { length: 255 }),

    razorpayPaymentId: varchar("razorpay_payment_id", { length: 255 }),

    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),

    processed: boolean("processed").notNull().default(false),

    processingError: varchar("processing_error", { length: 2048 }),

    createdAt: timestamp("created_at", { mode: "date" }).defaultNow(),

    processedAt: timestamp("processed_at", { mode: "date" }),
  },
  (table) => {
    return {
      eventIdx: uniqueIndex("payment_events_razorpay_event_id_idx").on(
        table.razorpayEventId
      ),

      eventTypeIdx: index("payment_events_event_type_idx").on(table.eventType),

      orderIdx: index("payment_events_razorpay_order_id_idx").on(
        table.razorpayOrderId
      ),

      paymentIdx: index("payment_events_razorpay_payment_id_idx").on(
        table.razorpayPaymentId
      ),
    };
  }
);