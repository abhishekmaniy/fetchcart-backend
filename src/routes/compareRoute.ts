import { Router } from 'express'
import { scrapeProductPage } from '../controllers/compareController'

const router = Router()

router.post('/product', scrapeProductPage)

export default router
