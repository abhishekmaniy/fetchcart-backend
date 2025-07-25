import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

export const verifyToken = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token = req.cookies?.accessToken

  if (!token) {
    console.log('No token found in cookies')
    return res.status(401).json({ message: 'Unauthorized: No token provided' })
  }

  try {
    const decoded = jwt.verify(token, process.env.SECRET!)
    console.log('Verified Token:', decoded)

    // Optionally attach to req.user
    req.user = (decoded as any).user

    next()
  } catch (err) {
    console.log('JWT verification failed:', err)
    return res
      .status(401)
      .json({ message: 'Unauthorized: Invalid or expired token' })
  }
}
