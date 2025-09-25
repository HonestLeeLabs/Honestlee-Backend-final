import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';
import { 
  startRealTimeSpeedTest,
  getUserWifiTests,
  getLatestSpeedTest,
  deleteSpeedTest
} from '../controllers/wifiController';

const router = express.Router();

// Main speed test endpoint - real-time with progress updates
router.get('/test', authenticate, startRealTimeSpeedTest);

// History and management endpoints
router.get('/history', authenticate, getUserWifiTests);
router.get('/latest', authenticate, getLatestSpeedTest);
router.delete('/test/:testId', authenticate, deleteSpeedTest);

// Health check
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Real-time WiFi speed test API is running',
    version: '4.1.0',
    endpoints: {
      realTimeTest: 'GET /api/wifi/test - Real-time speed test with SSE progress',
      history: 'GET /api/wifi/history - Get test history',
      latest: 'GET /api/wifi/latest - Get latest test',
      delete: 'DELETE /api/wifi/test/:testId - Delete test'
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
