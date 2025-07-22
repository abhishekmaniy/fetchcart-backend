import { Router } from 'express'
import {
  createUser,
  loginUser,
  verifyUser,
  logoutUser
} from '../controllers/userController'

const router = Router()

router.post('/create', createUser)
router.post('/login', loginUser)
router.post('/logout', logoutUser)
router.get('/:userId/verify/:token', verifyUser)

export default router
