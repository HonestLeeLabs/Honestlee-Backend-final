import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  submitSpeedTest,
  getVenueSpeedTests,
  getMySpeedTests,
  deleteSpeedTest,
  getVenueSSIDs
} from '../controllers/wifiSpeedTestController';

const router = express.Router();

// Submit speed test (requires authentication)
router.post('/test', authenticate, submitSpeedTest);

// Get venue speed tests (public or authenticated)
router.get('/venue/:venueId', getVenueSpeedTests);

// ✅ NEW: Get available SSIDs for a venue (public)
router.get('/venue/:venueId/ssids', getVenueSSIDs);

// Get my speed test history
router.get('/my-tests', authenticate, getMySpeedTests);

// Delete speed test
router.delete('/test/:testId', authenticate, deleteSpeedTest);

export default router;
