import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { 
  getSpeedTestConfig,
  submitWifiTest, 
  getUserWifiTests,
  getLatestSpeedTest,
  deleteSpeedTest,
  performRealSpeedTest,
  getSpeedTestStatus,
  debugUserTests,
  startLiveSpeedTest  // NEW: Live speed test with Server-Sent Events
} from '../controllers/wifiController';

const router = express.Router();

// Get SpeedOf.Me API configuration
// GET /api/wifi/config
router.get('/config', authenticate, getSpeedTestConfig);

// NEW: Live speed test with real-time updates via Server-Sent Events
// GET /api/wifi/live-test
router.get('/live-test', authenticate, startLiveSpeedTest);

// Enhanced speed test with multiple providers (background processing)
// POST /api/wifi/test-real
router.post('/test-real', authenticate, performRealSpeedTest);

// Get speed test status/results
// GET /api/wifi/test-status
router.get('/test-status', authenticate, getSpeedTestStatus);

// Debug endpoint to see all user tests
// GET /api/wifi/debug
router.get('/debug', authenticate, debugUserTests);

// Submit speed test results from SpeedOf.Me API
// POST /api/wifi/test
router.post('/test', authenticate, submitWifiTest);

// Get user's speed test history with pagination and statistics
// GET /api/wifi/history?limit=10&page=1&sortBy=createdAt&sortOrder=desc
router.get('/history', authenticate, getUserWifiTests);

// Get user's latest/most recent speed test
// GET /api/wifi/latest
router.get('/latest', authenticate, getLatestSpeedTest);

// Delete specific speed test by ID
// DELETE /api/wifi/test/:testId
router.delete('/test/:testId', authenticate, deleteSpeedTest);

// Health check endpoint for WiFi module
// GET /api/wifi/health
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'WiFi speed test module is running',
    endpoints: {
      config: 'GET /api/wifi/config - Get SpeedOf.Me configuration',
      liveTest: 'GET /api/wifi/live-test - Start live speed test with real-time updates (Server-Sent Events)',
      testReal: 'POST /api/wifi/test-real - Perform enhanced speed test with multiple providers',
      testStatus: 'GET /api/wifi/test-status - Get speed test results',
      debug: 'GET /api/wifi/debug - Debug user tests',
      test: 'POST /api/wifi/test - Submit speed test results', 
      history: 'GET /api/wifi/history - Get test history',
      latest: 'GET /api/wifi/latest - Get latest test',
      delete: 'DELETE /api/wifi/test/:testId - Delete specific test'
    },
    features: [
      'Real-time speed testing with live updates',
      'Multiple provider fallback system',
      'Server-Sent Events for live progress',
      'Professional speedometer integration',
      'Comprehensive test history and statistics'
    ],
    timestamp: new Date().toISOString()
  });
});

export default router;
