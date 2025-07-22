import { Router } from 'express'
import { verify } from '../controllers/authController'

const router = Router()

router.post('/verify', verify)

export default router
