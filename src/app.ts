import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import billingRoute from "./routes/billing.routes";
import compareRoute from "./routes/compareRoute";
import productRoutes from "./routes/productRoutes";
import searchRoute from "./routes/searchRoute";
import userRoute from "./routes/userRoutes";

import { corsOptions } from "./config/cors";
import { razorpayWebhook } from "./controllers/billing.controller";
import { verifyToken } from "./utils/verifyToken";

const app = express();

app.use(cors(corsOptions));

app.post(
  "/billing/webhook",
  express.raw({ type: "application/json" }),
  razorpayWebhook
);

app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Public routes
app.use("/user", userRoute);

// Protected routes
app.use(verifyToken);

app.use("/billing", billingRoute);
app.use("/search", searchRoute);
app.use("/products", productRoutes);
app.use("/compare", compareRoute);

export default app;