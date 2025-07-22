import jwt, { decode } from 'jsonwebtoken'
import { Request, Response } from 'express'

export const verify = async (req: Request, res: Response) => {
  const token = req.cookies.accessToken
  console.log(token)
  if (!token) return res.status(401).json({ message: 'Unauthorized' })

  try {
    const decoded = jwt.verify(token, process.env.SECRET!)
    console.log(decoded)
    return res.status(200).json({ message: 'Authenticated', user: decoded })
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}
