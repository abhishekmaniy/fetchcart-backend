import { Worker, Job } from "bullmq";
import { PRODUCT_SEARCH_QUEUE } from "../queues/search.queue";
import type { ProductSearchJobData } from "../types/search.types";
import { runProductSearchJob } from "../services/product-search.service";
import { publishSearchEvent } from "../events/search-event.publisher";
import { redisConnection } from "../config/redis";

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: "Unknown error",
    raw: error,
  };
}

export const productSearchWorker = new Worker<ProductSearchJobData>(
  PRODUCT_SEARCH_QUEUE,
  async (job: Job<ProductSearchJobData>) => {
    console.log("\n========================================");
    console.log("🚀 PRODUCT SEARCH JOB STARTED");
    console.log("========================================");
    console.log("Job ID:", job.id);
    console.log("Job name:", job.name);
    console.log("Job attempt:", job.attemptsMade + 1);
    console.log("Job data:", JSON.stringify(job.data, null, 2));

    try {
      await runProductSearchJob(job.data);

      console.log("✅ PRODUCT SEARCH JOB FINISHED SUCCESSFULLY");
      console.log("Job ID:", job.id);
    } catch (error) {
      const details = getErrorDetails(error);

      console.error("❌ PRODUCT SEARCH JOB CRASHED");
      console.error("Job ID:", job.id);
      console.error("Error message:", details.message);
      console.error("Error stack:", details.stack);

      throw error;
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
);

productSearchWorker.on("active", (job) => {
  console.log(`🟡 Job active: ${job.id}`);
});

productSearchWorker.on("completed", (job) => {
  console.log(`✅ Product search job completed: ${job.id}`);
});

productSearchWorker.on("failed", async (job, error) => {
  console.error("\n========================================");
  console.error("❌ PRODUCT SEARCH JOB FAILED EVENT");
  console.error("========================================");
  console.error("Job ID:", job?.id);
  console.error("Attempts made:", job?.attemptsMade);
  console.error("Search ID:", job?.data?.searchId);
  console.error("Error message:", error.message);
  console.error("Error stack:", error.stack);

  if (job?.data.searchId) {
    await publishSearchEvent({
      type: "SEARCH_FAILED",
      searchId: job.data.searchId,
      error: error.message,
      message: "Search failed",
    });
  }
});

productSearchWorker.on("error", (error) => {
  console.error("❌ Worker runtime error:", error);
});