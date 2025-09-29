import mongoose, { Schema, Document } from 'mongoose';

export enum Role {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  CONSUMER = 'CONSUMER',
  AGENT = 'AGENT'
}

export enum LoginMethod {
  PHONE = 'phone',
  EMAIL = 'email',
  GOOGLE = 'google'
}

export interface IUser extends Document {
  phone?: string;          
  email?: string;
  name?: string;
  address?: string;
  profileImage?: string;      
  referralCode?: string;
  referredBy?: string;      
  role: Role;
  loginMethod?: LoginMethod;  // NEW: Track how user authenticated
  otpCode?: string;
  otpExpiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  [key: string]: any;
}

const UserSchema = new Schema<IUser>({
  phone: { 
    type: String, 
    unique: true, 
    sparse: true
  },
  email: { 
    type: String, 
    unique: true, 
    sparse: true
  },
  name: { type: String },
  address: { type: String },
  profileImage: { type: String },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String },
  role: { type: String, enum: Object.values(Role), default: Role.CONSUMER },
  loginMethod: { type: String, enum: Object.values(LoginMethod) },  // NEW
  otpCode: { type: String },
  otpExpiresAt: { type: Date }
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);