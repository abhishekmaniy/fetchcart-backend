const verifyEmailTemplate = ({
  name,
  verifyUrl,
}: {
  name?: string;
  verifyUrl: string;
}) => {
  const displayName = name?.trim() || "there";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Verify your email</title>
</head>

<body style="margin:0; padding:0; background:#050812; font-family:Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#050812; padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; width:100%;">
          
          <!-- Header -->
          <tr>
            <td style="padding:0 0 20px 0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td align="left">
                    <div style="display:inline-flex; align-items:center;">
                      <div style="width:44px; height:44px; border-radius:12px; background:linear-gradient(135deg,#7c3aed,#38bdf8); display:inline-block; text-align:center; line-height:44px; font-size:22px; font-weight:700;">
                        🛒
                      </div>
                      <span style="display:inline-block; margin-left:12px; font-size:22px; font-weight:800; letter-spacing:-0.4px; color:#ffffff;">
                        FetchCart <span style="color:#8b5cf6;">AI</span>
                      </span>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="border:1px solid rgba(139,92,246,0.24); border-radius:28px; overflow:hidden; background:linear-gradient(145deg,#0b1020 0%,#11112a 42%,#071423 100%); box-shadow:0 24px 80px rgba(88,28,135,0.35);">
              
              <!-- Top Glow -->
              <div style="height:5px; background:linear-gradient(90deg,#7c3aed,#8b5cf6,#38bdf8);"></div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:44px 38px 36px 38px;">

                    <!-- Badge -->
                    <div style="margin-bottom:26px;">
                      <span style="display:inline-block; padding:8px 14px; border-radius:999px; background:rgba(139,92,246,0.12); border:1px solid rgba(139,92,246,0.28); color:#c4b5fd; font-size:13px; font-weight:700; letter-spacing:0.2px;">
                        ✨ Secure email verification
                      </span>
                    </div>

                    <!-- Heading -->
                    <h1 style="margin:0; font-size:38px; line-height:1.15; font-weight:800; letter-spacing:-1.2px; color:#ffffff;">
                      Verify your email to start shopping smarter
                    </h1>

                    <!-- Text -->
                    <p style="margin:22px 0 0 0; font-size:16px; line-height:1.75; color:#aab2c5;">
                      Hi ${displayName},
                    </p>

                    <p style="margin:10px 0 0 0; font-size:16px; line-height:1.75; color:#aab2c5;">
                      Welcome to <strong style="color:#ffffff;">FetchCart AI</strong>. Please verify your email address to activate your account and unlock AI-powered product discovery, smart comparisons, and better buying decisions.
                    </p>

                    <!-- CTA -->
                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:34px 0 28px 0;">
                      <tr>
                        <td align="center" style="border-radius:16px; background:linear-gradient(135deg,#7c3aed,#38bdf8); box-shadow:0 14px 34px rgba(124,58,237,0.38);">
                          <a href="${verifyUrl}" target="_blank" style="display:inline-block; padding:16px 30px; font-size:15px; font-weight:800; color:#ffffff; text-decoration:none; border-radius:16px; letter-spacing:0.2px;">
                            Verify Email Address
                          </a>
                        </td>
                      </tr>
                    </table>

                    <!-- Fallback -->
                    <div style="padding:18px 20px; border-radius:18px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);">
                      <p style="margin:0 0 10px 0; font-size:13px; line-height:1.6; color:#8f9bb3;">
                        Button not working? Copy and paste this link into your browser:
                      </p>
                      <a href="${verifyUrl}" target="_blank" style="word-break:break-all; font-size:13px; line-height:1.6; color:#60a5fa; text-decoration:none;">
                        ${verifyUrl}
                      </a>
                    </div>

                    <!-- Security note -->
                    <p style="margin:24px 0 0 0; font-size:14px; line-height:1.7; color:#7f8aa3;">
                      If you did not create a FetchCart AI account, you can safely ignore this email. This verification link is intended only for your account security.
                    </p>

                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:26px 20px 0 20px;">
              <p style="margin:0; font-size:13px; line-height:1.7; color:#6b7280;">
                © ${new Date().getFullYear()} FetchCart AI. Smarter shopping, powered by AI.
              </p>
              <p style="margin:8px 0 0 0; font-size:12px; line-height:1.7; color:#4b5563;">
                This is an automated email. Please do not reply directly to this message.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
};

export default verifyEmailTemplate;