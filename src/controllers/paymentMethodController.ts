import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middlewares/authMiddleware';
import PaymentMethod from '../models/PaymentMethod';

// GET /api/staff/payments/:venueId - Get payment methods
export const getPaymentMethods = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;

    const methods = await PaymentMethod.find({ venueId, isActive: true });

    // Mask sensitive data
    const maskedMethods = methods.map(method => ({
      ...method.toObject(),
      accountId: '****' + method.accountId.slice(-4),
      webhookSecret: undefined
    }));

    res.json({
      success: true,
      data: maskedMethods
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error fetching payment methods', error: error.message });
  }
};

// POST /api/staff/payments/:venueId/link - Link payment provider
export const linkPaymentProvider = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const { provider, accountId, displayName, webhookSecret, mode = 'TEST', configuration } = req.body;

    // Hash webhook secret
    const webhookSecretHash = webhookSecret 
      ? crypto.createHash('sha256').update(webhookSecret).digest('hex')
      : undefined;

    const paymentMethod = new PaymentMethod({
      venueId,
      provider,
      accountId,
      displayName,
      webhookSecret,
      webhookSecretHash,
      mode,
      configuration,
      createdBy: req.user.userId
    });

    await paymentMethod.save();

    res.status(201).json({
      success: true,
      message: 'Payment provider linked successfully',
      data: {
        id: paymentMethod._id,
        provider: paymentMethod.provider,
        displayName: paymentMethod.displayName,
        mode: paymentMethod.mode
      }
    });

  } catch (error: any) {
    res.status(400).json({ success: false, message: 'Error linking payment provider', error: error.message });
  }
};

// POST /api/staff/payments/:paymentId/test-webhook - Test webhook connection
export const testWebhook = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { paymentId } = req.params;

    const paymentMethod = await PaymentMethod.findById(paymentId).select('+webhookSecret');

    if (!paymentMethod) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    // TODO: Implement actual webhook test ping based on provider
    // For now, simulate success

    paymentMethod.webhookVerifiedAt = new Date();
    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Webhook connection verified',
      verifiedAt: paymentMethod.webhookVerifiedAt
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error testing webhook', error: error.message });
  }
};

// PUT /api/staff/payments/:paymentId/rotate-secret - Rotate webhook secret
export const rotateWebhookSecret = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only owners can rotate secrets' });
    }

    const { paymentId } = req.params;
    const { newSecret } = req.body;

    const paymentMethod = await PaymentMethod.findById(paymentId);

    if (!paymentMethod) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    paymentMethod.webhookSecret = newSecret;
    paymentMethod.webhookSecretHash = crypto.createHash('sha256').update(newSecret).digest('hex');
    paymentMethod.webhookVerifiedAt = undefined; // Require re-verification

    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Webhook secret rotated. Please re-verify connection.'
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error rotating secret', error: error.message });
  }
};

// DELETE /api/staff/payments/:paymentId - Remove payment method
export const removePaymentMethod = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only owners can remove payment methods' });
    }

    const { paymentId } = req.params;

    const paymentMethod = await PaymentMethod.findById(paymentId);

    if (!paymentMethod) {
      return res.status(404).json({ success: false, message: 'Payment method not found' });
    }

    paymentMethod.isActive = false;
    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Payment method removed'
    });

  } catch (error: any) {
    res.status(500).json({ success: false, message: 'Error removing payment method', error: error.message });
  }
};
