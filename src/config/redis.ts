import Redis from "ioredis";
import { env } from "./env";

const redisOptions = {
  host: env.REDIS_HOST,
  port: Number(env.REDIS_PORT),
  username: env.REDIS_USERNAME,
  password: env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,

};

// Normal Redis connection
export const redisConnection = new Redis(redisOptions);

// Publisher connection
export const redisPublisher = new Redis(redisOptions);

// Subscriber connection
export const redisSubscriber = new Redis(redisOptions);

// Error handlers
redisConnection.on("error", (err) => {
  console.error("❌ Redis Connection Error:", err);
});

redisPublisher.on("error", (err) => {
  console.error("❌ Redis Publisher Error:", err);
});

redisSubscriber.on("error", (err) => {
  console.error("❌ Redis Subscriber Error:", err);
});

// Success logs
redisConnection.on("connect", () => {
  console.log("✅ Redis Connected");
});

redisPublisher.on("connect", () => {
  console.log("✅ Redis Publisher Connected");
});

redisSubscriber.on("connect", () => {
  console.log("✅ Redis Subscriber Connected");
});