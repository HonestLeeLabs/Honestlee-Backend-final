import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { createReview, getReviewsByVenue } from '../controllers/reviewController';

const router = express.Router();

router.post('/', authenticate, createReview);
router.get('/venue/:venueId', getReviewsByVenue);

export default router;
