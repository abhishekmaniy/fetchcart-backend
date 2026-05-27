import Razorpay from "razorpay";
import "./env"
import { env } from "./env";

if (!env.RAZORPAY_KEY_ID) {
  throw new Error("RAZORPAY_KEY_ID is missing in environment variables");
}

if (!env.RAZORPAY_KEY_SECRET) {
  throw new Error("RAZORPAY_KEY_SECRET is missing in environment variables");
}

export const razorpay = new Razorpay({
  key_id: env.RAZORPAY_KEY_ID,
  key_secret: env.RAZORPAY_KEY_SECRET,
});