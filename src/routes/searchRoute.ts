import { Router } from 'express'
import { createSearchJob, getSearchById , generateForm, getSearchHistory, deleteSearchById, toggleSearchFavorite } from '../controllers/searchController'



const router = Router()

router.post('/create', createSearchJob)
router.post('/generate-form' , generateForm)
router.get('/:searchId', getSearchById)
router.delete('/:searchId', deleteSearchById)
router.get('/' , getSearchHistory)
router.patch("/:searchId/favorite", toggleSearchFavorite);

export default router
