// ===== FILE: src/models/paymentModels.ts =====
import mongoose, { Schema, Document } from 'mongoose';

// Main Payment Method Model
export interface IPaymentMethod extends Document {
  venueId: mongoose.Types.ObjectId | string; // ✅ Allow both types
  provider: string;
  accountId: string;
  displayName: string;
  webhookSecret?: string;
  webhookSecretHash?: string;
  webhookVerifiedAt?: Date;
  mode: 'TEST' | 'LIVE';
  isActive: boolean;
  configuration: any;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentMethodSchema = new Schema<IPaymentMethod>({
  venueId: { 
    type: Schema.Types.Mixed, // ✅ Changed from ObjectId to Mixed
    required: true, 
    index: true 
  },
  provider: { type: String, required: true },
  accountId: { type: String, required: true },
  displayName: { type: String, required: true },
  webhookSecret: { type: String, select: false },
  webhookSecretHash: String,
  webhookVerifiedAt: Date,
  mode: { type: String, enum: ['TEST', 'LIVE'], default: 'TEST' },
  isActive: { type: Boolean, default: true },
  configuration: { type: Schema.Types.Mixed },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

// Payment Data Model
export interface IPaymentData extends Document {
  venueId: mongoose.Types.ObjectId | string; // ✅ Allow both types
  cashOnly: boolean;
  contactlessSurchargePercent: number | null;
  primaryMdrLocalCardsPercent: number | null;
  // ✅ NEW: Sales tax and service charge fields
  salesTaxPercent: number | null;
  serviceChargePercent: number | null;
  taxIncludedInMenu: boolean;
  confirmed: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const paymentDataSchema = new Schema<IPaymentData>({
  venueId: { 
    type: Schema.Types.Mixed, // ✅ Changed from ObjectId to Mixed
    required: true, 
    index: true,
    unique: true // ✅ Added unique constraint
  },
  cashOnly: { type: Boolean, default: false },
  contactlessSurchargePercent: { type: Number, default: null },
  primaryMdrLocalCardsPercent: { type: Number, default: null },
  // ✅ NEW: Tax fields
  salesTaxPercent: { type: Number, default: null, min: 0, max: 100 },
  serviceChargePercent: { type: Number, default: null, min: 0, max: 100 },
  taxIncludedInMenu: { type: Boolean, default: false },
  confirmed: { type: Boolean, default: false },
  confirmedAt: { type: Date, default: null }
}, {
  timestamps: true
});

// Card Machine Model
export interface ICardMachine extends Document {
  venueId: mongoose.Types.ObjectId | string; // ✅ Allow both types
  machineId?: mongoose.Types.ObjectId; // ✅ Added for identification
  brandProvider: string;
  contactlessEnabled: boolean;
  supportedNetworks: string[];
  customerSurchargePercent: number | null;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const cardMachineSchema = new Schema<ICardMachine>({
  venueId: { 
    type: Schema.Types.Mixed, // ✅ Changed from ObjectId to Mixed
    required: true, 
    index: true 
  },
  machineId: { 
    type: Schema.Types.ObjectId, 
    auto: true 
  },
  brandProvider: { type: String, required: true },
  contactlessEnabled: { type: Boolean, default: false },
  supportedNetworks: [{ type: String }],
  customerSurchargePercent: { type: Number, default: null },
  notes: { type: String }
}, { timestamps: true });

// UPI/QR Model
export interface IUpiQr extends Document {
  venueId: mongoose.Types.ObjectId | string; // ✅ Allow both types
  qrId?: mongoose.Types.ObjectId; // ✅ Added for identification
  paymentScheme: 'UPI' | 'PROMPTPAY' | 'PIX' | 'PAYNOW' | 'OTHER';
  qrRawPayload: string;
  accountType: 'Business' | 'Personal' | 'Unknown';
  detectedType?: 'mobile' | 'national_id' | 'tax_id' | 'ewallet' | 'unknown';
  upiVpa?: string;
  upiPayeeName?: string;
  isPrimary: boolean;
  qrPhotoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const upiQrSchema = new Schema<IUpiQr>({
  venueId: { 
    type: Schema.Types.Mixed, // ✅ Changed from ObjectId to Mixed
    required: true, 
    index: true 
  },
  qrId: { 
    type: Schema.Types.ObjectId, 
    auto: true 
  },
  paymentScheme: { 
    type: String, 
    enum: ['UPI', 'PROMPTPAY', 'PIX', 'PAYNOW', 'OTHER'], 
    required: true 
  },
  qrRawPayload: { type: String, required: true },
  accountType: { 
    type: String, 
    enum: ['Business', 'Personal', 'Unknown'], 
    required: true 
  },
  detectedType: { 
    type: String, 
    enum: ['mobile', 'national_id', 'tax_id', 'ewallet', 'unknown'] 
  },
  upiVpa: { type: String },
  upiPayeeName: { type: String },
  isPrimary: { type: Boolean, default: false },
  qrPhotoUrl: { type: String }
}, { timestamps: true });

// ✅ Add compound indexes for better query performance
PaymentMethodSchema.index({ venueId: 1, provider: 1 });
cardMachineSchema.index({ venueId: 1 });
upiQrSchema.index({ venueId: 1 });

// Check if models exist before creating them to prevent overwrites
export const PaymentMethod = mongoose.models.PaymentMethod || mongoose.model<IPaymentMethod>('PaymentMethod', PaymentMethodSchema);
export const PaymentDataModel = mongoose.models.PaymentData || mongoose.model<IPaymentData>('PaymentData', paymentDataSchema);
export const CardMachineModel = mongoose.models.CardMachine || mongoose.model<ICardMachine>('CardMachine', cardMachineSchema);
export const UpiQrModel = mongoose.models.UpiQr || mongoose.model<IUpiQr>('UpiQr', upiQrSchema);

export default PaymentMethod;