import { Request, Response, NextFunction } from 'express'
import jwt from "jsonwebtoken"
import { env } from '../config/env';
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email?: string };
    }
  }
}

export const verify = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  if (authHeader) {
    const token = authHeader.split(' ')[1]

    jwt.verify(token, env.JWT_SECRET!, (err, user) => {
      if (err) {
        return res.status(403).json('Token is not valid')
      }
      req.user = user as { id: string; email?: string }
      next()
    })
  } else {
    res.status(401).json('You are not authenticated')
  }
}
