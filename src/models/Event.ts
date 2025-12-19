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
  MONTHLY = 'MONTHLY',
  CUSTOM = 'CUSTOM'
}

export enum ParticipationMode {
  DO = 'DO',
  WATCH = 'WATCH',
  LEARN = 'LEARN',
  SOCIAL = 'SOCIAL',
  COMPETE = 'COMPETE',
  SHOP = 'SHOP',
  EATDRINK = 'EATDRINK'
}

export enum EventStatus {
  SCHEDULED = 'SCHEDULED',
  POSTPONED = 'POSTPONED',
  CANCELLED = 'CANCELLED',
  ENDED = 'ENDED',
  DRAFT = 'DRAFT'
}

export enum PriceType {
  FREE = 'FREE',
  DONATION = 'DONATION',
  FIXED = 'FIXED',
  FROM = 'FROM',
  RANGE = 'RANGE',
  MEMBERSONLY = 'MEMBERSONLY'
}

export interface IEvent extends Document {
  // Core
  venueId: mongoose.Types.ObjectId;
  eventName: string;
  eventSubtitle?: string; // ✅ ADDED
  description?: string;
  eventType: string;
  eventTypeSlug?: string;
  eventCategory?: string;
  
  // Source & Origin ✅ ADDED
  sourceEventId?: string;
  sourceName?: string;
  sourceUrl?: string;
  venueSourceId?: string;
  eventOriginType?: string;
  eventExclusivity?: string;
  
  // DateTime
  eventStartsAt: Date;
  eventEndsAt: Date;
  eventDuration?: string;
  eventTimezone: string;
  allDay?: boolean;
  doorsOpenAt?: Date; // ✅ ADDED
  
  // Recurrence
  eventRecurrence?: EventRecurrence;
  recurrenceText?: string;
  seriesId?: string;
  occurrenceId?: string; // ✅ ADDED
  isException?: boolean; // ✅ ADDED
  daysOfWeek?: number[];
  timeSlots?: { start: string; end: string }[];
  
  // Participation
  participationModePrimary?: ParticipationMode;
  participationModesSecondary?: ParticipationMode[];
  
  // Audience
  eventGender?: string;
  ageMin?: number;
  ageMax?: number;
  eventFamilyFriendly?: boolean;
  eventAgeRestriction?: string;
  
  // Skill & Intensity
  eventSkillLevel?: string;
  eventIntensity?: string;
  
  // Location ✅ ADDED ALL
  eventIndoorOutdoor?: string;
  accessibilityNotes?: string;
  locationName?: string;
  address?: string;
  neighborhood?: string;
  city?: string;
  country?: string;
  geoOverride?: boolean;
  lat?: number;
  lng?: number;
  eventLocationDirections?: string;
  
  // Pricing
  priceType?: PriceType;
  eventPriceFrom: number;
  eventPriceMax?: number;
  eventCurrency: string;
  priceNotes?: string;
  
  // Capacity
  capacity?: number;
  ticketsAvailable?: number; // ✅ ADDED
  currentAttendees: number;
  
  // RSVP/Booking
  rsvpRequired?: boolean;
  rsvpMethod?: string;
  rsvpDeadline?: Date;
  bookingUrl?: string;
  ticketUrl?: string;
  ticketProvider?: string;
  
  // Team/Players ✅ ADDED ALL
  playersPerSide?: number;
  teamSizeTotal?: number;
  minPlayers?: number;
  maxPlayers?: number;
  formatNotes?: string;
  
  // Status
  status?: EventStatus;
  visibility?: string;
  isActive: boolean;
  cancellationReason?: string; // ✅ ADDED
  cancelledAt?: Date; // ✅ ADDED
  
  // Weather
  weatherSensitive?: boolean;
  badWeatherPolicy?: string;
  
  // Organizer
  organizerName?: string;
  organizerType?: string;
  organizerContact?: string;
  organizerWhatsapp?: string;
  organizerLine?: string;
  organizerInstagram?: string;
  organizerEmail?: string;
  
  // Media
  imageUrl?: string;
  images?: string[];
  coverPhotoUrl?: string;
  eventPhotoUrl?: string; // ✅ ADDED
  eventPhotoS3Key?: string; // ✅ ADDED
  
  // Gear
  eventsGear?: string;
  
  // Check-in ✅ ADDED
  checkInMethod?: string;
  onPremiseRequired?: boolean;
  
  // Verification ✅ ADDED ALL
  lastVerifiedAt?: Date;
  verifiedBy?: string;
  confidenceScore?: number;
  notesInternal?: string;
  
  // Meta
  tags?: string[];
  language?: string;
  conditions?: string;
  region?: 'ae' | 'th' | 'in' | 'global';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  // Methods
  isValidNow(): boolean;
  isUpcoming(): boolean;
  hasCapacity(): boolean;
}

const EventSchema = new Schema<IEvent>(
  {
    // Core
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    eventName: { type: String, required: true, maxlength: 200 },
    eventSubtitle: { type: String, maxlength: 100 }, // ✅ ADDED
    description: { type: String, maxlength: 2000 },
    eventType: { type: String, required: true },
    eventTypeSlug: { type: String },
    eventCategory: { type: String },
    
    // Source & Origin ✅ ADDED
    sourceEventId: { type: String },
    sourceName: { type: String },
    sourceUrl: { type: String },
    venueSourceId: { type: String },
    eventOriginType: { type: String },
    eventExclusivity: { type: String },
    
    // DateTime
    eventStartsAt: { type: Date, required: true, index: true },
    eventEndsAt: { type: Date, required: true },
    eventDuration: { type: String },
    eventTimezone: { type: String, default: 'Asia/Dubai' },
    allDay: { type: Boolean, default: false },
    doorsOpenAt: { type: Date }, // ✅ ADDED
    
    // Recurrence
    eventRecurrence: { type: String, enum: Object.values(EventRecurrence), default: EventRecurrence.NONE },
    recurrenceText: { type: String },
    seriesId: { type: String },
    occurrenceId: { type: String }, // ✅ ADDED
    isException: { type: Boolean, default: false }, // ✅ ADDED
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    timeSlots: [{ start: { type: String }, end: { type: String } }],
    
    // Participation
    participationModePrimary: { type: String, enum: Object.values(ParticipationMode) },
    participationModesSecondary: [{ type: String, enum: Object.values(ParticipationMode) }],
    
    // Audience
    eventGender: { type: String },
    ageMin: { type: Number },
    ageMax: { type: Number },
    eventFamilyFriendly: { type: Boolean },
    eventAgeRestriction: { type: String },
    
    // Skill & Intensity
    eventSkillLevel: { type: String },
    eventIntensity: { type: String },
    
    // Location ✅ ADDED ALL
    eventIndoorOutdoor: { type: String },
    accessibilityNotes: { type: String },
    locationName: { type: String },
    address: { type: String },
    neighborhood: { type: String },
    city: { type: String },
    country: { type: String },
    geoOverride: { type: Boolean, default: false },
    lat: { type: Number },
    lng: { type: Number },
    eventLocationDirections: { type: String },
    
    // Pricing
    priceType: { type: String, enum: Object.values(PriceType), default: PriceType.FREE },
    eventPriceFrom: { type: Number, default: 0, min: 0 },
    eventPriceMax: { type: Number, min: 0 },
    eventCurrency: { type: String, default: 'AED' },
    priceNotes: { type: String },
    
    // Capacity
    capacity: { type: Number, min: 0 },
    ticketsAvailable: { type: Number, min: 0 }, // ✅ ADDED
    currentAttendees: { type: Number, default: 0 },
    
    // RSVP/Booking
    rsvpRequired: { type: Boolean, default: false },
    rsvpMethod: { type: String },
    rsvpDeadline: { type: Date },
    bookingUrl: { type: String },
    ticketUrl: { type: String },
    ticketProvider: { type: String },
    
    // Team/Players ✅ ADDED ALL
    playersPerSide: { type: Number },
    teamSizeTotal: { type: Number },
    minPlayers: { type: Number },
    maxPlayers: { type: Number },
    formatNotes: { type: String },
    
    // Status
    status: { type: String, enum: Object.values(EventStatus), default: EventStatus.SCHEDULED },
    visibility: { type: String, default: 'PUBLIC' },
    isActive: { type: Boolean, default: true, index: true },
    cancellationReason: { type: String }, // ✅ ADDED
    cancelledAt: { type: Date }, // ✅ ADDED
    
    // Weather
    weatherSensitive: { type: Boolean, default: false },
    badWeatherPolicy: { type: String },
    
    // Organizer
    organizerName: { type: String },
    organizerType: { type: String },
    organizerContact: { type: String },
    organizerWhatsapp: { type: String },
    organizerLine: { type: String },
    organizerInstagram: { type: String },
    organizerEmail: { type: String },
    
    // Media
    imageUrl: { type: String },
    images: { type: [String], default: [] },
    coverPhotoUrl: { type: String },
    eventPhotoUrl: { type: String }, // ✅ ADDED
    eventPhotoS3Key: { type: String }, // ✅ ADDED
    
    // Gear
    eventsGear: { type: String },
    
    // Check-in ✅ ADDED
    checkInMethod: { type: String },
    onPremiseRequired: { type: Boolean, default: false },
    
    // Verification ✅ ADDED ALL
    lastVerifiedAt: { type: Date },
    verifiedBy: { type: String },
    confidenceScore: { type: Number, min: 0, max: 1 },
    notesInternal: { type: String },
    
    // Meta
    tags: { type: [String] },
    language: { type: String, default: 'en' },
    conditions: { type: String },
    region: { type: String, enum: ['ae', 'th', 'in', 'global'], default: 'global', index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

// Indexes
EventSchema.index({ venueId: 1, isActive: 1, eventStartsAt: 1 });
EventSchema.index({ eventStartsAt: 1, eventEndsAt: 1 });
EventSchema.index({ eventType: 1, eventStartsAt: 1 });
EventSchema.index({ region: 1, isActive: 1 });
EventSchema.index({ eventTypeSlug: 1 });

// Methods
EventSchema.methods.isValidNow = function (this: IEvent): boolean {
  const now = new Date();
  if (now < this.eventStartsAt || now > this.eventEndsAt) return false;
  if (!this.isActive) return false;
  if (this.capacity && this.currentAttendees >= this.capacity) return false;
  
  if (this.eventRecurrence !== EventRecurrence.NONE && this.daysOfWeek && this.daysOfWeek.length > 0) {
    if (!this.daysOfWeek.includes(now.getDay())) return false;
  }
  
  if (this.eventRecurrence !== EventRecurrence.NONE && this.timeSlots && this.timeSlots.length > 0) {
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    const inTimeSlot = this.timeSlots.some(slot => currentTime >= slot.start && currentTime <= slot.end);
    if (!inTimeSlot) return false;
  }
  
  return true;
};

EventSchema.methods.isUpcoming = function (this: IEvent): boolean {
  return new Date() < this.eventStartsAt && this.isActive;
};

EventSchema.methods.hasCapacity = function (this: IEvent): boolean {
  if (!this.capacity) return true;
  return this.currentAttendees < this.capacity;
};

export default mongoose.model<IEvent>('Event', EventSchema);
