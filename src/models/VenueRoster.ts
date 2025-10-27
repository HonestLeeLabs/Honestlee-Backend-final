// ===== FILE: src/models/VenueRoster.ts =====
import mongoose, { Schema, Document } from 'mongoose';

export interface IVenueRoster extends Document {
  staffUserId: mongoose.Types.ObjectId;
  venueId: mongoose.Types.ObjectId;
  role: 'MEMBER' | 'STAFF' | 'MANAGER' | 'OWNER';
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
  invitedBy: mongoose.Types.ObjectId;
  invitedAt: Date;
  joinedAt?: Date; // ✅ ADDED THIS
  activatedAt?: Date;
  suspendedAt?: Date;
  removedAt?: Date;
  lastSeenAt?: Date;
  permissions: string[];
  notes?: string;
  createdAt: Date; // ✅ ADDED THIS (from timestamps)
  updatedAt: Date; // ✅ ADDED THIS (from timestamps)
}

const VenueRosterSchema = new Schema<IVenueRoster>(
  {
    staffUserId: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true, 
      index: true 
    },
    venueId: { 
      type: Schema.Types.ObjectId, 
      ref: 'Venue', 
      required: true, 
      index: true 
    },
    role: {
      type: String,
      enum: ['MEMBER', 'STAFF', 'MANAGER', 'OWNER'],
      required: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'ACTIVE', 'SUSPENDED', 'REMOVED'],
      default: 'PENDING',
      index: true
    },
    invitedBy: { 
      type: Schema.Types.ObjectId, 
      ref: 'User', 
      required: true 
    },
    invitedAt: { 
      type: Date, 
      default: Date.now 
    },
    joinedAt: { // ✅ ADDED THIS
      type: Date 
    },
    activatedAt: { 
      type: Date 
    },
    suspendedAt: { 
      type: Date 
    },
    removedAt: { 
      type: Date 
    },
    lastSeenAt: { 
      type: Date 
    },
    permissions: [{ 
      type: String 
    }],
    notes: { 
      type: String,
      maxlength: 500
    }
  },
  {
    timestamps: true
  }
);

// Compound indexes for better performance
VenueRosterSchema.index({ venueId: 1, status: 1 });
VenueRosterSchema.index({ staffUserId: 1, venueId: 1 }, { unique: true });
VenueRosterSchema.index({ staffUserId: 1, status: 1 });

export default mongoose.model<IVenueRoster>('VenueRoster', VenueRosterSchema);
