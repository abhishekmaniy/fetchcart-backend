import express, { Router } from "express";
import { createPaymentOrder, getCurrentPlan, verifyPayment } from "../controllers/billing.controller";


const router = Router();

router.post("/create-order", createPaymentOrder);

router.post("/verify-payment", verifyPayment);

router.get("/current-plan", getCurrentPlan);

export default router;