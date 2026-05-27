import { NextFunction, Request, Response } from 'express'
import jwt from 'jsonwebtoken'
import type { JwtPayload } from 'jsonwebtoken'
import { env } from '../config/env'

type AccessTokenPayload = JwtPayload & {
  userId: string
  email: string
}


if (!env.ACCESS_TOKEN_SECRET) {
  throw new Error('ACCESS_TOKEN_SECRET is missing in environment variables')
}

const getBearerToken = (req: Request) => {
  const authHeader = req.headers.authorization

  if (!authHeader) {
    return null
  }

  const [scheme, token] = authHeader.split(' ')

  if (scheme !== 'Bearer' || !token) {
    return null
  }

  return token
}

export const verifyToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = getBearerToken(req)

  if (!token) {
    return res.status(401).json({
      message: 'Unauthorized. Access token is missing.',
      code: 'ACCESS_TOKEN_MISSING',
    })
  }

  try {
    const decoded = jwt.verify(token, env.ACCESS_TOKEN_SECRET) as AccessTokenPayload

    if (!decoded.userId) {
      return res.status(401).json({
        message: 'Unauthorized. Invalid access token payload.',
        code: 'INVALID_ACCESS_TOKEN_PAYLOAD',
      })
    }

    req.user = {
      id: decoded.userId,
      email: decoded.email,
    }

    return next()
  } catch (err: unknown) {
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        message: 'Access token expired. Please refresh your session.',
        code: 'ACCESS_TOKEN_EXPIRED',
      })
    }

    return res.status(401).json({
      message: 'Unauthorized. Token verification failed.',
      code: 'TOKEN_VERIFICATION_FAILED',
    })
  }
}