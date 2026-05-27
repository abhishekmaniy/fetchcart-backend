import { Router } from "express";

import {
  createCompareJob,
  deleteCompare,
  getCompareById,
  getCompareHistory,
  toggleCompareFavorite,
} from "../controllers/compareController";

const router = Router();

router.post("/create", createCompareJob);

router.get("/", getCompareHistory);

router.get("/:compareId", getCompareById);

router.patch("/:compareId/favorite", toggleCompareFavorite);

router.delete("/:compareId", deleteCompare);

export default router;