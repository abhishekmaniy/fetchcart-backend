import express from 'express'
import userRoute from './routes/userRoutes'
import searchRoute from './routes/searchRoute'
import authRoute from './routes/authRoutes'
import dotenv from 'dotenv'
import cors from 'cors'
import cookieParser from 'cookie-parser'

// Load environment variables
dotenv.config()

console.log(process.env.DATABASE_URL)

const app = express()
const PORT = process.env.PORT || 5000

// Middleware

app.use(cookieParser())

app.use(express.json())
app.use(
  cors({
    origin: 'http://localhost:8080', // frontend origin
    credentials: true
  })
)

// Routes
app.use('/user', userRoute)
app.use('/auth', authRoute)
app.use('/search' , searchRoute)

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
