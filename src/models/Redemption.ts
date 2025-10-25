import mongoose, { Schema, Document } from 'mongoose';
import { RedemptionMode } from './Offer';

export enum RedemptionStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  APPROVED = 'APPROVED',
  REDEEMED = 'REDEEMED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
  FRAUD_FLAGGED = 'FRAUD_FLAGGED'
}

export interface IRedemption extends Document {
  offerId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  venueId: mongoose.Types.ObjectId;
  redemptionMode: RedemptionMode;
  status: RedemptionStatus;
  otcToken?: string;
  otcExpiresAt?: Date;
  verifiedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  redeemedAt?: Date;
  presenceSignals: {
    gps?: { lat: number; lng: number; accuracy: number };
    ssid?: string;
    bssid?: string;
    deviceMotion?: boolean;
    qrScannedAt?: Date;
  };
  deviceFingerprint?: string;
  riskScore?: number;
  fraudFlags?: string[];
  cooldownUntil: Date;
  value: number;
  auditLog: {
    timestamp: Date;
    action: string;
    actor?: mongoose.Types.ObjectId;
    details?: any;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const RedemptionSchema = new Schema<IRedemption>({
  offerId: { type: Schema.Types.ObjectId, ref: 'Offer', required: true, index: true },
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
  redemptionMode: { type: String, enum: Object.values(RedemptionMode), required: true },
  status: { type: String, enum: Object.values(RedemptionStatus), default: RedemptionStatus.PENDING, index: true },
  otcToken: { type: String, index: true },
  otcExpiresAt: { type: Date },
  verifiedAt: { type: Date },
  approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  approvedAt: { type: Date },
  redeemedAt: { type: Date },
  presenceSignals: {
    gps: {
      lat: { type: Number },
      lng: { type: Number },
      accuracy: { type: Number }
    },
    ssid: { type: String },
    bssid: { type: String },
    deviceMotion: { type: Boolean },
    qrScannedAt: { type: Date }
  },
  deviceFingerprint: { type: String },
  riskScore: { type: Number, min: 0, max: 100 },
  fraudFlags: [{ type: String }],
  cooldownUntil: { type: Date, required: true, index: true },
  value: { type: Number, required: true },
  auditLog: [{
    timestamp: { type: Date, default: Date.now },
    action: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    details: { type: Schema.Types.Mixed }
  }]
}, {
  timestamps: true
});

// Compound indexes
RedemptionSchema.index({ userId: 1, venueId: 1, status: 1 });
RedemptionSchema.index({ venueId: 1, status: 1, createdAt: -1 });
RedemptionSchema.index({ otcToken: 1, otcExpiresAt: 1 });
RedemptionSchema.index({ cooldownUntil: 1 });

export default mongoose.model<IRedemption>('Redemption', RedemptionSchema);
