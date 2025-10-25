import mongoose, { Schema, Document } from 'mongoose';

export interface IStaffQR extends Document {
  venueId: mongoose.Types.ObjectId;
  roleScope: 'MEMBER' | 'STAFF' | 'MANAGER';
  token: string;
  tokenHash: string;
  issuedAt: Date;
  expiresAt: Date;
  ttlSeconds: number;
  issuerSessionId: mongoose.Types.ObjectId;
  issuerUserId: mongoose.Types.ObjectId;
  state: 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';
  usedBy?: mongoose.Types.ObjectId;
  usedAt?: Date;
  type: 'STAFF_QR' | 'ONBOARD_QR';
}

const StaffQRSchema = new Schema<IStaffQR>({
  venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
  roleScope: { 
    type: String, 
    enum: ['MEMBER', 'STAFF', 'MANAGER'], 
    required: true 
  },
  token: { type: String, required: true, unique: true },
  tokenHash: { type: String, required: true, index: true },
  issuedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: true },
  ttlSeconds: { type: Number, required: true },
  issuerSessionId: { type: Schema.Types.ObjectId, ref: 'StaffSession', required: true },
  issuerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  state: { 
    type: String, 
    enum: ['ACTIVE', 'USED', 'EXPIRED', 'REVOKED'], 
    default: 'ACTIVE',
    index: true
  },
  usedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  usedAt: Date,
  type: { 
    type: String, 
    enum: ['STAFF_QR', 'ONBOARD_QR'], 
    required: true 
  }
}, {
  timestamps: true
});

// Indexes
StaffQRSchema.index({ tokenHash: 1, state: 1 });
StaffQRSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model<IStaffQR>('StaffQR', StaffQRSchema);
