import mongoose, { Schema, Document } from 'mongoose';

export enum OfferType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED_AMOUNT = 'FIXED_AMOUNT',
  FREEBIE = 'FREEBIE',
  BOGO = 'BOGO'
}

export enum RedemptionMode {
  SELF_SERVE = 'SELF_SERVE',
  STAFF_QR = 'STAFF_QR',
  NFC = 'NFC',
  UPI_FORWARD = 'UPI_FORWARD',
  MANUAL_TICK = 'MANUAL_TICK'
}

export interface IOffer extends Document {
  venueId: mongoose.Types.ObjectId;
  title: string;
  description?: string;
  offerType: OfferType;
  value: number;
  minOTL: number;
  redemptionMode: RedemptionMode[];
  requiresStaffApproval: boolean;
  cooldownHours: number;
  validFrom: Date;
  validUntil: Date;
  daysOfWeek?: number[];
  timeSlots?: { start: string; end: string }[];
  maxRedemptionsPerUser: number;
  maxTotalRedemptions?: number;
  currentRedemptions: number;
  conditions: string[];
  categories: string[];
  isActive: boolean;
  qrRotationMinutes: number;
  createdAt: Date;
  updatedAt: Date;
  
  // Method declarations
  isValidNow(): boolean;
}

const OfferSchema = new Schema<IOffer>({
  venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
  title: { type: String, required: true, maxlength: 100 },
  description: { type: String, maxlength: 500 },
  offerType: { type: String, enum: Object.values(OfferType), required: true },
  value: { type: Number, required: true },
  minOTL: { type: Number, default: 0, min: 0, max: 100 },
  redemptionMode: [{ type: String, enum: Object.values(RedemptionMode) }],
  requiresStaffApproval: { type: Boolean, default: false },
  cooldownHours: { type: Number, default: 24, min: 0, max: 168 },
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  daysOfWeek: [{ type: Number, min: 0, max: 6 }],
  timeSlots: [{
    start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  }],
  maxRedemptionsPerUser: { type: Number, default: 1, min: 1 },
  maxTotalRedemptions: { type: Number },
  currentRedemptions: { type: Number, default: 0 },
  conditions: [{ type: String }],
  categories: [{ type: String }],
  isActive: { type: Boolean, default: true },
  qrRotationMinutes: { type: Number, default: 2, min: 1, max: 60 }
}, {
  timestamps: true
});

// Indexes
OfferSchema.index({ venueId: 1, isActive: 1, validFrom: 1, validUntil: 1 });
OfferSchema.index({ validFrom: 1, validUntil: 1 });
OfferSchema.index({ categories: 1 });

// Methods implementation
OfferSchema.methods.isValidNow = function(this: IOffer): boolean {
  const now = new Date();
  if (now < this.validFrom || now > this.validUntil) return false;
  if (!this.isActive) return false;
  if (this.maxTotalRedemptions && this.currentRedemptions >= this.maxTotalRedemptions) return false;
  
  // Check day of week
  if (this.daysOfWeek && this.daysOfWeek.length > 0) {
    if (!this.daysOfWeek.includes(now.getDay())) return false;
  }
  
  // Check time slots
  if (this.timeSlots && this.timeSlots.length > 0) {
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const inTimeSlot = this.timeSlots.some(slot => 
      currentTime >= slot.start && currentTime <= slot.end
    );
    if (!inTimeSlot) return false;
  }
  
  return true;
};

export default mongoose.model<IOffer>('Offer', OfferSchema);
