import express from 'express';
import { authenticate } from '../middlewares/authMiddleware';

// Import from wifiController
import {
  generateWiFiToken,
  getWiFiConfig,
  receiveWiFiTelemetry,
  startRealTimeSpeedTest,
  getUserWifiTests,
  getLatestSpeedTest,
  deleteSpeedTest as deleteWifiTest
} from '../controllers/wifiController';

// Import from wifiSpeedTestController
import {
  submitSpeedTest,
  getVenueSpeedTests,
  getMySpeedTests,
  deleteSpeedTest as deleteVenueSpeedTest
} from '../controllers/wifiSpeedTestController';

const router = express.Router();

// ==========================================
// WIFI CONNECTION TOKEN ENDPOINTS
// ==========================================
router.post('/connect/generate-token', authenticate, generateWiFiToken);
router.get('/connect/config', getWiFiConfig);
router.post('/connect/telemetry', receiveWiFiTelemetry);

// ==========================================
// REAL-TIME SPEED TEST (Server-Side SSE)
// ==========================================
router.get('/speed-test/live', authenticate, startRealTimeSpeedTest);
router.get('/speed-test/history', authenticate, getUserWifiTests);
router.get('/speed-test/latest', authenticate, getLatestSpeedTest);
router.delete('/speed-test/:testId', authenticate, deleteWifiTest);

// ==========================================
// VENUE SPEED TEST (Client-Side NDT7)
// ==========================================
router.post('/speed-test/submit', authenticate, submitSpeedTest);
router.get('/speed-test/venue/:venueId', getVenueSpeedTests);
router.get('/speed-test/my-tests', authenticate, getMySpeedTests);
router.delete('/speed-test/venue/:testId', authenticate, deleteVenueSpeedTest);

// ==========================================
// HEALTH CHECK
// ==========================================
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: '🚀 WiFi & Speed Test API v5.0',
    timestamp: new Date().toISOString(),
    endpoints: {
      // WiFi Connection (Mobile App)
      wifiConnection: {
        generateToken: 'POST /api/wifi/connect/generate-token',
        getConfig: 'GET /api/wifi/connect/config?token=xxx',
        sendTelemetry: 'POST /api/wifi/connect/telemetry'
      },
      
      // Server-Side Speed Test (SSE)
      realTimeSpeedTest: {
        runTest: 'GET /api/wifi/speed-test/live',
        getHistory: 'GET /api/wifi/speed-test/history',
        getLatest: 'GET /api/wifi/speed-test/latest',
        deleteTest: 'DELETE /api/wifi/speed-test/:testId'
      },
      
      // Client-Side Speed Test (Venue Submissions)
      venueSpeedTest: {
        submit: 'POST /api/wifi/speed-test/submit',
        getVenueTests: 'GET /api/wifi/speed-test/venue/:venueId',
        getMyTests: 'GET /api/wifi/speed-test/my-tests',
        deleteTest: 'DELETE /api/wifi/speed-test/venue/:testId'
      }
    }
  });
});

export default router;
