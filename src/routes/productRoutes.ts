import express, { Router } from "express";

import { toggleProductLike } from "../controllers/product.controller";

const router = Router();

router.patch("/:productId/like", toggleProductLike);

export default router;