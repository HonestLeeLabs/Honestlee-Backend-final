import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { 
  createReview, 
  getReviewsByVenue, 
  toggleHelpful,
  getMyReviews,
  deleteMyReview,
  updateMyReview
} from '../controllers/reviewController';
import { uploadReviewImages } from '../config/uploadConfig';

const router = express.Router();

// ✅ Create review with photo upload
router.post('/', authenticate, uploadReviewImages.array('photos', 20), createReview);

// ✅ Get user's own reviews
router.get('/my-reviews', authenticate, getMyReviews);

// ✅ Update user's own review
router.put('/:reviewId', authenticate, uploadReviewImages.array('photos', 20), updateMyReview);

// ✅ Delete user's own review
router.delete('/:reviewId', authenticate, deleteMyReview);

// ✅ Get reviews by venue
router.get('/venue/:venueId', getReviewsByVenue);

// ✅ Toggle helpful vote
router.post('/:reviewId/helpful', authenticate, toggleHelpful);

export default router;