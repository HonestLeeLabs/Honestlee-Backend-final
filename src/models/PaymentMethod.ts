import mongoose, { Schema, Document } from 'mongoose';

export interface IPaymentMethod extends Document {
  venueId: mongoose.Types.ObjectId;
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
  venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
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

// Compound index
PaymentMethodSchema.index({ venueId: 1, provider: 1 });

export default mongoose.model<IPaymentMethod>('PaymentMethod', PaymentMethodSchema);
