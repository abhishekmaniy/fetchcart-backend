import { Router } from "express";
import { createUser, verifyUser } from "../controllers/userController";

const router = Router()

router.post("/create" , createUser)
router.get("/:userId/verify/:token" , verifyUser )


export default router