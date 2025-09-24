import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { 
  startLiveSpeedTest,
  getSpeedTestStatus,
  getSessionLogs,      
  streamSessionLogs,    // NEW: Console-like streaming logs
  getUserWifiTests,
  getLatestSpeedTest,
  deleteSpeedTest,
  getSpeedTestLogs
} from '../controllers/wifiController';

const router = express.Router();

// Main live speed test
router.get('/live-test', authenticate, startLiveSpeedTest);

// Get JSON speed test status by session ID
router.get('/status/:sessionId', authenticate, getSpeedTestStatus);

// Get detailed session logs (structured)
router.get('/logs/:sessionId', authenticate, getSessionLogs);

// NEW: Get console-like streaming logs (formatted like your server logs)
router.get('/stream/:sessionId', authenticate, streamSessionLogs);

// Other endpoints...
router.get('/history', authenticate, getUserWifiTests);
router.get('/latest', authenticate, getLatestSpeedTest);
router.delete('/test/:testId', authenticate, deleteSpeedTest);
router.get('/logs', authenticate, getSpeedTestLogs);

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'WiFi speed test module is running',
    version: '3.2.0',
    endpoints: {
      liveTestSSE: 'GET /api/wifi/live-test - Server-Sent Events (default)',
      liveTestJSON: 'GET /api/wifi/live-test?format=json - JSON polling',
      status: 'GET /api/wifi/status/:sessionId - Get test status',
      sessionLogs: 'GET /api/wifi/logs/:sessionId - Get structured logs',
      streamLogs: 'GET /api/wifi/stream/:sessionId - Get console-like logs', // NEW
      history: 'GET /api/wifi/history - Get test history',
      latest: 'GET /api/wifi/latest - Get latest test',
      delete: 'DELETE /api/wifi/test/:testId - Delete test'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
