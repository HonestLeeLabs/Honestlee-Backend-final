import mongoose, { Schema, Document } from 'mongoose';

export interface IStaffSession extends Document {
  staffUserId: mongoose.Types.ObjectId;
  venueId: mongoose.Types.ObjectId;
  role: 'MEMBER' | 'STAFF' | 'MANAGER' | 'OWNER' | 'ADMIN';
  deviceId: string;
  deviceInfo?: {
    userAgent: string;
    ip: string;
    platform?: string;
  };
  createdAt: Date;
  lastSeen: Date;
  lockedAt?: Date;
  expiresAt: Date;
  lockReason?: string;
  isActive: boolean;
  
  // Method declarations
  updateActivity(): Promise<IStaffSession>;
  lock(reason: string): Promise<IStaffSession>;
}

const StaffSessionSchema = new Schema<IStaffSession>({
  staffUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
  role: { 
    type: String, 
    enum: ['MEMBER', 'STAFF', 'MANAGER', 'OWNER', 'ADMIN'], 
    required: true 
  },
  deviceId: { type: String, required: true, index: true },
  deviceInfo: {
    userAgent: String,
    ip: String,
    platform: String
  },
  createdAt: { type: Date, default: Date.now },
  lastSeen: { type: Date, default: Date.now },
  lockedAt: Date,
  expiresAt: { type: Date, required: true, index: true },
  lockReason: String,
  isActive: { type: Boolean, default: true, index: true }
}, {
  timestamps: true
});

// Compound indexes
StaffSessionSchema.index({ staffUserId: 1, venueId: 1, isActive: 1 });
StaffSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Methods implementation
StaffSessionSchema.methods.updateActivity = async function(this: IStaffSession): Promise<IStaffSession> {
  this.lastSeen = new Date();
  // Reset expiration on activity
  this.expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
  return await this.save();
};

StaffSessionSchema.methods.lock = async function(this: IStaffSession, reason: string): Promise<IStaffSession> {
  this.isActive = false;
  this.lockedAt = new Date();
  this.lockReason = reason;
  return await this.save();
};

export default mongoose.model<IStaffSession>('StaffSession', StaffSessionSchema);
