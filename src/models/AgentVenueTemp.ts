import mongoose, { Schema, Document } from 'mongoose';

export enum VenueOnboardingStatus {
  UNLISTED = 'UNLISTED',
  LISTED_UNCLAIMED = 'LISTED_UNCLAIMED',
  SOFT_ONBOARDED = 'SOFT_ONBOARDED',
  NOT_INTERESTED = 'NOT_INTERESTED',
  INTERESTED_LATER = 'INTERESTED_LATER',
  FULLY_VERIFIED = 'FULLY_VERIFIED'
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
  crmId?: string;
  venueId?: mongoose.Types.ObjectId;
  region: string;

  flags: {
    qrCodesLeftBehind: boolean;
    ownerMet: boolean;
    haveOwnersContact: boolean;
    managerMet: boolean;
    haveManagersContact: boolean;
  };

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

  googleData?: {
    placeId: string;
    primaryType?: string;
    allTypes?: string[];
    googleMapsUrl?: string;
    rating?: number;
    userRatingsCount?: number;
    businessStatus?: string;
    priceLevel?: number;
    photoReference?: string;
    importedAt?: Date;
    importedBy?: string;
  };

  createdAt: Date;
  updatedAt: Date;
}

const AgentVenueTempSchema = new Schema<IAgentVenueTemp>({
  tempVenueId: {
    type: String,
    unique: true,
    required: true
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
googleData: {
  placeId: { type: String, index: true },
  primaryType: String,
  primaryTypeLabel: String,
  allTypes: [String],
  googleMapsUrl: String,
  utcOffsetMinutes: Number,
  rating: Number,
  userRatingsCount: Number,
  reviews: String, // JSON string
  businessStatus: String,
  editorialSummary: String,
  priceLevel: String,
  paymentOptions: String, // JSON string
  accessibilityOptions: String, // JSON string
  parkingOptions: String, // JSON string
  atmosphereFlags: String, // JSON string
  photoReference: String,
  allPhotos: String, // JSON string
  importedAt: Date,
  importedBy: String
}
}, {
  timestamps: true,
  collection: 'agent_venue_temps'
});

// Indexes
AgentVenueTempSchema.index({ createdBy: 1, status: 1 });
AgentVenueTempSchema.index({ region: 1, onboardingStatus: 1 });
AgentVenueTempSchema.index({ 'address.lat': 1, 'address.lng': 1 });
AgentVenueTempSchema.index({ 'googleData.placeId': 1 }, { sparse: true });

export default mongoose.model<IAgentVenueTemp>('AgentVenueTemp', AgentVenueTempSchema);