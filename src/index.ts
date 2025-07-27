import express from 'express'
import userRoute from './routes/userRoutes'
import searchRoute from './routes/searchRoute'
import authRoute from './routes/authRoutes'
import compareRoute from './routes/compareRoute'
import dotenv from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import { verifyToken } from './utils/verifyToken'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(cookieParser())
app.use(express.json())
const allowedOrigins = [
  'http://localhost:8080',
  'https://fetchcart-ai-find.vercel.app'
]

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true)
      } else {
        callback(new Error('Not allowed by CORS'))
      }
    },
    credentials: true
  })
)

// Public routes (accessible without token)
app.use('/user', userRoute)
app.use('/auth', authRoute)
app.use('/compare', compareRoute)

// 🔒 Secure all routes defined after this point
app.use(verifyToken)

// Protected routes
app.use('/search', searchRoute)
// Add more protected routes below as needed

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
