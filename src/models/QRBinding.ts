// src/models/QRBinding.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum QRBindingType {
  MAIN = 'main',
  TABLE = 'table'
}

export enum QRBindingState {
  ACTIVE = 'active',
  REVOKED = 'revoked'
}

export interface IQRBinding extends Document {
  bindingId: string;
  code: string;
  venueId: mongoose.Types.ObjectId;
  zone?: string; // ✅ Changed from ObjectId to string (stores zoneId UUID)
  instanceNo?: number;
  type: QRBindingType;
  nfcUidHash?: string;
  state: QRBindingState;
  boundBy: mongoose.Types.ObjectId;
  boundAt: Date;
  revokedAt?: Date;
  revokeReason?: string;
  placement?: {
    type: 'counter' | 'entrance' | 'table' | 'zone';
    note?: string;
    photo?: string;
  };
  testToken?: string;
  testTokenExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const QRBindingSchema = new Schema<IQRBinding>({
  bindingId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  code: {
    type: String,
    required: true,
    index: true
  },
  venueId: {
    type: Schema.Types.ObjectId,
    ref: 'Venue',
    required: true,
    index: true
  },
  zone: {
    type: String, // ✅ Changed from ObjectId to String (stores zoneId)
    sparse: true,
    index: true
  },
  instanceNo: Number,
  type: {
    type: String,
    enum: Object.values(QRBindingType),
    required: true,
    index: true
  },
  nfcUidHash: {
    type: String,
    sparse: true,
    select: false
  },
  state: {
    type: String,
    enum: Object.values(QRBindingState),
    default: QRBindingState.ACTIVE,
    index: true
  },
  boundBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  boundAt: {
    type: Date,
    default: Date.now,
    required: true
  },
  revokedAt: Date,
  revokeReason: String,
  placement: {
    type: {
      type: String,
      enum: ['counter', 'entrance', 'table', 'zone']
    },
    note: String,
    photo: String
  },
  testToken: String,
  testTokenExpiresAt: Date
}, {
  timestamps: true,
  collection: 'qr_bindings'
});

// Indexes
QRBindingSchema.index({ venueId: 1, type: 1, state: 1 });
QRBindingSchema.index({ code: 1, state: 1 });
QRBindingSchema.index({ zone: 1, instanceNo: 1 });
QRBindingSchema.index({ boundBy: 1, boundAt: -1 });

// Ensure only one active main QR per venue
QRBindingSchema.index(
  { venueId: 1, type: 1, state: 1 },
  { 
    unique: true,
    partialFilterExpression: { 
      type: 'main',
      state: 'active'
    }
  }
);

export default mongoose.model<IQRBinding>('QRBinding', QRBindingSchema);