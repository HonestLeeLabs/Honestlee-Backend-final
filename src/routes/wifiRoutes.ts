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
  startLiveSpeedTest,  // NEW: Live speed test with Server-Sent Events
  getSpeedTestLogs,    // NEW: Debug logs endpoint
  testSSEConnection    // NEW: SSE connection test
} from '../controllers/wifiController';

const router = express.Router();

// Get SpeedOf.Me API configuration
// GET /api/wifi/config
router.get('/config', authenticate, getSpeedTestConfig);

// NEW: Live speed test with real-time updates via Server-Sent Events
// GET /api/wifi/live-test
router.get('/live-test', authenticate, startLiveSpeedTest);

// NEW: Debug logs endpoint (for AWS debugging)
// GET /api/wifi/logs
router.get('/logs', authenticate, getSpeedTestLogs);

// NEW: Test SSE connection
// GET /api/wifi/test-sse
router.get('/test-sse', testSSEConnection);

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
    version: '2.0.0',
    endpoints: {
      config: 'GET /api/wifi/config - Get SpeedOf.Me configuration',
      liveTest: 'GET /api/wifi/live-test - Start live speed test with real-time updates (SSE)',
      logs: 'GET /api/wifi/logs - View recent speed test logs (AWS debugging)',
      testSSE: 'GET /api/wifi/test-sse - Test Server-Sent Events connection',
      testReal: 'POST /api/wifi/test-real - Legacy speed test endpoint',
      testStatus: 'GET /api/wifi/test-status - Get speed test results',
      debug: 'GET /api/wifi/debug - Debug user tests',
      test: 'POST /api/wifi/test - Submit speed test results', 
      history: 'GET /api/wifi/history - Get test history',
      latest: 'GET /api/wifi/latest - Get latest test',
      delete: 'DELETE /api/wifi/test/:testId - Delete specific test'
    },
    features: [
      'Real-time speed testing with live updates via SSE',
      'Enhanced AWS logging and debugging',
      'Professional speedometer integration',
      'Fast.com (Netflix CDN) speed testing',
      'IP geolocation and network analysis',
      'Comprehensive test history and statistics',
      'Server-Sent Events for live progress updates',
      'AWS/nginx compatibility optimizations'
    ],
    timestamp: new Date().toISOString(),
    server: 'AWS EC2 with nginx proxy'
  });
});

export default router;
