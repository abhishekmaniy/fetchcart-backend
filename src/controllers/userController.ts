import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import type { CookieOptions } from "express";
import { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { OAuth2Client } from "google-auth-library";

import db from "../config/db";
import { userPlansTable, usersTable } from "../db/schema";
import { sendEmail } from "../utils/sendEmail";
import verifyEmailTemplate from "../templates/verifyEmailTemplate";
import { env } from "../config/env";

const isProduction = env.NODE_ENV === "production";

const REFRESH_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  maxAge: 1000 * 60 * 60 * 24 * 7,
  path: "/user/refresh",
};

const googleClient = new OAuth2Client(env.GOOGLE_CLIENT_ID);

type EmailVerificationPayload = jwt.JwtPayload & {
  userId: string;
  email: string;
  purpose: "EMAIL_VERIFICATION";
};

type PasswordResetPayload = jwt.JwtPayload & {
  userId: string;
  email: string;
  purpose: "PASSWORD_RESET";
};

const createAccessToken = (user: any) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    env.ACCESS_TOKEN_SECRET as jwt.Secret,
    {
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    } as jwt.SignOptions
  );
};

const createRefreshToken = (user: any) => {
  return jwt.sign(
    {
      userId: user.id,
    },
    env.REFRESH_TOKEN_SECRET as jwt.Secret,
    {
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    } as jwt.SignOptions
  );
};

const createEmailVerificationJwt = (user: any) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      purpose: "EMAIL_VERIFICATION",
    },
    env.EMAIL_VERIFICATION_SECRET as jwt.Secret,
    {
      expiresIn:
        env.EMAIL_VERIFICATION_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    } as jwt.SignOptions
  );
};

const createPasswordResetJwt = (user: any) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      purpose: "PASSWORD_RESET",
    },
    env.PASSWORD_RESET_SECRET as jwt.Secret,
    {
      expiresIn: env.PASSWORD_RESET_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    } as jwt.SignOptions
  );
};

const setRefreshTokenCookie = (res: Response, refreshToken: string) => {
  res.cookie("refreshToken", refreshToken, REFRESH_COOKIE_OPTIONS);
};

const getSafeUser = (user: any) => {
  const { password, ...safeUser } = user;
  return safeUser;
};

const getPasswordResetEmailHtml = ({
  name,
  resetUrl,
}: {
  name?: string;
  resetUrl: string;
}) => {
  const displayName = name?.trim() || "there";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Reset your password</title>
</head>
<body style="margin:0; padding:0; background:#050812; font-family:Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; color:#ffffff;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#050812; padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:640px; width:100%;">
          <tr>
            <td style="padding:0 0 20px 0;">
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

          <tr>
            <td style="border:1px solid rgba(139,92,246,0.24); border-radius:28px; overflow:hidden; background:linear-gradient(145deg,#0b1020 0%,#11112a 42%,#071423 100%); box-shadow:0 24px 80px rgba(88,28,135,0.35);">
              <div style="height:5px; background:linear-gradient(90deg,#7c3aed,#8b5cf6,#38bdf8);"></div>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="padding:44px 38px 36px 38px;">
                    <div style="margin-bottom:26px;">
                      <span style="display:inline-block; padding:8px 14px; border-radius:999px; background:rgba(139,92,246,0.12); border:1px solid rgba(139,92,246,0.28); color:#c4b5fd; font-size:13px; font-weight:700;">
                        🔐 Password reset request
                      </span>
                    </div>

                    <h1 style="margin:0; font-size:38px; line-height:1.15; font-weight:800; letter-spacing:-1.2px; color:#ffffff;">
                      Reset your FetchCart AI password
                    </h1>

                    <p style="margin:22px 0 0 0; font-size:16px; line-height:1.75; color:#aab2c5;">
                      Hi ${displayName},
                    </p>

                    <p style="margin:10px 0 0 0; font-size:16px; line-height:1.75; color:#aab2c5;">
                      We received a request to reset your password. This link will expire in <strong style="color:#ffffff;">15 minutes</strong>.
                    </p>

                    <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:34px 0 28px 0;">
                      <tr>
                        <td align="center" style="border-radius:16px; background:linear-gradient(135deg,#7c3aed,#38bdf8); box-shadow:0 14px 34px rgba(124,58,237,0.38);">
                          <a href="${resetUrl}" target="_blank" style="display:inline-block; padding:16px 30px; font-size:15px; font-weight:800; color:#ffffff; text-decoration:none; border-radius:16px;">
                            Reset Password
                          </a>
                        </td>
                      </tr>
                    </table>

                    <div style="padding:18px 20px; border-radius:18px; background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08);">
                      <p style="margin:0 0 10px 0; font-size:13px; line-height:1.6; color:#8f9bb3;">
                        Button not working? Copy and paste this link into your browser:
                      </p>
                      <a href="${resetUrl}" target="_blank" style="word-break:break-all; font-size:13px; line-height:1.6; color:#60a5fa; text-decoration:none;">
                        ${resetUrl}
                      </a>
                    </div>

                    <p style="margin:24px 0 0 0; font-size:14px; line-height:1.7; color:#7f8aa3;">
                      If you did not request this password reset, you can safely ignore this email.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td align="center" style="padding:26px 20px 0 20px;">
              <p style="margin:0; font-size:13px; line-height:1.7; color:#6b7280;">
                © ${new Date().getFullYear()} FetchCart AI. Smarter shopping, powered by AI.
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

// REGISTER USER
const registerUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters long",
      });
    }

    const existingUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    if (existingUsers.length > 0) {
      return res.status(409).json({
        message: "User already exists. Please login instead.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const insertedUser = await db
      .insert(usersTable)
      .values({
        name,
        email,
        password: hashedPassword,
        verified: false,
      })
      .returning();

    const userData = insertedUser[0];

    const verificationToken = createEmailVerificationJwt(userData);

    const verifyUrl = `${env.FRONTEND_URL}/verify-email/${verificationToken}`;

    await sendEmail({
      email: userData.email,
      subject: "Verify your FetchCart AI email",
      text: `Please verify your email: ${verifyUrl}`,
      html: verifyEmailTemplate({
        name: userData.name,
        verifyUrl,
      }),
    });

    return res.status(201).json({
      message: "Account created. Please verify your email before signing in.",
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        imageUrl: userData.imageUrl,
        verified: userData.verified,
      },
    });
  } catch (error) {
    console.error("Register user error:", error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

// LOGIN USER
const loginUser = async (req: Request, res: Response) => {
  try {
    const { provider } = req.body;

    if (!provider || !["credentials", "google"].includes(provider)) {
      return res.status(400).json({
        message: "Invalid login provider",
      });
    }

    if (provider === "google") {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({
          message: "Google token is required",
        });
      }

      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });

      const payload = ticket.getPayload();

      if (!payload?.email) {
        return res.status(400).json({
          message: "Google account email not found",
        });
      }

      const email = payload.email;
      const name = payload.name || "Google User";
      const imageUrl = payload.picture || null;

      const existingUsers = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, email));

      let dbUser = existingUsers[0];

      if (!dbUser) {
        const insertedUser = await db
          .insert(usersTable)
          .values({
            name,
            email,
            imageUrl,
            password: null,
            verified: true,
          })
          .returning();

        dbUser = insertedUser[0];
      } else if (!dbUser.verified || !dbUser.imageUrl) {
        const updatedUser = await db
          .update(usersTable)
          .set({
            verified: true,
            imageUrl: dbUser.imageUrl || imageUrl,
            updatedAt: new Date(),
          })
          .where(eq(usersTable.id, dbUser.id))
          .returning();

        dbUser = updatedUser[0];
      }

      const safeUser = getSafeUser(dbUser);
      const accessToken = createAccessToken(dbUser);
      const refreshToken = createRefreshToken(dbUser);

      setRefreshTokenCookie(res, refreshToken);

      return res.status(200).json({
        message: "Google login successful",
        user: safeUser,
        accessToken,
      });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    const existingUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    const dbUser = existingUsers[0];

    if (!dbUser) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }

    if (!dbUser.password) {
      return res.status(403).json({
        message: "This account uses Google login. Please sign in with Google.",
      });
    }

    const isPasswordValid = await bcrypt.compare(password, dbUser.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        message: "Invalid email or password",
      });
    }

    if (!dbUser.verified) {
      const verificationToken = createEmailVerificationJwt(dbUser);

      const verifyUrl = `${env.FRONTEND_URL}/verify-email/${verificationToken}`;

      await sendEmail({
        email: dbUser.email,
        subject: "Verify your FetchCart AI email",
        text: `Please verify your email: ${verifyUrl}`,
        html: verifyEmailTemplate({
          name: dbUser.name,
          verifyUrl,
        }),
      });

      return res.status(401).json({
        message: "Email not verified. Verification link has been resent.",
      });
    }

    const safeUser = getSafeUser(dbUser);
    const accessToken = createAccessToken(dbUser);
    const refreshToken = createRefreshToken(dbUser);

    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      message: "Login successful",
      user: safeUser,
      accessToken,
    });
  } catch (error) {
    console.error("Login user error:", error);

    return res.status(500).json({
      message: "Internal Server Error",
    });
  }
};

const refreshUser = async (req: Request, res: Response) => {
  try {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({
        message: "Refresh token missing",
      });
    }

    const decoded = jwt.verify(refreshToken, env.REFRESH_TOKEN_SECRET) as {
      userId: string;
    };

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId));

    const dbUser = users[0];

    if (!dbUser) {
      return res.status(401).json({
        message: "Invalid refresh token",
      });
    }

    const safeUser = getSafeUser(dbUser);
    const newAccessToken = createAccessToken(dbUser);
    const newRefreshToken = createRefreshToken(dbUser);

    setRefreshTokenCookie(res, newRefreshToken);

    return res.status(200).json({
      message: "Token refreshed successfully",
      user: safeUser,
      accessToken: newAccessToken,
    });
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired refresh token",
    });
  }
};

const getCurrentUser = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. User not found in token.",
      });
    }

    const [user] = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        imageUrl: usersTable.imageUrl,
        verified: usersTable.verified,
        createdAt: usersTable.createdAt,
        updatedAt: usersTable.updatedAt,
      })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    const [userPlan] = await db
      .select({
        id: userPlansTable.id,
        plan: userPlansTable.plan,
        startsAt: userPlansTable.startsAt,
        expiresAt: userPlansTable.expiresAt,
        isActive: userPlansTable.isActive,
        lastPaymentId: userPlansTable.lastPaymentId,
        createdAt: userPlansTable.createdAt,
        updatedAt: userPlansTable.updatedAt,
      })
      .from(userPlansTable)
      .where(eq(userPlansTable.userId, userId))
      .limit(1);

    const now = new Date();

    const isPlanValid =
      Boolean(userPlan?.isActive) &&
      (!userPlan?.expiresAt || userPlan.expiresAt > now);

    const effectivePlan = isPlanValid ? userPlan?.plan : "FREE";

    return res.status(200).json({
      success: true,
      message: "User details fetched successfully.",
      data: {
        user: {
          ...user,
          plan: effectivePlan,
          userPlan: userPlan
            ? {
                ...userPlan,
                effectivePlan,
                isExpired: userPlan.expiresAt
                  ? userPlan.expiresAt <= now
                  : false,
              }
            : {
                plan: "FREE",
                effectivePlan: "FREE",
                startsAt: null,
                expiresAt: null,
                isActive: true,
                isExpired: false,
              },
        },
      },
    });
  } catch (error) {
    console.error("GET_CURRENT_USER_ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while fetching user details.",
    });
  }
};

const verifyEmail = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification link.",
      });
    }

    let decoded: EmailVerificationPayload;

    try {
      decoded = jwt.verify(
        token,
        env.EMAIL_VERIFICATION_SECRET
      ) as EmailVerificationPayload;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Verification link is invalid or expired. Please login again to receive a new verification email.",
      });
    }

    if (decoded.purpose !== "EMAIL_VERIFICATION" || !decoded.userId) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification token.",
      });
    }

    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1);

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    let verifiedUser = dbUser;

    if (!dbUser.verified) {
      const [updatedUser] = await db
        .update(usersTable)
        .set({
          verified: true,
          updatedAt: new Date(),
        })
        .where(eq(usersTable.id, dbUser.id))
        .returning();

      verifiedUser = updatedUser;
    }

    const safeUser = getSafeUser(verifiedUser);
    const accessToken = createAccessToken(verifiedUser);
    const refreshToken = createRefreshToken(verifiedUser);

    setRefreshTokenCookie(res, refreshToken);

    return res.status(200).json({
      success: true,
      message: dbUser.verified
        ? "Email is already verified."
        : "Email verified successfully.",
      user: safeUser,
      accessToken,
    });
  } catch (error) {
    console.error("VERIFY_EMAIL_ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while verifying email.",
    });
  }
};

const forgotPassword = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required.",
      });
    }

    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    const genericMessage =
      "If an account exists with this email, a password reset link has been sent.";

    if (!dbUser) {
      return res.status(200).json({
        success: true,
        message: genericMessage,
      });
    }

    const resetToken = createPasswordResetJwt(dbUser);

    const resetUrl = `${env.FRONTEND_URL}/reset-password/${resetToken}`;

    await sendEmail({
      email: dbUser.email,
      subject: "Reset your FetchCart AI password",
      text: `Reset your password: ${resetUrl}`,
      html: getPasswordResetEmailHtml({
        name: dbUser.name,
        resetUrl,
      }),
    });

    return res.status(200).json({
      success: true,
      message: genericMessage,
    });
  } catch (error) {
    console.error("FORGOT_PASSWORD_ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while sending password reset email.",
    });
  }
};

const resetPassword = async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Invalid password reset link.",
      });
    }

    if (!password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Password and confirm password are required.",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Passwords do not match.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters long.",
      });
    }

    let decoded: PasswordResetPayload;

    try {
      decoded = jwt.verify(
        token,
        env.PASSWORD_RESET_SECRET
      ) as PasswordResetPayload;
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Password reset link is invalid or expired. Please request a new one.",
      });
    }

    if (decoded.purpose !== "PASSWORD_RESET" || !decoded.userId) {
      return res.status(400).json({
        success: false,
        message: "Invalid password reset token.",
      });
    }

    const [dbUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, decoded.userId))
      .limit(1);

    if (!dbUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!dbUser.password) {
      return res.status(403).json({
        success: false,
        message:
          "This account was created using Google. You cannot change the password for this account. Please sign in with Google.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    await db
      .update(usersTable)
      .set({
        password: hashedPassword,
        verified: true,
        updatedAt: new Date(),
      })
      .where(eq(usersTable.id, dbUser.id));

    return res.status(200).json({
      success: true,
      message:
        "Password reset successfully. Please login with your new password.",
    });
  } catch (error) {
    console.error("RESET_PASSWORD_ERROR", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while resetting password.",
    });
  }
};

export {
  loginUser,
  registerUser,
  refreshUser,
  getCurrentUser,
  verifyEmail,
  forgotPassword,
  resetPassword,
};