import { Router } from 'express'
import {generateForm, search} from '../controllers/searchController'



const router = Router()

router.post('/create', search)
router.post('/generate-form' , generateForm)


export default router
