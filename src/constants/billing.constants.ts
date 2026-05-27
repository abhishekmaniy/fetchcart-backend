export const BILLING_PLANS = {
  FREE: {
    plan: "FREE",
    name: "Free",
    priceInPaise: 0,
    currency: "INR",
  },

  PRO: {
    plan: "PRO",
    name: "Pro",
    priceInPaise: 49900, // ₹499
    currency: "INR",
  },

  MAX: {
    plan: "MAX",
    name: "Max",
    priceInPaise: 99900, // ₹999
    currency: "INR",
  },
} as const;

export type Plan = keyof typeof BILLING_PLANS;

export type PaidPlan = Exclude<Plan, "FREE">;

export const PAID_PLANS: PaidPlan[] = ["PRO", "MAX"];

export const isPaidPlan = (plan: unknown): plan is PaidPlan => {
  return typeof plan === "string" && PAID_PLANS.includes(plan as PaidPlan);
};

export const PLAN_PRIORITY: Record<Plan, number> = {
  FREE: 0,
  PRO: 1,
  MAX: 2,
};