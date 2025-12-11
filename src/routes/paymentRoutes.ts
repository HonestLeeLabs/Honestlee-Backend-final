// ===== FILE: src/routes/paymentRoutes.ts =====
import { Router, Request, Response, NextFunction } from 'express';
import { authenticateToken, AuthRequest } from '../middlewares/authMiddleware';
import paymentController from '../controllers/paymentMethodController';

const router = Router();

// Type-safe wrapper
const authRoute = (handler: (req: AuthRequest, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return handler(req as AuthRequest, res, next);
  };
};

// Payment methods routes
router.get('/:venueId', authenticateToken, authRoute(paymentController.getPaymentMethods));
router.post('/:venueId/link', authenticateToken, authRoute(paymentController.linkPaymentProvider));
router.post('/:paymentId/test-webhook', authenticateToken, authRoute(paymentController.testWebhook));
router.put('/:paymentId/rotate-secret', authenticateToken, authRoute(paymentController.rotateWebhookSecret));
router.delete('/:paymentId', authenticateToken, authRoute(paymentController.removePaymentMethod));

// New payment settings routes
router.post('/:venueId/update', authenticateToken, authRoute(paymentController.updatePaymentSettings));

// Card machines routes
router.get('/:venueId/card-machines', authenticateToken, authRoute(paymentController.getCardMachines));
router.post('/:venueId/card-machines', authenticateToken, authRoute(paymentController.addCardMachine));
router.delete('/:venueId/card-machines/:machineId', authenticateToken, authRoute(paymentController.deleteCardMachine));

// UPI/QR routes
router.get('/:venueId/upi-qr', authenticateToken, authRoute(paymentController.getUpiQrPayments));
router.post('/:venueId/upi-qr', authenticateToken, authRoute(paymentController.addUpiQrPayment));
router.delete('/:venueId/upi-qr/:qrId', authenticateToken, authRoute(paymentController.deleteUpiQrPayment));

// QR parsing route
router.post('/parse-qr', authenticateToken, authRoute(paymentController.parseQrCode));

export default router;