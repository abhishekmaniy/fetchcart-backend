import { Router } from 'express'
import {
  forgotPassword,
  getCurrentUser,
  loginUser,
  registerUser,
  resetPassword,
  verifyEmail,
} from '../controllers/userController'
import { verifyToken } from '../utils/verifyToken'

const router = Router()

router.post('/register', registerUser)
router.post('/login', loginUser)
router.post('/refresh', loginUser)
router.get("/verify-email/:token", verifyEmail);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);

router.get("/me", verifyToken, getCurrentUser);


export default router
