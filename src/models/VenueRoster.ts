import mongoose, { Schema, Document } from 'mongoose';

export interface IVenueRoster extends Document {
  staffUserId: mongoose.Types.ObjectId;
  venueId: mongoose.Types.ObjectId;
  role: 'MEMBER' | 'STAFF' | 'MANAGER' | 'OWNER';
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'REMOVED';
  invitedBy: mongoose.Types.ObjectId;
  invitedAt: Date;
  activatedAt?: Date;
  suspendedAt?: Date;
  removedAt?: Date;
  lastSeenAt?: Date;
  permissions: string[];
  notes?: string;
}

const VenueRosterSchema = new Schema<IVenueRoster>({
  staffUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
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
  invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  invitedAt: { type: Date, default: Date.now },
  activatedAt: Date,
  suspendedAt: Date,
  removedAt: Date,
  lastSeenAt: Date,
  permissions: [{ type: String }],
  notes: String
}, {
  timestamps: true
});

// Compound indexes
VenueRosterSchema.index({ venueId: 1, status: 1 });
VenueRosterSchema.index({ staffUserId: 1, venueId: 1 }, { unique: true });

export default mongoose.model<IVenueRoster>('VenueRoster', VenueRosterSchema);
