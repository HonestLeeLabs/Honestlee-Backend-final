// ===== FILE: src/routes/paymentRoutes.ts =====
import { Router, Request, Response, NextFunction } from 'express';
import {
  getPaymentMethods,
  linkPaymentProvider,
  testWebhook,
  rotateWebhookSecret,
  removePaymentMethod
} from '../controllers/paymentMethodController';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';

const router = Router();

// Type-safe wrapper
const authRoute = (handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
};

// Payment routes
router.get('/:venueId', authenticateToken, authRoute(getPaymentMethods));
router.post('/:venueId/link', authenticateToken, authRoute(linkPaymentProvider));
router.post('/:paymentId/test-webhook', authenticateToken, authRoute(testWebhook));
router.put('/:paymentId/rotate-secret', authenticateToken, authRoute(rotateWebhookSecret));
router.delete('/:paymentId', authenticateToken, authRoute(removePaymentMethod));

export default router;
