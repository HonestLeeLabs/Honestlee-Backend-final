import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  submitSpeedTest,
  getVenueSpeedTests,
  getMySpeedTests,
  deleteSpeedTest,
  runSpeedTest  // ✅ Add this import
} from '../controllers/wifiSpeedTestController';

const router = express.Router();

// ✅ NEW: Run speed test server-side
router.post('/run-test', authenticate, runSpeedTest);

// Submit speed test (requires authentication)
router.post('/test', authenticate, submitSpeedTest);

// Get venue speed tests (public or authenticated)
router.get('/venue/:venueId', getVenueSpeedTests);

// Get my speed test history
router.get('/my-tests', authenticate, getMySpeedTests);

// Delete speed test
router.delete('/test/:testId', authenticate, deleteSpeedTest);

export default router;
