import mongoose, { Schema, Document } from 'mongoose';

export interface IUpiQrPayment extends Document {
  qrId: string;
  venueId?: mongoose.Types.ObjectId;
  tempVenueId?: string;
  
  // Payment scheme
  paymentScheme: 'UPI' | 'PROMPTPAY' | 'PIX' | 'PAYNOW' | 'OTHER';
  
  // From QR decoding
  qrRawPayload: string;
  upiVpa?: string;
  upiPayeeName?: string;
  upiMerchantCode?: string;
  upiCategoryCode?: string;
  upiIsStatic?: boolean;
  
  // Agent-confirmed
  accountType: 'Personal' | 'Business' | 'Unknown';
  ownerClaimName?: string;
  
  // Zone assignment
  zoneId?: string;
  isPrimary: boolean;
  
  // Media
  qrPhotoUrl: string;
  qrImageHash?: string;
  
  // Meta
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UpiQrPaymentSchema = new Schema<IUpiQrPayment>(
  {
    qrId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    venueId: {
      type: Schema.Types.ObjectId,
      ref: 'Venue',
      sparse: true,
      index: true,
    },
    tempVenueId: {
      type: String,
      sparse: true,
      index: true,
    },
    paymentScheme: {
      type: String,
      enum: ['UPI', 'PROMPTPAY', 'PIX', 'PAYNOW', 'OTHER'],
      required: true,
    },
    qrRawPayload: {
      type: String,
      required: true,
    },
    upiVpa: String,
    upiPayeeName: String,
    upiMerchantCode: String,
    upiCategoryCode: String,
    upiIsStatic: Boolean,
    accountType: {
      type: String,
      enum: ['Personal', 'Business', 'Unknown'],
      required: true,
    },
    ownerClaimName: String,
    zoneId: String,
    isPrimary: {
      type: Boolean,
      default: false,
    },
    qrPhotoUrl: {
      type: String,
      required: true,
    },
    qrImageHash: String,
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'upi_qr_payments',
  }
);

UpiQrPaymentSchema.index({ venueId: 1, isActive: 1 });
UpiQrPaymentSchema.index({ tempVenueId: 1, isActive: 1 });

export default mongoose.model<IUpiQrPayment>('UpiQrPayment', UpiQrPaymentSchema);
