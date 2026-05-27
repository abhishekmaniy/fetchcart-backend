import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { env } from "./env";

if (!env.GOOGLE_API_KEY) {
  throw new Error("GOOGLE_API_KEY is missing in environment variables");
}

export const model = new ChatGoogleGenerativeAI({
  model: "gemini-3.5-flash",
  apiKey: env.GOOGLE_API_KEY,
  temperature: 0.1,
});