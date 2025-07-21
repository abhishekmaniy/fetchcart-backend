import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { and, eq } from 'drizzle-orm'
import { Request, Response } from 'express'
import db from '../db/db'
import { tokenTable, usersTable } from '../db/schema'
import { sendEmail } from '../utils/sendEmail'

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
      return res.status(200).json({
        message: 'User already exists',
        user: existingUsers[0],
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

    if (isGoogleSignup) {
      return res.status(201).json({
        message: 'User created with Google login.',
        user: userData
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

    return res.status(200).json({ message: 'Email verified successfully' })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

const loginUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body

    const existingUsers = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))

    const user = existingUsers[0]

    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' })
    }

    const isPasswordValid = await bcrypt.compare(password, user.password || '')

    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid email or password' })
    }

    if (!user.verified) {
      await db.delete(tokenTable).where(eq(tokenTable.userId, String(user.id)))

      const rawToken = crypto.randomBytes(32).toString('hex')

      await db.insert(tokenTable).values({
        userId: String(user.id),
        token: rawToken
      })

      const url = `${process.env.BASE_URL}/user/${user.id}/verify/${rawToken}`

      await sendEmail({
        email: user.email,
        subject: 'Verify Email',
        text: url
      })

      return res.status(401).json({
        message: 'Email not verified. Verification link resent.'
      })
    }

    // ✅ Authenticated & verified — issue auth token (example with JWT)
    // const authToken = jwt.sign({ id: user.id }, process.env.JWT_SECRET!, {
    //   expiresIn: '1d'
    // })

    // You can return token or session info here
    return res.status(200).json({
      message: 'Login successful',
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
      // token: authToken
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}
export { createUser, loginUser, verifyUser }
