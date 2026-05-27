import { Request, Response } from "express";
import { eq } from "drizzle-orm";
import {
  paymentsTable,
  paymentEventsTable,
  userPlansTable,
} from "../db/schema";
import { razorpay } from "../config/razorpay";
import {
  BILLING_PLANS,
  isPaidPlan,
  PaidPlan,
} from "../constants/billing.constants";
import {
  getEffectivePlan,
  getMonthlyPlanPeriod,
  isPlanExpired,
} from "../utils/billing.utils";
import {
  verifyRazorpayOrderSignature,
  verifyRazorpayWebhookSignature,
} from "../utils/razorpay-signature.util";
import db from "../config/db";
import { env } from "../config/env";

const buildReceipt = (userId: string, plan: string) => {
  return `fc_${plan}_${userId}_${Date.now()}`.slice(0, 40);
};

// ======================================================
// POST /api/billing/create-order
// ======================================================

export const createPaymentOrder = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;
    const { plan } = req.body as { plan?: PaidPlan };

    if (!isPaidPlan(plan)) {
      return res.status(400).json({
        success: false,
        message: "Invalid plan selected",
      });
    }

    const selectedPlan = BILLING_PLANS[plan];

    const razorpayOrder = await razorpay.orders.create({
      amount: selectedPlan.priceInPaise,
      currency: selectedPlan.currency,
      receipt: buildReceipt(userId, plan),
      notes: {
        userId,
        plan,
        app: "FetchCart",
      },
    });

    const [payment] = await db
      .insert(paymentsTable)
      .values({
        userId,
        plan,
        status: "CREATED",
        razorpayOrderId: razorpayOrder.id,
      })
      .returning();

    return res.status(201).json({
      success: true,
      message: "Payment order created successfully",
      data: {
        paymentId: payment.id,
        razorpayOrderId: razorpayOrder.id,
        amount: selectedPlan.priceInPaise,
        currency: selectedPlan.currency,
        plan,
        key: env.RAZORPAY_KEY_ID,
      },
    });
  } catch (error) {
    console.error("CREATE_PAYMENT_ORDER_ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create payment order",
    });
  }
};

// ======================================================
// POST /api/billing/verify-payment
// ======================================================

export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body as {
      razorpay_order_id?: string;
      razorpay_payment_id?: string;
      razorpay_signature?: string;
    };

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized user",
      });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay payment verification fields",
      });
    }

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.razorpayOrderId, razorpay_order_id))
      .limit(1);

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment order not found",
      });
    }

    if (payment.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to verify this payment",
      });
    }

    if (payment.status === "PAID") {
      return res.status(200).json({
        success: true,
        message: "Payment already verified",
        data: {
          plan: payment.plan,
          startsAt: payment.planStartsAt,
          expiresAt: payment.planExpiresAt,
        },
      });
    }

    const isValidSignature = verifyRazorpayOrderSignature({
      orderId: payment.razorpayOrderId,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });

    if (!isValidSignature) {
      await db
        .update(paymentsTable)
        .set({
          status: "FAILED",
          razorpayPaymentId: razorpay_payment_id,
          errorDescription: "Invalid payment signature",
          updatedAt: new Date(),
        })
        .where(eq(paymentsTable.id, payment.id));

      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    const [currentUserPlan] = await db
      .select()
      .from(userPlansTable)
      .where(eq(userPlansTable.userId, userId))
      .limit(1);

    const { startsAt, expiresAt } = getMonthlyPlanPeriod(
      currentUserPlan?.expiresAt
    );

    const [updatedPayment] = await db
      .update(paymentsTable)
      .set({
        status: "PAID",
        razorpayPaymentId: razorpay_payment_id,
        razorpaySignature: razorpay_signature,
        paidAt: new Date(),
        planStartsAt: startsAt,
        planExpiresAt: expiresAt,
        updatedAt: new Date(),
      })
      .where(eq(paymentsTable.id, payment.id))
      .returning();

    await db
      .insert(userPlansTable)
      .values({
        userId,
        plan: payment.plan,
        startsAt,
        expiresAt,
        isActive: true,
        lastPaymentId: updatedPayment.id,
      })
      .onConflictDoUpdate({
        target: userPlansTable.userId,
        set: {
          plan: payment.plan,
          startsAt,
          expiresAt,
          isActive: true,
          lastPaymentId: updatedPayment.id,
          updatedAt: new Date(),
        },
      });

    return res.status(200).json({
      success: true,
      message: "Payment verified and plan activated successfully",
      data: {
        plan: payment.plan,
        startsAt,
        expiresAt,
      },
    });
  } catch (error) {
    console.error("VERIFY_PAYMENT_ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Failed to verify payment",
    });
  }
};

// ======================================================
// GET /api/billing/current-plan
// ======================================================

export const getCurrentPlan = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id!;

    const [userPlan] = await db
      .select()
      .from(userPlansTable)
      .where(eq(userPlansTable.userId, userId))
      .limit(1);

    if (!userPlan) {
      return res.status(200).json({
        success: true,
        data: {
          plan: "FREE",
          effectivePlan: "FREE",
          isActive: true,
          isExpired: false,
          startsAt: null,
          expiresAt: null,
        },
      });
    }

    const expired = isPlanExpired({
      plan: userPlan.plan,
      expiresAt: userPlan.expiresAt,
    });

    const effectivePlan = getEffectivePlan({
      plan: userPlan.plan,
      expiresAt: userPlan.expiresAt,
    });

    return res.status(200).json({
      success: true,
      data: {
        plan: userPlan.plan,
        effectivePlan,
        isActive: userPlan.isActive && !expired,
        isExpired: expired,
        startsAt: userPlan.startsAt,
        expiresAt: userPlan.expiresAt,
      },
    });
  } catch (error) {
    console.error("GET_CURRENT_PLAN_ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch current plan",
    });
  }
};

// ======================================================
// POST /api/billing/webhook
// This route must use express.raw()
// ======================================================

export const razorpayWebhook = async (req: Request, res: Response) => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: "Missing Razorpay webhook signature",
      });
    }

    const isValidWebhook = verifyRazorpayWebhookSignature({
      rawBody: req.body,
      signature,
    });

    if (!isValidWebhook) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    const event = JSON.parse(req.body.toString());

    const eventType = event.event as string;

    const paymentEntity = event.payload?.payment?.entity;

    const razorpayOrderId = paymentEntity?.order_id ?? null;
    const razorpayPaymentId = paymentEntity?.id ?? null;

    const razorpayEventId =
      event.id || `${eventType}_${razorpayPaymentId}_${Date.now()}`;

    await db
      .insert(paymentEventsTable)
      .values({
        razorpayEventId,
        eventType,
        razorpayOrderId,
        razorpayPaymentId,
        payload: event,
        processed: false,
      })
      .onConflictDoNothing();

    if (!razorpayOrderId) {
      return res.status(200).json({
        received: true,
      });
    }

    const [payment] = await db
      .select()
      .from(paymentsTable)
      .where(eq(paymentsTable.razorpayOrderId, razorpayOrderId))
      .limit(1);

    if (!payment) {
      return res.status(200).json({
        received: true,
        message: "Payment order not found in database",
      });
    }

    if (payment.status === "PAID") {
      await db
        .update(paymentEventsTable)
        .set({
          processed: true,
          processedAt: new Date(),
        })
        .where(eq(paymentEventsTable.razorpayEventId, razorpayEventId));

      return res.status(200).json({
        received: true,
        message: "Payment already processed",
      });
    }

    if (eventType === "payment.captured" || eventType === "order.paid") {
      const [currentUserPlan] = await db
        .select()
        .from(userPlansTable)
        .where(eq(userPlansTable.userId, payment.userId))
        .limit(1);

      const { startsAt, expiresAt } = getMonthlyPlanPeriod(
        currentUserPlan?.expiresAt
      );

      await db.transaction(async (tx) => {
        const [updatedPayment] = await tx
          .update(paymentsTable)
          .set({
            status: "PAID",
            razorpayPaymentId,
            paidAt: new Date(),
            planStartsAt: startsAt,
            planExpiresAt: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(paymentsTable.id, payment.id))
          .returning();

        await tx
          .insert(userPlansTable)
          .values({
            userId: payment.userId,
            plan: payment.plan,
            startsAt,
            expiresAt,
            isActive: true,
            lastPaymentId: updatedPayment.id,
          })
          .onConflictDoUpdate({
            target: userPlansTable.userId,
            set: {
              plan: payment.plan,
              startsAt,
              expiresAt,
              isActive: true,
              lastPaymentId: updatedPayment.id,
              updatedAt: new Date(),
            },
          });

        await tx
          .update(paymentEventsTable)
          .set({
            processed: true,
            processedAt: new Date(),
          })
          .where(eq(paymentEventsTable.razorpayEventId, razorpayEventId));
      });
    }

    if (eventType === "payment.failed") {
      await db.transaction(async (tx) => {
        await tx
          .update(paymentsTable)
          .set({
            status: "FAILED",
            razorpayPaymentId,
            errorCode: paymentEntity?.error_code,
            errorDescription: paymentEntity?.error_description,
            updatedAt: new Date(),
          })
          .where(eq(paymentsTable.id, payment.id));

        await tx
          .update(paymentEventsTable)
          .set({
            processed: true,
            processedAt: new Date(),
          })
          .where(eq(paymentEventsTable.razorpayEventId, razorpayEventId));
      });
    }

    return res.status(200).json({
      received: true,
    });
  } catch (error) {
    console.error("RAZORPAY_WEBHOOK_ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};