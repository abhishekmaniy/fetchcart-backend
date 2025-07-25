import jwt, { decode } from 'jsonwebtoken'
import { Request, Response } from 'express'
import { getUserNestedData } from '../utils/getUserNestedData'

export const verify = async (req: Request, res: Response) => {
  const token = req.cookies.accessToken
  console.log(token)
  if (!token) return res.status(401).json({ message: 'Unauthorized' })

  try {
    const decoded = jwt.verify(token, process.env.SECRET!)
    console.log(decoded)
    const userId = (decoded as any).user.id
    console.log(userId)
    const user = await getUserNestedData(userId)
    console.log(decoded)
    return res.status(200).json({ message: 'Authenticated', user })
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' })
  }
}
