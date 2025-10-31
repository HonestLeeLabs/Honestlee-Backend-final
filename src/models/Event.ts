// ===== FILE: src/models/Event.ts =====
import mongoose, { Schema, Document } from 'mongoose';

export enum EventType {
  CONCERT = 'CONCERT',
  WORKSHOP = 'WORKSHOP',
  DINING = 'DINING',
  SPORTS = 'SPORTS',
  NETWORKING = 'NETWORKING',
  ENTERTAINMENT = 'ENTERTAINMENT',
  OTHER = 'OTHER'
}

export enum EventRecurrence {
  NONE = 'NONE',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
  MONTHLY = 'MONTHLY'
}

export interface IEvent extends Document {
  venueId: mongoose.Types.ObjectId;
  eventName: string;
  description?: string;
  eventType: EventType;
  eventCategory?: string;
  eventStartsAt: Date;
  eventEndsAt: Date;
  eventDuration?: string;
  eventTimezone: string;
  eventRecurrence?: EventRecurrence;
  eventPriceFrom: number;
  eventPriceMax?: number;
  eventCurrency: string;
  eventAgeRestriction?: string;
  capacity?: number;
  currentAttendees: number;
  daysOfWeek?: number[];
  timeSlots?: { start: string; end: string }[];
  conditions?: string[];
  isActive: boolean;
  imageUrl?: string;
  region?: 'ae' | 'th' | 'in' | 'global'; // ✅ NEW
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  isValidNow(): boolean;
  isUpcoming(): boolean;
  hasCapacity(): boolean;
}

const EventSchema = new Schema<IEvent>({
  venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
  eventName: { type: String, required: true, maxlength: 200 },
  description: { type: String, maxlength: 1000 },
  eventType: { type: String, enum: Object.values(EventType), required: true },
  eventCategory: { type: String },
  eventStartsAt: { type: Date, required: true, index: true },
  eventEndsAt: { type: Date, required: true },
  eventDuration: { type: String },
  eventTimezone: { type: String, default: 'Asia/Dubai' },
  eventRecurrence: { type: String, enum: Object.values(EventRecurrence), default: EventRecurrence.NONE },
  eventPriceFrom: { type: Number, default: 0, min: 0 },
  eventPriceMax: { type: Number, min: 0 },
  eventCurrency: { type: String, default: 'AED' },
  eventAgeRestriction: { type: String },
  capacity: { type: Number, min: 0 },
  currentAttendees: { type: Number, default: 0 },
  daysOfWeek: [{ type: Number, min: 0, max: 6 }],
  timeSlots: [{
    start: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
    end: { type: String, match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ }
  }],
  conditions: [{ type: String }],
  isActive: { type: Boolean, default: true, index: true },
  imageUrl: { type: String },
  region: { type: String, enum: ['ae', 'th', 'in', 'global'], default: 'global', index: true }, // ✅ NEW
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
}, {
  timestamps: true
});

// Indexes
EventSchema.index({ venueId: 1, isActive: 1, eventStartsAt: 1 });
EventSchema.index({ eventStartsAt: 1, eventEndsAt: 1 });
EventSchema.index({ eventType: 1, eventStartsAt: 1 });
EventSchema.index({ region: 1, isActive: 1 }); // ✅ NEW

// Methods implementation
EventSchema.methods.isValidNow = function(this: IEvent): boolean {
  const now = new Date();
  if (now < this.eventStartsAt || now > this.eventEndsAt) return false;
  if (!this.isActive) return false;
  if (this.capacity && this.currentAttendees >= this.capacity) return false;
  
  if (this.eventRecurrence !== EventRecurrence.NONE && this.daysOfWeek && this.daysOfWeek.length > 0) {
    if (!this.daysOfWeek.includes(now.getDay())) return false;
  }
  
  if (this.eventRecurrence !== EventRecurrence.NONE && this.timeSlots && this.timeSlots.length > 0) {
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const inTimeSlot = this.timeSlots.some(slot => 
      currentTime >= slot.start && currentTime <= slot.end
    );
    if (!inTimeSlot) return false;
  }
  
  return true;
};

EventSchema.methods.isUpcoming = function(this: IEvent): boolean {
  return new Date() < this.eventStartsAt && this.isActive;
};

EventSchema.methods.hasCapacity = function(this: IEvent): boolean {
  if (!this.capacity) return true;
  return this.currentAttendees < this.capacity;
};

export default mongoose.model<IEvent>('Event', EventSchema);