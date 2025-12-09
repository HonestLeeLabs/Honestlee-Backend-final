import mongoose, { Schema, Document } from 'mongoose';

export enum Role {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  CONSUMER = 'CONSUMER',
  AGENT = 'AGENT',
  MANAGER = 'MANAGER',
  OWNER = 'OWNER'
}

export enum LoginMethod {
  PHONE = 'phone',
  EMAIL = 'email',
  GOOGLE = 'google'
}

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  userId?: string;
  phone?: string;
  email?: string;
  name?: string;
  address?: string;
  profileImage?: string;
  referralCode?: string;
  referredBy?: string;
  role: Role;
  loginMethod?: LoginMethod;
  otpCode?: string;
  otpExpiresAt?: Date;
  region?: string;
  
  // ✅ Google OAuth fields
  googleId?: string;
  lastLogin?: Date;
  
  // QR Tracking Fields
  hl_source_token?: string;
  hl_utm_data?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
  };
  qr_landing_timestamp?: Date;
  qr_auth_timestamp?: Date;
  qr_flow_completed?: boolean;
  
  createdAt: Date;
  updatedAt: Date;
  [key: string]: any;
}

const UserSchema = new Schema<IUser>({
  userId: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },
  email: { type: String, unique: true, sparse: true },
  name: { type: String },
  address: { type: String },
  profileImage: { type: String },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String },
  role: { type: String, enum: Object.values(Role), default: Role.CONSUMER },
  loginMethod: { type: String, enum: Object.values(LoginMethod) },
  otpCode: { type: String },
  otpExpiresAt: { type: Date },
  region: { type: String },
  
  // ✅ Google OAuth fields
  googleId: { type: String, unique: true, sparse: true },
  lastLogin: { type: Date },
  
  // QR Tracking Fields
  hl_source_token: { type: String, sparse: true },
  hl_utm_data: {
    utm_source: { type: String },
    utm_medium: { type: String },
    utm_campaign: { type: String },
    utm_content: { type: String },
    utm_term: { type: String }
  },
  qr_landing_timestamp: { type: Date },
  qr_auth_timestamp: { type: Date },
  qr_flow_completed: { type: Boolean, default: false }
}, { 
  timestamps: true,
  collection: 'users'
});

// Indexes
UserSchema.index({ hl_source_token: 1 });
UserSchema.index({ 'hl_utm_data.utm_campaign': 1 });
UserSchema.index({ email: 1 });
UserSchema.index({ phone: 1 });
UserSchema.index({ googleId: 1 }); // ✅ Add index for Google ID

// ✅ Prevent duplicate model compilation
const User = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export default User;
