import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "./env";

if (!env.GOOGLE_API_KEY) {
  throw new Error("GOOGLE_API_KEY is missing in environment variables");
}

export const genAI = new GoogleGenerativeAI(
  env.GOOGLE_API_KEY
);