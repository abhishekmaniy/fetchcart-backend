import express from 'express'
import userRoute from './routes/userRoutes'
import dotenv from 'dotenv'
import cors from 'cors'

// Load environment variables
dotenv.config()

console.log(process.env.DATABASE_URL)

const app = express()
const PORT = process.env.PORT || 5000

// Middleware
app.use(express.json())
app.use(cors())

// Routes
app.use('/user', userRoute)

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`)
})
