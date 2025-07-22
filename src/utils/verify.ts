import { Request, Response, NextFunction } from 'express'
import jwt from "jsonwebtoken"
const SECRET = process.env.SECRET

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const verify = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization
  if (authHeader) {
    const token = authHeader.split('')[1]

    jwt.verify(token, SECRET!, (err, user) => {
      if (err) {
        return res.status(403).json('TOken is not valid')
      }
      req.user = user
      next()
    })
  } else {
    res.status(401).json('You are not authenticated')
  }
}
