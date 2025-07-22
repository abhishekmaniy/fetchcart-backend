import { Router } from 'express'
import search from '../controllers/searchController'



const router = Router()

router.post('/create', search)


export default router
