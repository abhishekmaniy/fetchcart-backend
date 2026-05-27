import { Queue } from "bullmq";
import { redisConnection } from "../config/redis";

export const productCompareQueue = new Queue("product-compare", {
  connection: redisConnection,
});