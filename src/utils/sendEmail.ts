import {
  resend,
  getResendFromAddress,
  resendConfig,
} from "../config/resend";

type SendEmailPayload = {
  email: string;
  subject: string;
  text?: string;
  html?: string;
};

export const sendEmail = async ({
  email,
  subject,
  text,
  html,
}: SendEmailPayload) => {
  try {
    if (!text && !html) {
      throw new Error("Either text or html is required to send an email.");
    }

    const baseEmailPayload = {
      from: getResendFromAddress(),
      to: [email],
      subject,
      ...(resendConfig.replyTo ? { replyTo: resendConfig.replyTo } : {}),
    };

    const emailPayload = html
      ? {
          ...baseEmailPayload,
          html,
        }
      : {
          ...baseEmailPayload,
          text: text as string,
        };

    const { data, error } = await resend.emails.send(emailPayload);

    if (error) {
      console.error("RESEND_EMAIL_ERROR", error);

      return {
        success: false,
        error: error.message || "Failed to send email.",
      };
    }

    console.log("Email sent successfully:", data?.id);

    return {
      success: true,
      id: data?.id,
    };
  } catch (error) {
    console.error("SEND_EMAIL_ERROR", error);

    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Email sending failed.",
    };
  }
};