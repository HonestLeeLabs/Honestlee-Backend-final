import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import {
  submitSpeedTest,
  getVenueSpeedTests,
  getMySpeedTests,
  deleteSpeedTest
  // ✅ REMOVED: runSpeedTest - we don't need it anymore
} from '../controllers/wifiSpeedTestController';

const router = express.Router();

// ✅ REMOVED: Server-side speed test route - we're doing client-side only
// router.post('/run-test', authenticate, runSpeedTest);

// Submit speed test (requires authentication)
router.post('/test', authenticate, submitSpeedTest);

// Get venue speed tests (public or authenticated)
router.get('/venue/:venueId', getVenueSpeedTests);

// Get my speed test history
router.get('/my-tests', authenticate, getMySpeedTests);

// Delete speed test
router.delete('/test/:testId', authenticate, deleteSpeedTest);

export default router;