import mongoose, { Schema, Document } from 'mongoose';

export enum Role {
  ADMIN = 'ADMIN',
  STAFF = 'STAFF',
  CONSUMER = 'CONSUMER',
  AGENT = 'AGENT'
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
    sparse: true    // <-- Key fix: allows multiple null values
  },
  email: { 
    type: String, 
    unique: true, 
    sparse: true    // <-- Also make email sparse for consistency
  },
  name: { type: String },
  address: { type: String },
  profileImage: { type: String },
  referralCode: { type: String, unique: true, sparse: true },
  referredBy: { type: String },
  role: { type: String, enum: Object.values(Role), default: Role.CONSUMER },
  otpCode: { type: String },
  otpExpiresAt: { type: Date }
}, { timestamps: true });

export default mongoose.model<IUser>('User', UserSchema);
