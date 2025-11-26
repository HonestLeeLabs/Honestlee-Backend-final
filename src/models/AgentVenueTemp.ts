// src/models/AgentVenueTemp.ts
import mongoose, { Schema, Document } from 'mongoose';

export enum VenueOnboardingStatus {
  UNLISTED = 'UNLISTED',
  LISTED_UNCLAIMED = 'LISTED_UNCLAIMED',
  SOFT_ONBOARDED = 'SOFT_ONBOARDED',
  FULLY_VERIFIED = 'FULLY_VERIFIED',
}

export enum VerificationLevel {
  PROSPECT_REMOTE = 'PROSPECT_REMOTE',
  LISTED_UNCLAIMED = 'LISTED_UNCLAIMED',
  IMPORTED_QUALIFIED = 'IMPORTED_QUALIFIED',
  IMPORTED_DEQUALIFIED = 'IMPORTED_DEQUALIFIED',
  PROSPECT_QUALIFIED = 'PROSPECT_QUALIFIED',
  PROSPECT_DEQUALIFIED = 'PROSPECT_DEQUALIFIED',
  ASSIGNED_TO_AGENT = 'ASSIGNED_TO_AGENT',
  VISITED_SIGNIN = 'VISITED_SIGNIN',
  VITALS_DONE = 'VITALS_DONE',
  ACTIVITY = 'ACTIVITY',
  SELF_LISTED_UNQUALIFIED = 'SELF_LISTED_UNQUALIFIED',
  SELF_LISTED_QUALIFIED = 'SELF_LISTED_QUALIFIED',
  QR_REQUESTED = 'QR_REQUESTED',
  SOFT_ONBOARD = 'SOFT_ONBOARD',
  VERIFIED_FULL = 'VERIFIED_FULL',
  VISITED_DECLINED = 'VISITED_DECLINED',
  LEAD_CAPTURED = 'LEAD_CAPTURED',
  VERIFIED_QR_LIVE = 'VERIFIED_QR_LIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED_PERM = 'CLOSED_PERM'
}

export interface IAgentNote {
  noteId: string;
  noteType: 'vitals' | 'gps' | 'zones' | 'photos' | 'wifi' | 'atmosphere' | 'general';
  content: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt?: Date;
}
export interface IAgentVenueTemp extends Document {
  tempVenueId: string;
  createdBy: mongoose.Types.ObjectId;
  name: string;
  category: string[];
  address: {
    lat: number;
    lng: number;
    raw: string;
    street?: string;
    city?: string;
    district?: string;
    postalCode?: string;
    state?: string;
    country?: string;
    countryCode?: string;
  };
  phone?: string;
  socials?: {
    instagram?: string;
    tiktok?: string;
    facebook?: string;
    website?: string;
  };
  hours?: string;
  status: 'temp' | 'linked' | 'finalized';
  onboardingStatus: VenueOnboardingStatus;
  verificationLevel: VerificationLevel;
  crmId?: string;
  venueId?: mongoose.Types.ObjectId;
  region: string;

  // Flags
  flags: {
    qrCodesLeftBehind: boolean;
    ownerMet: boolean;
    haveOwnersContact: boolean;
    managerMet: boolean;
    haveManagersContact: boolean;
  };

  // Contacts
  ownerContact?: {
    name?: string;
    phone?: string;
    whatsapp?: string;
    line?: string;
    email?: string;
  };

  managerContact?: {
    name?: string;
    phone?: string;
    whatsapp?: string;
    line?: string;
    email?: string;
  };

  leadContact?: {
    name?: string;
    phone?: string;
    whatsapp?: string;
    line?: string;
    notes?: string;
  };
  parkingOptions: String;
  venueGroup: String;

  // GPS Accuracy (Legacy - keeping for backward compatibility)
  gpsAccuracy?: {
    oldLocation?: {
      lat: number;
      lng: number;
      timestamp: Date;
    };
    newLocation?: {
      lat: number;
      lng: number;
      timestamp: Date;
      accuracy: number;
    };
    offsetDistance?: number;
  };

  // Payment Types
  paymentTypes?: {
    cash?: boolean;
    creditCard?: boolean;
    debitCard?: boolean;
    upi?: boolean;
    nfc?: boolean;
    applePay?: boolean;
    googlePay?: boolean;
    alipay?: boolean;
    wechatPay?: boolean;
    promptpay?: boolean;
    paynow?: boolean;
    venmo?: boolean;
    paypal?: boolean;
    other?: string[];
  };
  
  paymentTypesConfirmed?: boolean;
  paymentTypesConfirmedAt?: Date;

  // NEW: GPS Data (Enhanced GPS tracking)
  gpsData?: {
    src_lat?: number;
    src_lng?: number;
    src_provider?: string;
    hl_confirmed_lat?: number;
    hl_confirmed_lng?: number;
    hl_gps_accuracy_m?: number;
    hl_gps_distance_m?: number;
    hl_gps_status?: string;
    hl_gps_updated_at?: Date;
    hl_gps_history?: Array<{
      lat: number;
      lng: number;
      source: string;
      taken_at: Date;
      by_agent?: mongoose.Types.ObjectId;
      accuracy_m?: number;
    }>;
  };

  // NEW: WiFi Speed Test Data
  wifiData?: {
    hasSpeedTest?: boolean;
    latestSpeedTest?: {
      downloadMbps?: number;
      uploadMbps?: number;
      latencyMs?: number;
      qualityScore?: number;
      category?: 'excellent' | 'good' | 'fair' | 'poor';
      testedAt?: Date;
      testedBy?: mongoose.Types.ObjectId;
    };
    averageSpeedTest?: {
      downloadMbps?: number;
      uploadMbps?: number;
      latencyMs?: number;
      qualityScore?: number;
      totalTests?: number;
      lastCalculatedAt?: Date;
    };
    // WiFi SSIDs
    ssids?: Array<{
      ssid: string;
      isGuest?: boolean;
      isPrimary?: boolean;
      hasPassword?: boolean;
      notes?: string;
    }>;
  };

  // Google Data
  googleData?: {
    placeId: string;
    primaryType?: string;
    primaryTypeLabel?: string;
    allTypes?: string[];
    googleMapsUrl?: string;
    rating?: number;
    userRatingsCount?: number;
    businessStatus?: string;
    priceLevel?: number;    
    priceLevelDisplay?: string; 
    priceRange?: string; 
    displayPrice?: string;
    photoReference?: string;
    importedAt?: Date;
    importedBy?: string;
  };

  // Assignment Fields
  assignedTo?: mongoose.Types.ObjectId;
  assignedBy?: mongoose.Types.ObjectId;
  assignmentDate?: Date;
  expectedVisitDate?: Date;
  visitedAt?: Date;
  visitStatus: 'not_visited' | 'visited' | 'in_progress';
  
  // Vitals Fields
  vitalsCompleted: boolean;
  vitalsCompletedAt?: Date;
  vitalsData?: {
    nameConfirmed: boolean;
    categoryConfirmed: boolean;
    locationConfirmed: boolean;
    addressConfirmed: boolean;
    hoursConfirmed: boolean;
    accountNameConfirmed?: boolean;
    billingCityConfirmed?: boolean;
    billingDistrictConfirmed?: boolean;
    billingStreetConfirmed?: boolean;
    billingStateConfirmed?: boolean;
    phoneConfirmed?: boolean;
    websiteConfirmed?: boolean;
    parkingOptionsConfirmed?: boolean;
    venueGroupConfirmed?: boolean;
    venueCategoryConfirmed?: boolean;
    venueTypeConfirmed?: boolean;
    openingHoursConfirmed?: boolean;
    paymentTypesConfirmed?: boolean;
    wifiAvailable?: boolean;
    workFriendly?: boolean;
  };

  // Task completion flags
  gpsVerified?: boolean;
  photosUploaded?: boolean;
  zonesCreated?: boolean;
  atmosphereSet?: boolean;

  // Decline/Lead Capture
  declineReason?: string;
  leadCapturedAt?: Date;
  leadCapturedBy?: mongoose.Types.ObjectId;
  notes?: IAgentNote[];

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const AgentVenueTempSchema = new Schema<IAgentVenueTemp>({
  tempVenueId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    index: true
  },
  category: [{
    type: String,
    required: true
  }],
  address: {
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    raw: { type: String, required: true },
    street: String,
    city: String,
    district: String,
    postalCode: String,
    state: String,
    country: String,
    countryCode: String
  },
  phone: String,
  socials: {
    instagram: String,
    tiktok: String,
    facebook: String,
    website: String
  },
  hours: String,
  status: {
    type: String,
    enum: ['temp', 'linked', 'finalized'],
    default: 'temp',
    index: true
  },
  onboardingStatus: {
    type: String,
    enum: Object.values(VenueOnboardingStatus),
    default: VenueOnboardingStatus.UNLISTED,
    index: true
  },
  verificationLevel: {
    type: String,
    enum: Object.values(VerificationLevel),
    default: VerificationLevel.LISTED_UNCLAIMED,
    index: true
  },
  crmId: {
    type: String,
    sparse: true,
    index: true
  },
  venueId: {
    type: Schema.Types.ObjectId,
    ref: 'Venue',
    sparse: true
  },
  region: {
    type: String,
    required: true,
    index: true
  },
  flags: {
    qrCodesLeftBehind: { type: Boolean, default: false },
    ownerMet: { type: Boolean, default: false },
    haveOwnersContact: { type: Boolean, default: false },
    managerMet: { type: Boolean, default: false },
    haveManagersContact: { type: Boolean, default: false }
  },
  ownerContact: {
    name: String,
    phone: String,
    whatsapp: String,
    line: String,
    email: String
  },
  managerContact: {
    name: String,
    phone: String,
    whatsapp: String,
    line: String,
    email: String
  },
  leadContact: {
    name: String,
    phone: String,
    whatsapp: String,
    line: String,
    notes: String
  },
  gpsAccuracy: {
    oldLocation: {
      lat: Number,
      lng: Number,
      timestamp: Date
    },
    newLocation: {
      lat: Number,
      lng: Number,
      timestamp: Date,
      accuracy: Number
    },
    offsetDistance: Number
  },

  // Payment Types Schema
  paymentTypes: {
    cash: { type: Boolean, default: false },
    creditCard: { type: Boolean, default: false },
    debitCard: { type: Boolean, default: false },
    upi: { type: Boolean, default: false },
    nfc: { type: Boolean, default: false },
    applePay: { type: Boolean, default: false },
    googlePay: { type: Boolean, default: false },
    alipay: { type: Boolean, default: false },
    wechatPay: { type: Boolean, default: false },
    promptpay: { type: Boolean, default: false },
    paynow: { type: Boolean, default: false },
    venmo: { type: Boolean, default: false },
    paypal: { type: Boolean, default: false },
    other: [{ type: String }]
  },
  
  paymentTypesConfirmed: { type: Boolean, default: false },
  paymentTypesConfirmedAt: Date,
  
  // Enhanced GPS Data Schema
  gpsData: {
    src_lat: Number,
    src_lng: Number,
    src_provider: String,
    hl_confirmed_lat: Number,
    hl_confirmed_lng: Number,
    hl_gps_accuracy_m: Number,
    hl_gps_distance_m: Number,
    hl_gps_status: {
      type: String,
      enum: ['not_checked', 'confirmed', 'kept_original', 'rejected', 'skipped'],
      default: 'not_checked',
    },
    hl_gps_updated_at: Date,
    hl_gps_history: [
      {
        lat: Number,
        lng: Number,
        source: String,
        taken_at: Date,
        by_agent: { type: Schema.Types.ObjectId, ref: 'User' },
        accuracy_m: Number,
      },
    ],
  },

  // NEW: WiFi Data Schema
  wifiData: {
    hasSpeedTest: { type: Boolean, default: false },
    latestSpeedTest: {
      downloadMbps: Number,
      uploadMbps: Number,
      latencyMs: Number,
      qualityScore: Number,
      category: {
        type: String,
        enum: ['excellent', 'good', 'fair', 'poor']
      },
      testedAt: Date,
      testedBy: { type: Schema.Types.ObjectId, ref: 'User' }
    },
    averageSpeedTest: {
      downloadMbps: Number,
      uploadMbps: Number,
      latencyMs: Number,
      qualityScore: Number,
      totalTests: Number,
      lastCalculatedAt: Date
    },
    ssids: [
      {
        ssid: String,
        isGuest: { type: Boolean, default: false },
        isPrimary: { type: Boolean, default: false },
        hasPassword: { type: Boolean, default: true },
        notes: String
      }
    ]
  },

  googleData: {
    placeId: { type: String, index: true },
    primaryType: String,
    primaryTypeLabel: String,
    allTypes: [String],
    googleMapsUrl: String,
    rating: Number,
    userRatingsCount: Number,
    businessStatus: String,
    priceLevel: { 
      type: Number, 
      min: 0, 
      max: 4,
      index: true 
    },
    priceLevelDisplay: { 
      type: String,
      enum: ['', '$', '$$', '$$$', '$$$$']
    },
    priceRange: String,
    displayPrice: String,     
    photoReference: String,
    importedAt: Date,
    importedBy: String,
  },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    sparse: true,
    index: true
  },
  assignedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    sparse: true
  },
  assignmentDate: {
    type: Date,
    index: true
  },
  expectedVisitDate: {
    type: Date,
    index: true
  },
  visitedAt: {
    type: Date,
    index: true
  },
  visitStatus: {
    type: String,
    enum: ['not_visited', 'visited', 'in_progress'],
    default: 'not_visited',
    index: true
  },
  vitalsCompleted: {
    type: Boolean,
    default: false,
    index: true
  },
  vitalsCompletedAt: Date,
  vitalsData: {
    nameConfirmed: { type: Boolean, default: false },
    categoryConfirmed: { type: Boolean, default: false },
    locationConfirmed: { type: Boolean, default: false },
    addressConfirmed: { type: Boolean, default: false },
    hoursConfirmed: { type: Boolean, default: false },
    accountNameConfirmed: { type: Boolean, default: false },
    billingCityConfirmed: { type: Boolean, default: false },
    billingDistrictConfirmed: { type: Boolean, default: false },
    billingStreetConfirmed: { type: Boolean, default: false },
    billingStateConfirmed: { type: Boolean, default: false },
    phoneConfirmed: { type: Boolean, default: false },
    websiteConfirmed: { type: Boolean, default: false },
    parkingOptionsConfirmed: { type: Boolean, default: false },
    venueGroupConfirmed: { type: Boolean, default: false },
    venueCategoryConfirmed: { type: Boolean, default: false },
    venueTypeConfirmed: { type: Boolean, default: false },
    openingHoursConfirmed: { type: Boolean, default: false },
    paymentTypesConfirmed: { type: Boolean, default: false },
    wifiAvailable: Boolean,
    workFriendly: Boolean
  },
  
  // Task completion flags
  gpsVerified: { type: Boolean, default: false },
  photosUploaded: { type: Boolean, default: false },
  zonesCreated: { type: Boolean, default: false },
  atmosphereSet: { type: Boolean, default: false },
  
  declineReason: String,
  leadCapturedAt: Date,
  leadCapturedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },

 // NEW: Notes Array
  notes: [
    {
      noteId: {
        type: String,
        required: true
      },
      noteType: {
        type: String,
        enum: ['vitals', 'gps', 'zones', 'photos', 'wifi', 'atmosphere', 'general'],
        required: true,
        index: true
      },
      content: {
        type: String,
        required: true
      },
      createdBy: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: Date
    }
  ]
}, {
  timestamps: true,
  collection: 'agent_venue_temps'
});

// Compound Indexes
AgentVenueTempSchema.index({ createdBy: 1, status: 1 });
AgentVenueTempSchema.index({ region: 1, verificationLevel: 1 });
AgentVenueTempSchema.index({ 'address.lat': 1, 'address.lng': 1 });
AgentVenueTempSchema.index({ assignedTo: 1, expectedVisitDate: 1 });
AgentVenueTempSchema.index({ assignedTo: 1, visitStatus: 1 });
AgentVenueTempSchema.index({ assignedBy: 1, assignmentDate: -1 });
AgentVenueTempSchema.index({ verificationLevel: 1, status: 1 });
AgentVenueTempSchema.index({ assignedTo: 1, vitalsCompleted: 1 });
AgentVenueTempSchema.index({ 'gpsData.hl_gps_status': 1 });
AgentVenueTempSchema.index({ 'gpsData.hl_confirmed_lat': 1, 'gpsData.hl_confirmed_lng': 1 });
AgentVenueTempSchema.index({ 'wifiData.hasSpeedTest': 1 });
AgentVenueTempSchema.index({ 'wifiData.latestSpeedTest.qualityScore': 1 });

export default mongoose.model<IAgentVenueTemp>('AgentVenueTemp', AgentVenueTempSchema);
