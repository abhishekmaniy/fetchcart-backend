import { Resend } from "resend";
import { env } from "./env";

export const resendConfig = {
  apiKey: env.RESEND_API_KEY,
  fromEmail: env.RESEND_FROM_EMAIL,
  fromName: env.RESEND_FROM_NAME || "FetchCart AI",
  replyTo: env.RESEND_REPLY_TO,
};

export const resend = new Resend(resendConfig.apiKey);

export const getResendFromAddress = () => {
  return `${resendConfig.fromName} <${resendConfig.fromEmail}>`;
};