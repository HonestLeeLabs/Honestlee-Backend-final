import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { 
  startLiveSpeedTest,
  getSpeedTestStatus,
  getSessionLogs,      
  streamSessionLogs,
  getUserWifiTests,
  getLatestSpeedTest,
  deleteSpeedTest,
  getSpeedTestLogs
} from '../controllers/wifiController';

const router = express.Router();

// All endpoints require authentication
router.get('/live-test', authenticate, startLiveSpeedTest);
router.get('/status/:sessionId', authenticate, getSpeedTestStatus);
router.get('/logs/:sessionId', authenticate, getSessionLogs);
router.get('/stream/:sessionId', authenticate, streamSessionLogs);
router.get('/history', authenticate, getUserWifiTests);
router.get('/latest', authenticate, getLatestSpeedTest);
router.delete('/test/:testId', authenticate, deleteSpeedTest);
router.get('/logs', authenticate, getSpeedTestLogs);

router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'WiFi speed test module is running - Authentication Required',
    version: '3.2.0',
    endpoints: {
      liveTestSSE: 'GET /api/wifi/live-test - Server-Sent Events (AUTH REQUIRED)',
      liveTestJSON: 'GET /api/wifi/live-test?format=json - JSON streaming (AUTH REQUIRED)',
      status: 'GET /api/wifi/status/:sessionId - Get test status (AUTH REQUIRED)',
      sessionLogs: 'GET /api/wifi/logs/:sessionId - Get structured logs (AUTH REQUIRED)',
      streamLogs: 'GET /api/wifi/stream/:sessionId - Get console-like logs (AUTH REQUIRED)',
      history: 'GET /api/wifi/history - Get test history (AUTH REQUIRED)',
      latest: 'GET /api/wifi/latest - Get latest test (AUTH REQUIRED)',
      delete: 'DELETE /api/wifi/test/:testId - Delete test (AUTH REQUIRED)'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
