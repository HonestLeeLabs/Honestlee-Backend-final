import mongoose, { Schema, Document } from 'mongoose';

export interface IStaff extends Document {
  userId: mongoose.Types.ObjectId;
  venues: {
    venueId: mongoose.Types.ObjectId;
    role: 'MEMBER' | 'STAFF' | 'MANAGER' | 'OWNER';
    status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';
    joinedAt: Date;
    permissions: string[];
  }[];
  phone?: string;
  email?: string;
  emergencyContact?: {
    name: string;
    phone: string;
    relationship: string;
  };
  identityVerified: boolean;
  identityDocuments?: {
    type: string;
    documentId: string;
    verifiedAt?: Date;
  }[];
  trainingCompleted: boolean;
  certifications: string[];
  notes?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StaffSchema = new Schema<IStaff>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  venues: [{
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true },
    role: { 
      type: String, 
      enum: ['MEMBER', 'STAFF', 'MANAGER', 'OWNER'], 
      required: true 
    },
    status: { 
      type: String, 
      enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], 
      default: 'ACTIVE' 
    },
    joinedAt: { type: Date, default: Date.now },
    permissions: [{ type: String }]
  }],
  phone: String,
  email: String,
  emergencyContact: {
    name: String,
    phone: String,
    relationship: String
  },
  identityVerified: { type: Boolean, default: false },
  identityDocuments: [{
    type: String,
    documentId: String,
    verifiedAt: Date
  }],
  trainingCompleted: { type: Boolean, default: false },
  certifications: [{ type: String }],
  notes: String,
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

// Indexes
StaffSchema.index({ 'venues.venueId': 1, 'venues.status': 1 });
StaffSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model<IStaff>('Staff', StaffSchema);
