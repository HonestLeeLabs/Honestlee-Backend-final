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
  // ========== CORE ==========
  venueId: mongoose.Types.ObjectId;
  eventName: string;
  eventSubtitle?: string;
  description?: string;
  eventType: string; // L1 category (e.g., ETC1_sport_fitness)
  eventTypeSlug?: string;
  eventCategory?: string; // L2 category (e.g., ETC2_combat_sports)
  
  // ========== SOURCE & ORIGIN ==========
  sourceEventId?: string; // ID from external source
  sourceName?: string; // e.g., Facebook, Instagram, Eventbrite
  sourceUrl?: string; // Original event URL
  venueSourceId?: string; // Venue ID in source system
  eventOriginType?: string; // MANUAL, SCRAPED, API, etc.
  eventExclusivity?: string; // EXCLUSIVE, PUBLIC, MEMBERS_ONLY
  
  // ========== DATE & TIME ==========
  eventStartsAt: Date;
  eventEndsAt: Date;
  eventDuration?: string; // Human-readable (e.g., "2 hours")
  eventTimezone: string; // IANA timezone (e.g., Asia/Bangkok)
  allDay?: boolean;
  doorsOpenAt?: Date; // When doors open (before event starts)
  
  // ========== RECURRENCE ==========
  eventRecurrence?: EventRecurrence;
  recurrenceText?: string; // Human-readable (e.g., "Every Monday at 6 PM")
  seriesId?: string; // Group recurring events
  occurrenceId?: string; // Unique ID for this specific occurrence
  isException?: boolean; // True if this occurrence was modified
  daysOfWeek?: number[]; // [0-6] for Sunday-Saturday
  timeSlots?: { start: string; end: string }[]; // For flexible time slots
  
  // ========== PARTICIPATION ==========
  participationModePrimary?: ParticipationMode;
  participationModesSecondary?: ParticipationMode[];
  
  // ========== AUDIENCE ==========
  eventGender?: string; // NONE, LADIES_ONLY, MEN_ONLY, MIXED
  ageMin?: number;
  ageMax?: number;
  eventFamilyFriendly?: boolean;
  eventAgeRestriction?: string; // Human-readable (e.g., "18+", "All ages")
  
  // ========== SKILL & INTENSITY ==========
  eventSkillLevel?: string; // BEGINNER, INTERMEDIATE, ADVANCED, MIXED
  eventIntensity?: string; // LOW, MODERATE, HIGH, EXTREME
  
  // ========== LOCATION ==========
  eventIndoorOutdoor?: string; // INDOOR, OUTDOOR, MIXED
  accessibilityNotes?: string; // Wheelchair accessible, etc.
  locationName?: string; // Specific area (e.g., "Main Hall", "Rooftop")
  address?: string; // If different from venue address
  neighborhood?: string;
  city?: string;
  country?: string;
  geoOverride?: boolean; // True if using custom location
  lat?: number;
  lng?: number;
  eventLocationDirections?: string; // How to get there
  
  // ========== PRICING ==========
  priceType?: PriceType;
  eventPriceFrom: number;
  eventPriceMax?: number;
  eventCurrency: string;
  priceNotes?: string; // ✅ VERIFIED: "Includes 1 drink", "Early bird discount", etc.
  
  // ========== CAPACITY ==========
  capacity?: number;
  ticketsAvailable?: number;
  currentAttendees: number;
  
  // ========== RSVP & BOOKING ==========
  rsvpRequired?: boolean;
  rsvpMethod?: string; // ✅ VERIFIED: "Walk-in", "WhatsApp", "LINE", "Website", "Ticket platform"
  rsvpDeadline?: Date; // ✅ VERIFIED: RSVP cutoff datetime
  bookingUrl?: string;
  ticketUrl?: string;
  ticketProvider?: string; // e.g., Eventbrite, Ticketmaster
  
  // ========== TEAM / PLAYERS (Sports) ==========
  playersPerSide?: number;
  teamSizeTotal?: number;
  minPlayers?: number;
  maxPlayers?: number;
  formatNotes?: string; // e.g., "5v5", "Round Robin"
  
  // ========== STATUS ==========
  status?: EventStatus;
  visibility?: string; // PUBLIC, UNLISTED, STAFF_ONLY
  isActive: boolean;
  cancellationReason?: string; // ✅ VERIFIED: "Weather", "Low signups", "Venue unavailable", etc.
  cancelledAt?: Date; // ✅ VERIFIED: Timestamp when cancelled/postponed
  
  // ========== WEATHER ==========
  weatherSensitive?: boolean;
  badWeatherPolicy?: string; // What happens if weather is bad
  
  // ========== ORGANIZER ==========
  organizerName?: string;
  organizerType?: string; // INDIVIDUAL, COMPANY, COMMUNITY, etc.
  organizerContact?: string;
  organizerWhatsapp?: string;
  organizerLine?: string;
  organizerInstagram?: string;
  organizerEmail?: string;
  
  // ========== MEDIA ==========
  imageUrl?: string; // Legacy field
  images?: string[]; // Multiple images
  coverPhotoUrl?: string; // Main cover image
  eventPhotoUrl?: string; // Agent-uploaded photo
  eventPhotoS3Key?: string; // S3 key for photo
  
  // ========== GEAR ==========
  eventsGear?: string; // Required equipment (e.g., "Tennis racket", "Yoga mat")
  
  // ========== CHECK-IN ==========
  checkInMethod?: string; // QR_CODE, NAME_LIST, APP, NONE
  onPremiseRequired?: boolean; // Must check in on-site
  
  // ========== VERIFICATION & DATA QUALITY ==========
  lastVerifiedAt?: Date;
  verifiedBy?: string; // User ID or name of verifier
  confidenceScore?: number; // 0.0 - 1.0 for data quality
  notesInternal?: string; // Staff-only notes
  
  // ========== META ==========
  tags?: string[];
  language?: string; // ISO language code (e.g., 'en', 'th')
  conditions?: string; // Terms & conditions
  region?: 'ae' | 'th' | 'in' | 'global';
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
  
  // ========== METHODS ==========
  isValidNow(): boolean;
  isUpcoming(): boolean;
  hasCapacity(): boolean;
}

const EventSchema = new Schema<IEvent>(
  {
    // ========== CORE ==========
    venueId: { type: Schema.Types.ObjectId, ref: 'Venue', required: true, index: true },
    eventName: { type: String, required: true, maxlength: 200 },
    eventSubtitle: { type: String, maxlength: 100 },
    description: { type: String, maxlength: 2000 },
    eventType: { type: String, required: true },
    eventTypeSlug: { type: String },
    eventCategory: { type: String },
    
    // ========== SOURCE & ORIGIN ==========
    sourceEventId: { type: String },
    sourceName: { type: String },
    sourceUrl: { type: String },
    venueSourceId: { type: String },
    eventOriginType: { type: String },
    eventExclusivity: { type: String },
    
    // ========== DATE & TIME ==========
    eventStartsAt: { type: Date, required: true, index: true },
    eventEndsAt: { type: Date, required: true },
    eventDuration: { type: String },
    eventTimezone: { type: String, default: 'Asia/Dubai' },
    allDay: { type: Boolean, default: false },
    doorsOpenAt: { type: Date },
    
    // ========== RECURRENCE ==========
    eventRecurrence: { 
      type: String, 
      enum: Object.values(EventRecurrence), 
      default: EventRecurrence.NONE 
    },
    recurrenceText: { type: String },
    seriesId: { type: String },
    occurrenceId: { type: String },
    isException: { type: Boolean, default: false },
    daysOfWeek: [{ type: Number, min: 0, max: 6 }],
    timeSlots: [{ 
      start: { type: String }, 
      end: { type: String } 
    }],
    
    // ========== PARTICIPATION ==========
    participationModePrimary: { 
      type: String, 
      enum: Object.values(ParticipationMode) 
    },
    participationModesSecondary: [{ 
      type: String, 
      enum: Object.values(ParticipationMode) 
    }],
    
    // ========== AUDIENCE ==========
    eventGender: { type: String },
    ageMin: { type: Number },
    ageMax: { type: Number },
    eventFamilyFriendly: { type: Boolean },
    eventAgeRestriction: { type: String },
    
    // ========== SKILL & INTENSITY ==========
    eventSkillLevel: { type: String },
    eventIntensity: { type: String },
    
    // ========== LOCATION ==========
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
    
    // ========== PRICING ==========
    priceType: { 
      type: String, 
      enum: Object.values(PriceType), 
      default: PriceType.FREE 
    },
    eventPriceFrom: { type: Number, default: 0, min: 0 },
    eventPriceMax: { type: Number, min: 0 },
    eventCurrency: { type: String, default: 'AED' },
    priceNotes: { type: String, maxlength: 500 }, // ✅ VERIFIED & ENHANCED
    
    // ========== CAPACITY ==========
    capacity: { type: Number, min: 0 },
    ticketsAvailable: { type: Number, min: 0 },
    currentAttendees: { type: Number, default: 0 },
    
    // ========== RSVP & BOOKING ==========
    rsvpRequired: { type: Boolean, default: false },
    rsvpMethod: { type: String, maxlength: 100 }, // ✅ VERIFIED & ENHANCED
    rsvpDeadline: { type: Date }, // ✅ VERIFIED
    bookingUrl: { type: String },
    ticketUrl: { type: String },
    ticketProvider: { type: String },
    
    // ========== TEAM / PLAYERS ==========
    playersPerSide: { type: Number },
    teamSizeTotal: { type: Number },
    minPlayers: { type: Number },
    maxPlayers: { type: Number },
    formatNotes: { type: String },
    
    // ========== STATUS ==========
    status: { 
      type: String, 
      enum: Object.values(EventStatus), 
      default: EventStatus.SCHEDULED 
    },
    visibility: { type: String, default: 'PUBLIC' },
    isActive: { type: Boolean, default: true, index: true },
    cancellationReason: { type: String, maxlength: 500 }, // ✅ VERIFIED & ENHANCED
    cancelledAt: { type: Date }, // ✅ VERIFIED
    
    // ========== WEATHER ==========
    weatherSensitive: { type: Boolean, default: false },
    badWeatherPolicy: { type: String },
    
    // ========== ORGANIZER ==========
    organizerName: { type: String },
    organizerType: { type: String },
    organizerContact: { type: String },
    organizerWhatsapp: { type: String },
    organizerLine: { type: String },
    organizerInstagram: { type: String },
    organizerEmail: { type: String },
    
    // ========== MEDIA ==========
    imageUrl: { type: String },
    images: { type: [String], default: [] },
    coverPhotoUrl: { type: String },
    eventPhotoUrl: { type: String },
    eventPhotoS3Key: { type: String },
    
    // ========== GEAR ==========
    eventsGear: { type: String },
    
    // ========== CHECK-IN ==========
    checkInMethod: { type: String },
    onPremiseRequired: { type: Boolean, default: false },
    
    // ========== VERIFICATION ==========
    lastVerifiedAt: { type: Date },
    verifiedBy: { type: String },
    confidenceScore: { type: Number, min: 0, max: 1 },
    notesInternal: { type: String, maxlength: 1000 },
    
    // ========== META ==========
    tags: { type: [String] },
    language: { type: String, default: 'en' },
    conditions: { type: String },
    region: { 
      type: String, 
      enum: ['ae', 'th', 'in', 'global'], 
      default: 'global', 
      index: true 
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

// ========== INDEXES ==========
EventSchema.index({ venueId: 1, isActive: 1, eventStartsAt: 1 });
EventSchema.index({ eventStartsAt: 1, eventEndsAt: 1 });
EventSchema.index({ eventType: 1, eventStartsAt: 1 });
EventSchema.index({ region: 1, isActive: 1 });
EventSchema.index({ eventTypeSlug: 1 });
EventSchema.index({ status: 1, visibility: 1 });
EventSchema.index({ createdBy: 1 });

// ========== METHODS ==========
EventSchema.methods.isValidNow = function (this: IEvent): boolean {
  const now = new Date();
  if (now < this.eventStartsAt || now > this.eventEndsAt) return false;
  if (!this.isActive) return false;
  if (this.status === EventStatus.CANCELLED || this.status === EventStatus.POSTPONED) return false;
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
  return new Date() < this.eventStartsAt && this.isActive && this.status !== EventStatus.CANCELLED;
};

EventSchema.methods.hasCapacity = function (this: IEvent): boolean {
  if (!this.capacity) return true;
  return this.currentAttendees < this.capacity;
};

// ========== VIRTUAL FIELDS ==========
EventSchema.virtual('isCancelled').get(function (this: IEvent) {
  return this.status === EventStatus.CANCELLED || !!this.cancelledAt;
});

EventSchema.virtual('availableSpots').get(function (this: IEvent) {
  if (!this.capacity) return null;
  return this.capacity - this.currentAttendees;
});

export default mongoose.model<IEvent>('Event', EventSchema);
