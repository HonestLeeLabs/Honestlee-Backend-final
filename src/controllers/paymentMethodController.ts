// ===== FILE: src/controllers/paymentMethodController.ts =====
import { Response } from 'express';
import crypto from 'crypto';
import { AuthRequest } from '../middlewares/authMiddleware';
import mongoose from 'mongoose';

// Import from the correct models file
import { 
  PaymentMethod,
  PaymentDataModel, 
  CardMachineModel, 
  UpiQrModel 
} from '../models/PaymentMethod';
import { 
  extractPromptPayInfo, 
  getAccountTypeFromPromptPayType 
} from '../utils/promptpayParser';

// ✅ Helper function to handle both tempVenueId and regular venueId
const resolveVenueId = (venueId: string): mongoose.Types.ObjectId | string => {
  // If it's a temp venue ID (starts with TEMP-), return as string
  if (venueId.startsWith('TEMP-')) {
    return venueId;
  }
  
  // If it's a valid ObjectId, convert it
  if (mongoose.Types.ObjectId.isValid(venueId)) {
    return new mongoose.Types.ObjectId(venueId);
  }
  
  // Otherwise return as string (will fail at query level if invalid)
  return venueId;
};

// ===== VENUE PAYMENT SETTINGS =====

// GET /api/agent/venues/:venueId/payment-methods - Get payment methods
export const getPaymentMethods = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const resolvedVenueId = resolveVenueId(venueId);

    // Get payment providers (Stripe, etc.)
    const paymentProviders = await PaymentMethod.find({ venueId: resolvedVenueId, isActive: true });

    // Get payment data (cashOnly, contactless, etc.)
    const paymentData = await PaymentDataModel.findOne({ venueId: resolvedVenueId });

    // Get card machines
    const cardMachines = await CardMachineModel.find({ venueId: resolvedVenueId });

    // Get UPI/QR codes
    const upiQrCodes = await UpiQrModel.find({ venueId: resolvedVenueId });

    // Mask sensitive data for payment providers
    const maskedProviders = paymentProviders.map(provider => ({
      ...provider.toObject(),
      accountId: '****' + provider.accountId.slice(-4),
      webhookSecret: undefined
    }));

    // Build response structure
    const response = {
      paymentProviders: maskedProviders,
      paymentData: paymentData || {
        cashOnly: false,
        contactlessSurchargePercent: null,
        primaryMdrLocalCardsPercent: null,
        // ✅ NEW: Tax fields with defaults
        salesTaxPercent: null,
        serviceChargePercent: null,
        taxIncludedInMenu: false,
        confirmed: false,
        confirmedAt: null
      },
      cardMachines,
      upiQrCodes,
      confirmed: paymentData?.confirmed || false,
      confirmedAt: paymentData?.confirmedAt || null
    };

    res.json({
      success: true,
      data: response
    });

  } catch (error: any) {
    console.error('Error fetching payment methods:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching payment methods', 
      error: error.message 
    });
  }
};

// POST /api/agent/venues/:venueId/update - Update payment settings
export const updatePaymentSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const {
      paymentMethods,
      contactlessCardAccepted,
      cashOnly,
      contactlessSurchargePercent,
      // ✅ NEW: Tax fields
      salesTaxPercent,
      serviceChargePercent,
      taxIncludedInMenu
    } = req.body;

    const resolvedVenueId = resolveVenueId(venueId);

    // Update or create payment data
    const paymentData = await PaymentDataModel.findOneAndUpdate(
      { venueId: resolvedVenueId },
      {
        cashOnly,
        contactlessSurchargePercent: contactlessSurchargePercent || null,
        // ✅ NEW: Update tax fields
        salesTaxPercent: salesTaxPercent || null,
        serviceChargePercent: serviceChargePercent || null,
        taxIncludedInMenu: taxIncludedInMenu || false,
        confirmed: true,
        confirmedAt: new Date()
      },
      { upsert: true, new: true }
    );

    // Build paymentTypes object for frontend compatibility
    const paymentTypes = {
      cash: cashOnly || paymentMethods?.includes('Cash') || false,
      creditCard: !cashOnly && (paymentMethods?.includes('Card') || false),
      debitCard: !cashOnly && (paymentMethods?.includes('Card') || false),
      nfc: !cashOnly && (contactlessCardAccepted || false),
      applePay: !cashOnly && (paymentMethods?.includes('Apple Pay') || false),
      googlePay: !cashOnly && (paymentMethods?.includes('Google Pay') || false),
      upi: !cashOnly && (paymentMethods?.includes('QR_UPI') || false),
      promptpay: !cashOnly && (paymentMethods?.includes('QR_PromptPay') || false),
      alipay: !cashOnly && (paymentMethods?.includes('Alipay') || false),
      wechatPay: !cashOnly && (paymentMethods?.includes('WeChatPay') || false),
      paynow: !cashOnly && (paymentMethods?.includes('PayNow') || false),
      paypal: !cashOnly && (paymentMethods?.includes('PayPal') || false),
      venmo: !cashOnly && (paymentMethods?.includes('Venmo') || false)
    };

    const cashOnlyValue = paymentData?.cashOnly || false;
    const contactlessSurchargePercentValue = paymentData?.contactlessSurchargePercent || null;
    const salesTaxPercentValue = paymentData?.salesTaxPercent || null;
    const serviceChargePercentValue = paymentData?.serviceChargePercent || null;
    const taxIncludedInMenuValue = paymentData?.taxIncludedInMenu || false;
    const confirmedValue = paymentData?.confirmed || false;
    const confirmedAtValue = paymentData?.confirmedAt || null;

    res.json({
      success: true,
      data: {
        paymentTypes,
        paymentData: {
          cashOnly: cashOnlyValue,
          contactlessSurchargePercent: contactlessSurchargePercentValue,
          // ✅ NEW: Return tax fields
          salesTaxPercent: salesTaxPercentValue,
          serviceChargePercent: serviceChargePercentValue,
          taxIncludedInMenu: taxIncludedInMenuValue
        },
        confirmed: confirmedValue,
        confirmedAt: confirmedAtValue
      }
    });

  } catch (error: any) {
    console.error('Error updating payment settings:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Error updating payment settings', 
      error: error.message 
    });
  }
};

// ===== CARD MACHINES =====

// GET /api/agent/venues/:venueId/card-machines - Get card machines
export const getCardMachines = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const resolvedVenueId = resolveVenueId(venueId);

    const cardMachines = await CardMachineModel.find({ venueId: resolvedVenueId });

    res.json({
      success: true,
      data: cardMachines
    });

  } catch (error: any) {
    console.error('Error fetching card machines:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching card machines', 
      error: error.message 
    });
  }
};

// POST /api/agent/venues/:venueId/card-machines - Add card machine
export const addCardMachine = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const {
      brandProvider,
      contactlessEnabled = false,
      supportedNetworks = [],
      customerSurchargePercent,
      notes
    } = req.body;

    // Validate required fields
    if (!brandProvider) {
      return res.status(400).json({ 
        success: false, 
        message: 'Brand/Provider is required' 
      });
    }

    const resolvedVenueId = resolveVenueId(venueId);

    const cardMachine = new CardMachineModel({
      venueId: resolvedVenueId,
      brandProvider,
      contactlessEnabled,
      supportedNetworks,
      customerSurchargePercent: customerSurchargePercent || null,
      notes
    });

    await cardMachine.save();

    res.status(201).json({
      success: true,
      message: 'Card machine added successfully',
      data: cardMachine
    });

  } catch (error: any) {
    console.error('Error adding card machine:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Error adding card machine', 
      error: error.message 
    });
  }
};

// DELETE /api/agent/venues/:venueId/card-machines/:machineId - Delete card machine
export const deleteCardMachine = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions to remove card machines' });
    }

    const { machineId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(machineId)) {
      return res.status(400).json({ success: false, message: 'Invalid machine ID' });
    }

    const machineObjectId = new mongoose.Types.ObjectId(machineId);
    const cardMachine = await CardMachineModel.findById(machineObjectId);

    if (!cardMachine) {
      return res.status(404).json({ 
        success: false, 
        message: 'Card machine not found' 
      });
    }

    await CardMachineModel.findByIdAndDelete(machineObjectId);

    res.json({
      success: true,
      message: 'Card machine deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting card machine:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting card machine', 
      error: error.message 
    });
  }
};

// ===== UPI/QR CODES =====

// GET /api/agent/venues/:venueId/upi-qr - Get UPI/QR codes
export const getUpiQrPayments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const resolvedVenueId = resolveVenueId(venueId);

    const upiQrCodes = await UpiQrModel.find({ venueId: resolvedVenueId });

    res.json({
      success: true,
      data: upiQrCodes
    });

  } catch (error: any) {
    console.error('Error fetching UPI/QR codes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching UPI/QR codes', 
      error: error.message 
    });
  }
};

// POST /api/agent/venues/:venueId/upi-qr - Add UPI/QR code
export const addUpiQrPayment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const {
      paymentScheme = 'UPI',
      qrRawPayload,
      accountType = 'Business',
      upiVpa,
      upiPayeeName,
      isPrimary = false,
      qrPhotoUrl
    } = req.body;

    // Validate required fields
    if (!qrRawPayload) {
      return res.status(400).json({ 
        success: false, 
        message: 'QR raw payload is required' 
      });
    }

    const resolvedVenueId = resolveVenueId(venueId);

    // Auto-detect account type from QR if possible
    let detectedType: 'mobile' | 'national_id' | 'tax_id' | 'ewallet' | 'unknown' = 'unknown';
    let finalAccountType = accountType;
    
    try {
      const parsed = extractPromptPayInfo(qrRawPayload);
      detectedType = parsed.type;
      
      // Update account type based on detection if not explicitly set
      if (parsed.type !== 'unknown' && accountType === 'Business') {
        finalAccountType = getAccountTypeFromPromptPayType(parsed.type);
      }
    } catch (error) {
      console.log('Could not auto-detect QR type, using provided account type');
    }

    const upiQr = new UpiQrModel({
      venueId: resolvedVenueId,
      paymentScheme,
      qrRawPayload,
      accountType: finalAccountType,
      detectedType,
      upiVpa,
      upiPayeeName,
      isPrimary,
      qrPhotoUrl
    });

    await upiQr.save();

    res.status(201).json({
      success: true,
      message: 'UPI/QR code added successfully',
      data: upiQr
    });

  } catch (error: any) {
    console.error('Error adding UPI/QR code:', error);
    res.status(400).json({ 
      success: false, 
      message: 'Error adding UPI/QR code', 
      error: error.message 
    });
  }
};

// DELETE /api/agent/venues/:venueId/upi-qr/:qrId - Delete UPI/QR code
export const deleteUpiQrPayment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions to remove UPI/QR codes' });
    }

    const { qrId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(qrId)) {
      return res.status(400).json({ success: false, message: 'Invalid QR ID' });
    }

    const qrObjectId = new mongoose.Types.ObjectId(qrId);
    const upiQr = await UpiQrModel.findById(qrObjectId);

    if (!upiQr) {
      return res.status(404).json({ 
        success: false, 
        message: 'UPI/QR code not found' 
      });
    }

    await UpiQrModel.findByIdAndDelete(qrObjectId);

    res.json({
      success: true,
      message: 'UPI/QR code deleted successfully'
    });

  } catch (error: any) {
    console.error('Error deleting UPI/QR code:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error deleting UPI/QR code', 
      error: error.message 
    });
  }
};

// ===== QR PARSING =====

// POST /api/agent/parse-qr - Parse QR code
export const parseQrCode = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN', 'AGENT'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { qrRawPayload } = req.body;

    if (!qrRawPayload) {
      return res.status(400).json({
        success: false,
        message: 'QR payload is required'
      });
    }

    // Parse PromptPay QR
    const parsed = extractPromptPayInfo(qrRawPayload);

    res.json({
      success: true,
      data: {
        scheme: parsed.scheme,
        type: parsed.type,
        id: parsed.id,
        accountType: getAccountTypeFromPromptPayType(parsed.type),
        payeeName: parsed.payeeName || ''
      }
    });

  } catch (error: any) {
    console.error('Error parsing QR:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to parse QR code',
      error: error.message
    });
  }
};

// ===== PAYMENT PROVIDERS (EXISTING FUNCTIONS) =====

export const linkPaymentProvider = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { venueId } = req.params;
    const { provider, accountId, displayName, webhookSecret, mode = 'TEST', configuration } = req.body;

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
    res.status(400).json({ 
      success: false, 
      message: 'Error linking payment provider', 
      error: error.message 
    });
  }
};

export const testWebhook = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['MANAGER', 'OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Insufficient permissions' });
    }

    const { paymentId } = req.params;
    const paymentMethod = await PaymentMethod.findById(paymentId).select('+webhookSecret');

    if (!paymentMethod) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment method not found' 
      });
    }

    paymentMethod.webhookVerifiedAt = new Date();
    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Webhook connection verified',
      verifiedAt: paymentMethod.webhookVerifiedAt
    });

  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: 'Error testing webhook', 
      error: error.message 
    });
  }
};

export const rotateWebhookSecret = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only owners can rotate secrets' });
    }

    const { paymentId } = req.params;
    const { newSecret } = req.body;

    const paymentMethod = await PaymentMethod.findById(paymentId);

    if (!paymentMethod) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment method not found' 
      });
    }

    paymentMethod.webhookSecret = newSecret;
    paymentMethod.webhookSecretHash = crypto.createHash('sha256').update(newSecret).digest('hex');
    paymentMethod.webhookVerifiedAt = undefined;

    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Webhook secret rotated. Please re-verify connection.'
    });

  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: 'Error rotating secret', 
      error: error.message 
    });
  }
};

export const removePaymentMethod = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user || !['OWNER', 'ADMIN'].includes(req.user.role)) {
      return res.status(403).json({ message: 'Only owners can remove payment methods' });
    }

    const { paymentId } = req.params;
    const paymentMethod = await PaymentMethod.findById(paymentId);

    if (!paymentMethod) {
      return res.status(404).json({ 
        success: false, 
        message: 'Payment method not found' 
      });
    }

    paymentMethod.isActive = false;
    await paymentMethod.save();

    res.json({
      success: true,
      message: 'Payment method removed'
    });

  } catch (error: any) {
    res.status(500).json({ 
      success: false, 
      message: 'Error removing payment method', 
      error: error.message 
    });
  }
};

export default {
  getPaymentMethods,
  updatePaymentSettings,
  getCardMachines,
  addCardMachine,
  deleteCardMachine,
  getUpiQrPayments,
  addUpiQrPayment,
  deleteUpiQrPayment,
  parseQrCode,
  linkPaymentProvider,
  testWebhook,
  rotateWebhookSecret,
  removePaymentMethod
};