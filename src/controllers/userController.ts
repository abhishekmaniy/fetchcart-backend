import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { Request, Response } from 'express'
import db from '../db/db'
import { tokenTable, usersTable } from '../db/schema'
import { sendEmail } from '../utils/sendEmail'
import jwt from 'jsonwebtoken'
import type { CookieOptions } from 'express'

const SECRET = process.env.SECRET!

const isProduction = process.env.NODE_ENV === 'production'

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction, // 🔒 Only secure on HTTPS (production)
  sameSite: isProduction ? 'none' : 'lax', // 🔄 Cross-origin support in prod
  maxAge: 1000 * 60 * 60 * 24 * 3, // 3 days
  path: '/'
}

// ✅ CREATE USER
const createUser = async (req: Request, res: Response) => {
  try {
    const { type, user } = req.body
    const { email, password, name, imageUrl } = user

    if (!email || !name) {
      return res.status(400).json({ message: 'Missing required fields' })
    }

    const existingUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))

    if (existingUsers.length > 0) {
      const { password: pass, ...safeUser } = existingUsers[0]
      const accessToken = jwt.sign({ user: safeUser }, SECRET, {
        expiresIn: '3d'
      })
      res.cookie('accessToken', accessToken, COOKIE_OPTIONS)
      return res.status(200).json({
        message: 'User already exists',
        user: safeUser,
        verified: existingUsers[0].verified
      })
    }

    const isGoogleSignup = type === 'google'
    const hashedPassword =
      !isGoogleSignup && password ? await bcrypt.hash(password, 10) : null

    const insertedUser = await db
      .insert(usersTable)
      .values({
        email,
        name,
        imageUrl: imageUrl ?? null,
        password: hashedPassword,
        verified: isGoogleSignup
      })
      .returning()

    const userData = insertedUser[0]
    const { password: _, ...safeUser } = userData

    const accessToken = jwt.sign({ user: safeUser }, SECRET, {
      expiresIn: '3d'
    })

    res.cookie('accessToken', accessToken, COOKIE_OPTIONS)

    if (isGoogleSignup) {
      return res.status(201).json({
        message: 'User created with Google login.',
        user: safeUser
      })
    }

    const rawToken = crypto.randomBytes(32).toString('hex')

    await db.insert(tokenTable).values({
      userId: String(userData.id),
      token: rawToken
    })

    const url = `${process.env.BASE_URL}/user/${userData.id}/verify/${rawToken}`

    await sendEmail({
      email: userData.email,
      subject: 'Verify Your Email',
      text: `Please verify your email: ${url}`
    })

    return res.status(201).json({
      message: 'User created, verification email sent.',
      user: {
        id: userData.id,
        name: userData.name,
        email: userData.email,
        verified: userData.verified
      }
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

// ✅ VERIFY USER
const verifyUser = async (req: Request, res: Response) => {
  try {
    const { userId, token: tokenValue } = req.params

    const users = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))

    const user = users[0]
    if (!user) {
      return res.status(400).json({ message: 'Invalid Link - User not found' })
    }

    const tokens = await db
      .select()
      .from(tokenTable)
      .where(
        and(eq(tokenTable.token, tokenValue), eq(tokenTable.userId, userId))
      )

    const token = tokens[0]
    if (!token) {
      return res.status(400).json({ message: 'Invalid Link - Token not found' })
    }

    await db
      .update(usersTable)
      .set({ verified: true })
      .where(eq(usersTable.id, userId))

    await db.delete(tokenTable).where(eq(tokenTable.token, tokenValue))

    const { password, ...safeUser } = user
    const accessToken = jwt.sign({ user: safeUser }, SECRET, {
      expiresIn: '3d'
    })

    res.cookie('accessToken', accessToken, COOKIE_OPTIONS)

    return res.status(200).json({
      message: 'Email verified successfully',
      user: safeUser
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

// ✅ LOGIN USER
const loginUser = async (req: Request, res: Response) => {
  try {
    const { type, user } = req.body
    const { email, password } = user

    if (!email) {
      return res.status(400).json({ message: 'Email is required' })
    }

    const existingUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))

    const dbUser = existingUsers[0]
    if (!dbUser) {
      return res
        .status(400)
        .json({ message: 'Invalid email or user not found' })
    }

    const isGoogleLogin = type === 'google'
    const isManualLogin = type === 'manual'

    // Prevent manual login if account was created with Google (no password)
    if (isManualLogin && !dbUser.password) {
      return res.status(403).json({
        message:
          'You must sign in using Google. This account is linked to Google login only.'
      })
    }

    // Handle manual login
    if (isManualLogin) {
      const isPasswordValid = await bcrypt.compare(
        password,
        dbUser.password || ''
      )
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Invalid email or password' })
      }
    }

    // Handle Google login verification (skip password)
    if (isGoogleLogin) {
      if (!dbUser.verified) {
        await db
          .update(usersTable)
          .set({ verified: true })
          .where(eq(usersTable.id, dbUser.id))
      }
    }

    // If email not verified for manual login
    if (!dbUser.verified && isManualLogin) {
      await db
        .delete(tokenTable)
        .where(eq(tokenTable.userId, String(dbUser.id)))

      const rawToken = crypto.randomBytes(32).toString('hex')
      await db.insert(tokenTable).values({
        userId: String(dbUser.id),
        token: rawToken
      })

      const url = `${process.env.BASE_URL}/user/${dbUser.id}/verify/${rawToken}`

      await sendEmail({
        email: dbUser.email,
        subject: 'Verify Email',
        text: url
      })

      return res.status(401).json({
        message: 'Email not verified. Verification link resent.'
      })
    }

    const { password: _, ...safeUser } = dbUser

    const accessToken = jwt.sign({ user: safeUser }, SECRET, {
      expiresIn: '3d'
    })

    res.cookie('accessToken', accessToken, COOKIE_OPTIONS)

    return res.status(200).json({
      message: 'Login successful',
      user: safeUser
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

const logoutUser = (req: Request, res: Response) => {
  res.clearCookie('accessToken', COOKIE_OPTIONS)
  return res.status(200).json({ message: 'Logged out successfully' })
}

export { createUser, verifyUser, loginUser, logoutUser }
