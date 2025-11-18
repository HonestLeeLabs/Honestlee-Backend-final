// src/models/QRCodeKit.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum QRKitType {
  MAIN = 'main',
  TABLE_SET = 'table_set'
}

export enum QRKitStatus {
  AVAILABLE = 'available',
  LINKED = 'linked',
  REVOKED = 'revoked'
}

export interface IQRCodeKit extends Document {
  kitId: string;
  type: QRKitType;
  range?: {
    start: number;
    end: number;
  };
  issuedTo?: mongoose.Types.ObjectId;
  status: QRKitStatus;
  createdAt: Date;
  updatedAt: Date;
}

const QRCodeKitSchema = new Schema<IQRCodeKit>({
  kitId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: Object.values(QRKitType),
    required: true,
    index: true
  },
  range: {
    start: Number,
    end: Number
  },
  issuedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    sparse: true
  },
  status: {
    type: String,
    enum: Object.values(QRKitStatus),
    default: QRKitStatus.AVAILABLE,
    index: true
  }
}, {
  timestamps: true,
  collection: 'qr_code_kits'
});

// Indexes
QRCodeKitSchema.index({ type: 1, status: 1 });
QRCodeKitSchema.index({ issuedTo: 1 });

export default mongoose.model<IQRCodeKit>('QRCodeKit', QRCodeKitSchema);
