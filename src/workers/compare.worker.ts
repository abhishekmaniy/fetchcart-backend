import { Worker, Job } from "bullmq";
import { redisConnection } from "../config/redis";
import type { ProductCompareJobData } from "../types/compare.types";
import { runProductCompareJob } from "../services/compare-worker.service";
import { publishCompareEvent } from "../events/compare-event.publisher";
import express from "express";

const PRODUCT_COMPARE_QUEUE = "product-compare";


const app = express();
const PORT = process.env.PORT || 5001;

app.get("/", (_, res) => {
  res.send("Worker is running");
});

app.listen(PORT, () => {
  console.log(`Worker health server running on port ${PORT}`);
});

function getErrorDetails(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: "Unknown error",
    stack: undefined,
    raw: error,
  };
}

export const compareWorker = new Worker<ProductCompareJobData>(
  PRODUCT_COMPARE_QUEUE,
  async (job: Job<ProductCompareJobData>) => {
    console.log("\n========================================");
    console.log("🚀 PRODUCT COMPARE JOB STARTED");
    console.log("========================================");
    console.log("Job ID:", job.id);
    console.log("Job name:", job.name);
    console.log("Job attempt:", job.attemptsMade + 1);
    console.log("Job data:", JSON.stringify(job.data, null, 2));

    try {
      await runProductCompareJob(job.data);

      console.log("✅ PRODUCT COMPARE JOB FINISHED SUCCESSFULLY");
      console.log("Job ID:", job.id);
    } catch (error) {
      const details = getErrorDetails(error);

      console.error("\n❌ PRODUCT COMPARE JOB CRASHED");
      console.error("Job ID:", job.id);
      console.error("Compare ID:", job.data?.compareId);
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

compareWorker.on("active", (job) => {
  console.log(`🟡 Compare job active: ${job.id}`);
});

compareWorker.on("completed", (job) => {
  console.log(`✅ Compare job completed: ${job.id}`);
});

compareWorker.on("failed", async (job, error) => {
  console.error("\n========================================");
  console.error("❌ PRODUCT COMPARE JOB FAILED EVENT");
  console.error("========================================");
  console.error("Job ID:", job?.id);
  console.error("Attempts made:", job?.attemptsMade);
  console.error("Compare ID:", job?.data?.compareId);
  console.error("Source:", job?.data?.source);
  console.error("Error message:", error.message);
  console.error("Error stack:", error.stack);

  if (job?.data.compareId) {
    await publishCompareEvent({
      type: "COMPARE_FAILED",
      compareId: job.data.compareId,
      error: error.message,
      message: "Comparison failed",
    });
  }
});

compareWorker.on("error", (error) => {
  console.error("❌ Compare worker runtime error:", error);
});