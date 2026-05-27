import dotenv from "dotenv";

dotenv.config();

const requiredEnvVars = [
  "DATABASE_URL",
  "JWT_SECRET",

  "ACCESS_TOKEN_SECRET",
  "REFRESH_TOKEN_SECRET",
  "EMAIL_VERIFICATION_SECRET",
  "PASSWORD_RESET_SECRET",

  "ACCESS_TOKEN_EXPIRES_IN",
  "REFRESH_TOKEN_EXPIRES_IN",
  "EMAIL_VERIFICATION_EXPIRES_IN",
  "PASSWORD_RESET_EXPIRES_IN",

  "GOOGLE_CLIENT_ID",
  "GOOGLE_API_KEY",

  "SERP_API_KEY",
  "SCRAPER_API",
  "TAVILY_API_KEY",

  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",

  "RESEND_API_KEY",
  "RESEND_FROM_EMAIL",
  "RESEND_FROM_NAME",
] as const;

const missingEnvVars = requiredEnvVars.filter(
  (key) => !process.env[key] || process.env[key]?.trim() === ""
);

if (missingEnvVars.length > 0) {
  console.error("\n❌ Missing required environment variables:\n");

  missingEnvVars.forEach((key) => {
    console.error(`   - ${key}`);
  });

  console.error(
    "\n⚠️ Please add the missing variables in your .env file and restart the server.\n"
  );

  process.exit(1);
}

export const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  PORT: Number(process.env.PORT || 5000),

  FRONTEND_URLS: [
    "http://localhost:8080",
    "http://localhost:8081",
    "https://fetchcart-ai-find.vercel.app",
  ],

  FRONTEND_URL: process.env.FRONTEND_URL!,

  DATABASE_URL: process.env.DATABASE_URL!,

  JWT_SECRET: process.env.JWT_SECRET!,

  ACCESS_TOKEN_SECRET: process.env.ACCESS_TOKEN_SECRET!,
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET!,
  EMAIL_VERIFICATION_SECRET: process.env.EMAIL_VERIFICATION_SECRET!,
  PASSWORD_RESET_SECRET: process.env.PASSWORD_RESET_SECRET!,

  ACCESS_TOKEN_EXPIRES_IN: process.env.ACCESS_TOKEN_EXPIRES_IN!,
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN!,
  EMAIL_VERIFICATION_EXPIRES_IN:
    process.env.EMAIL_VERIFICATION_EXPIRES_IN!,
  PASSWORD_RESET_EXPIRES_IN: process.env.PASSWORD_RESET_EXPIRES_IN!,

  SERP_API_KEY: process.env.SERP_API_KEY!,
  SCRAPER_API: process.env.SCRAPER_API!,
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY!,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID!,
  TAVILY_API_KEY: process.env.TAVILY_API_KEY!,

  REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),

  RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID!,
  RAZORPAY_KEY_SECRET: process.env.RAZORPAY_KEY_SECRET!,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET!,

  RESEND_API_KEY: process.env.RESEND_API_KEY!,
  RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL!,
  RESEND_FROM_NAME: process.env.RESEND_FROM_NAME!,
  RESEND_REPLY_TO: process.env.RESEND_REPLY_TO || "",
};