// ===== FILE: src/models/VenueOnboardingStatus.ts =====
import mongoose, { Schema, Document } from 'mongoose';

export interface IVenueOnboardingStatus extends Document {
  venue_id: mongoose.Types.ObjectId;
  status: 'unlisted' | 'listed_unclaimed' | 'soft_onboarded' | 'not_interested' | 'interested_later' | 'fully_verified';
  flags: {
    qr_codes_left?: boolean;
    owner_met?: boolean;
    owner_contact?: boolean;
    manager_met?: boolean;
    manager_contact?: boolean;
  };
  agent_notes?: string;
  last_updated_by: mongoose.Types.ObjectId;
  updatedAt: Date;
}

const VenueOnboardingStatusSchema = new Schema<IVenueOnboardingStatus>({
  venue_id: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, unique: true },
  status: {
    type: String,
    enum: ['unlisted', 'listed_unclaimed', 'soft_onboarded', 'not_interested', 'interested_later', 'fully_verified'],
    default: 'unlisted'
  },
  flags: {
    qr_codes_left: Boolean,
    owner_met: Boolean,
    owner_contact: Boolean,
    manager_met: Boolean,
    manager_contact: Boolean
  },
  agent_notes: String,
  last_updated_by: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

export default mongoose.model<IVenueOnboardingStatus>('VenueOnboardingStatus', VenueOnboardingStatusSchema);
