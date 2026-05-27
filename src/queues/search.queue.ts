import { Queue } from "bullmq";
import type { ProductSearchJobData } from "../types/search.types";
import { redisConnection } from "../config/redis";

export const PRODUCT_SEARCH_QUEUE = "product-search-queue";

export const productSearchQueue = new Queue<ProductSearchJobData>(
  PRODUCT_SEARCH_QUEUE,
  {
    connection: redisConnection,
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: "exponential",
        delay: 3000,
      },
      removeOnComplete: {
        age: 60 * 60 * 24,
        count: 1000,
      },
      removeOnFail: {
        age: 60 * 60 * 24 * 7,
      },
    },
  }
);