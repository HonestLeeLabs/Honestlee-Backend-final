import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { 
  createReview, 
  getReviewsByVenue, 
  toggleHelpful 
} from '../controllers/reviewController';
import { uploadReviewImages } from '../config/uploadConfig';

const router = express.Router();

// ✅ Create review with photo upload
router.post('/', authenticate, uploadReviewImages.array('photos', 5), createReview);

// ✅ Get reviews with pagination
router.get('/venue/:venueId', getReviewsByVenue);

// ✅ Toggle helpful vote
router.post('/:reviewId/helpful', authenticate, toggleHelpful);

export default router;
