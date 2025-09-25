import express from 'express';
import { 
  handleZohoWebhook, 
  triggerFullSync, 
  triggerDeltaSync, 
  getCacheStats 
} from '../controllers/webhookController';
import { authenticate } from '../middlewares/authMiddleware';

const router = express.Router();

/**
 * Zoho CRM webhook endpoint (no auth required - Zoho calls this)
 */
router.post('/zoho/venue-update', handleZohoWebhook);

/**
 * Manual sync endpoints (auth required)
 */
router.post('/sync/full', authenticate, triggerFullSync);
router.post('/sync/delta', authenticate, triggerDeltaSync);
router.get('/sync/stats', authenticate, getCacheStats);

export default router;
