// ===== FILE: src/models/Venue.ts =====

import mongoose, { Schema, Document, Model } from 'mongoose';
import { Region, getRegionalModel } from '../config/database';

// ───── INTERFACE DEFINITIONS ─────

// Venue interface (NO street vendor fields)
export interface IVenue extends Document {
  // CORE IDENTIFIERS
  globalId: string;
  AccountName: string;
  Account_Name?: string;

  // TOP-LEVEL CATEGORY
  groupid?: string;
  groupiddisplayname?: string;

  // GEOSPATIAL DATA (SINGLE SOURCE OF TRUTH)
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };

  // Backward compatibility fields (NOT geo-indexed)
  LatitudeMapslytextsingleLine?: number;
  LongitudeMapslytextsingleLine?: number;
  Latitude_Mapsly_text_singleLine?: number;
  Longitude_Mapsly_text_singleLine?: number;

  // ADDRESS INFORMATION
  BillingStreet?: string;
  Billing_Street?: string;
  BillingCity?: string;
  Billing_City?: string;
  BillingState?: string;
  Billing_State?: string;
  BillingDistrict?: string;
  Billing_District?: string;
  BillingCountry?: string;
  BillingPostalCode?: string;

  // VENUE CLASSIFICATION (HIERARCHICAL)
  venuetype?: string;
  venuetypedisplay?: string;
  venuecategory?: string;
  venuecategorydisplayname?: string;
  venue_type?: string;
  venue_type_display?: string;
  venue_category?: string;
  venue_category_display?: string;

  // RATINGS & SCORES
  Rating?: number;
  Nomad_friendly_score?: number;
  Family_frienliness_score?: number;

  // PRICING INFORMATION
  HL_Price_Level?: number;
  BudgetFriendly?: string;
  Budget_Friendly?: string;
  Coffee_price_range?: string;
  Entrance_Fee?: string;

  // OPERATING HOURS & MEAL SERVICE
  HL_Opening_Hours_Text?: string;
  Opening_Hours?: string;
  Open_Late?: boolean;
  Breakfast_offered?: boolean;
  Brunch_offered?: boolean;
  Dinner_offered?: boolean;

  // FOOD & BEVERAGE
  Cuisine_Tags?: string;
  CuisineTags?: string;
  Dietary_tags?: string;
  Healthy_food_level?: string;
  Veg_only?: boolean;
  Alcohol_served?: boolean;
  Type_Of_Coffee?: string;

  // CONNECTIVITY & WIFI
  Pub_Wifi?: boolean | number;
  PubWifi?: boolean | number;
  Wifi_SSID?: string;
  Wifi_bage?: string;
  DL_SPeed_MBPS?: number;
  UL_SPeed_MBPS?: number;

  // POWER & CHARGING
  Charging_Ports?: number;
  Power_outlet_density?: string;
  Power_backup?: boolean;

  // TV & ENTERTAINMENT
  Has_TV_Display?: boolean;
  Number_of_TVs?: number;
  Shows_what_on_TV?: string;

  // POLICIES
  Pet_Policy?: string;
  'Smoking Policy'?: string;
  Kids_friendly_badge?: string;
  Group_policy?: string;
  Takes_bookings?: boolean;

  // ATMOSPHERE & ENVIRONMENT
  View?: string;
  Noise_Level?: string;
  Staff_friedliness_bage?: string;
  HL_zoho_AC_Fan?: string;

  // PHYSICAL FEATURES
  Outdoor_seating?: boolean;
  Offers_water_refills?: boolean;
  Day_pass_club?: boolean;
  Hotel_pool_access?: boolean;

  // CONTACT & LOGISTICS
  parking_options?: string;
  Website?: string;
  Int_phone_google_mapsly?: string;
  Phone?: string;
  PaymentTypes?: string;
  'Payment types'?: string;

  // VITALS FIELDS
  operatingHours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  socialLinks?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
  };

  // Amenities object
  Amenities?: {
    wifi?: boolean;
    charging?: boolean;
    outdoor?: boolean;
    parking?: string;
    tv?: boolean;
  };

  // METADATA
  ownerId?: mongoose.Schema.Types.ObjectId;
  isVerified?: boolean;
  isActive?: boolean;
  region: string;
  createdAt?: Date;
  updatedAt?: Date;

  // Allow any other fields
  [key: string]: any;

  // INSTANCE METHODS
  getDistance(longitude: number, latitude: number): number | null;
  isNomadFriendly(): boolean;
  isFamilyFriendly(): boolean;
}

// Street Vendor interface (SEPARATE from IVenue)
export interface IStreetVendor extends Document {
  // VENDOR SPECIFIC
  vendorName: string;
  vendorType: 'static' | 'mobile';

  // AUTHENTICATION
  email: string;
  password: string;
  phone?: string;
  vendorPhoneNumber?: string;

  // PROFILE
  description?: string;
  profileImage?: string;
  coverImage?: string;

  // MENU ITEMS
  menuItems?: Array<{
    itemId: string;
    name: string;
    description?: string;
    price: number;
    currency: string;
    image?: string;
    category?: string;
    isAvailable: boolean;
    preparationTime?: number; // in minutes
    createdAt: Date;
    updatedAt: Date;
  }>;

  // Live Location Tracking (VENDOR ONLY)
  currentLocation: {
    type: 'Point';
    coordinates: [number, number]; // [lng, lat]
    timestamp: Date;
    accuracy?: number;
  };

  // Availability
  isOperational: boolean;

  // OPERATING HOURS
  operatingHours?: {
    monday?: { open: string; close: string; isClosed?: boolean };
    tuesday?: { open: string; close: string; isClosed?: boolean };
    wednesday?: { open: string; close: string; isClosed?: boolean };
    thursday?: { open: string; close: string; isClosed?: boolean };
    friday?: { open: string; close: string; isClosed?: boolean };
    saturday?: { open: string; close: string; isClosed?: boolean };
    sunday?: { open: string; close: string; isClosed?: boolean };
  };

  // Service Area
  serviceRadius?: number;
  serviceArea?: {
    type: 'Polygon';
    coordinates: number[][][];
  };

  // Location History
  locationHistory?: Array<{
    coordinates: [number, number];
    timestamp: Date;
    accuracy?: number;
  }>;

  // RATINGS & STATISTICS
  rating?: number;
  totalRatings?: number;
  totalOrders?: number;

  // ADMIN APPROVAL
  approvalStatus: 'pending' | 'approved' | 'rejected' | 'suspended';
  approvalNote?: string;
  approvedAt?: Date;
  approvedBy?: mongoose.Schema.Types.ObjectId;

  // Shared fields with venues (for compatibility)
  globalId?: string;
  AccountName?: string;
  Cuisine_Tags?: string;
  'Payment types'?: string;
  BudgetFriendly?: string;
  hotspot?: boolean;

  // System
  region: string;
  isActive?: boolean;
  ownerId?: mongoose.Schema.Types.ObjectId;
  lastLoginAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;

  [key: string]: any;
}

// Static methods interface
export interface IVenueModel extends Model<IVenue> {
  findNearby(longitude: number, latitude: number, maxDistance?: number): Promise<IVenue[]>;
  findByFilters(filters?: any): Promise<IVenue[]>;
  findByGroup(groupId: string): Promise<IVenue[]>;
  findByCategory(categoryId: string): Promise<IVenue[]>;
  getGroupStats(): Promise<any>;
}

// ───── SCHEMA DEFINITION ─────

// GeoJSON Point schema
const pointSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point',
    },
    coordinates: {
      type: [Number],
      required: [true, 'Coordinates are required'],
      validate: {
        validator: function (coords: number[]) {
          return coords && coords.length === 2 &&
            coords[0] >= -180 && coords[0] <= 180 &&
            coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Invalid coordinates: must be [longitude, latitude]',
      },
    },
  },
  { _id: false }
);

// GeoJSON Polygon schema
const polygonSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Polygon'],
      required: true,
      default: 'Polygon',
    },
    coordinates: {
      type: [[[Number]]],
      required: true,
    },
  },
  { _id: false }
);

// ===== VENUE SCHEMA (FOR REGULAR VENUES) =====
const VenueSchema = new mongoose.Schema<IVenue>(
  {
    // CORE IDENTIFIERS
    globalId: {
      type: String,
      required: [true, 'globalId is required'],
      unique: true,
      sparse: true,
      index: true
    },

    AccountName: {
      type: String,
      required: [true, 'AccountName is required'],
      index: true
    },
    Account_Name: String,

    groupid: { type: String, index: true },
    groupiddisplayname: String,

    // ========== SINGLE GEOMETRY INDEX ==========
    geometry: {
      type: pointSchema,
      required: [true, 'geometry with coordinates is required'],
      index: '2dsphere'
    },
    // ============================================

    // Backward compatibility fields (NOT indexed as geo)
    LatitudeMapslytextsingleLine: { type: Number, min: -90, max: 90 },
    LongitudeMapslytextsingleLine: { type: Number, min: -180, max: 180 },
    Latitude_Mapsly_text_singleLine: { type: Number, min: -90, max: 90 },
    Longitude_Mapsly_text_singleLine: { type: Number, min: -180, max: 180 },

    // ADDRESS
    BillingStreet: String,
    Billing_Street: String,
    BillingCity: { type: String, index: true },
    Billing_City: String,
    BillingState: String,
    Billing_State: String,
    BillingDistrict: { type: String, index: true },
    Billing_District: String,
    BillingCountry: { type: String, index: true },
    BillingPostalCode: String,

    // VENUE CLASSIFICATION
    venuetype: { type: String, index: true },
    venuetypedisplay: String,
    venuecategory: { type: String, index: true },
    venuecategorydisplayname: String,
    venue_type: String,
    venue_type_display: String,
    venue_category: String,
    venue_category_display: String,

    // RATINGS & SCORES
    Rating: { type: Number, min: 0, max: 5, default: 0, index: -1 },
    Nomad_friendly_score: { type: Number, min: 1, max: 5 },
    Family_frienliness_score: { type: Number, min: 1, max: 5 },

    // PRICING
    HL_Price_Level: { type: Number, min: 1, max: 5 },
    BudgetFriendly: { type: String, index: true },
    Budget_Friendly: String,
    Coffee_price_range: String,
    Entrance_Fee: String,

    // OPERATING HOURS
    HL_Opening_Hours_Text: String,
    Opening_Hours: String,
    Open_Late: { type: Boolean, default: false },
    Breakfast_offered: { type: Boolean, default: false },
    Brunch_offered: { type: Boolean, default: false },
    Dinner_offered: { type: Boolean, default: false },

    // FOOD & BEVERAGE
    Cuisine_Tags: String,
    CuisineTags: String,
    Dietary_tags: String,
    Healthy_food_level: String,
    Veg_only: { type: Boolean, default: false },
    Alcohol_served: { type: Boolean, default: false, index: true },
    Type_Of_Coffee: String,

    // WIFI & CONNECTIVITY
    Pub_Wifi: { type: Boolean, default: false, index: true },
    PubWifi: Boolean,
    Wifi_SSID: String,
    Wifi_bage: String,
    DL_SPeed_MBPS: { type: Number, min: 0 },
    UL_SPeed_MBPS: { type: Number, min: 0 },

    // POWER & CHARGING
    Charging_Ports: { type: Number, min: 0, default: 0 },
    Power_outlet_density: String,
    Power_backup: { type: Boolean, default: false },

    // TV & ENTERTAINMENT
    Has_TV_Display: { type: Boolean, default: false },
    Number_of_TVs: { type: Number, min: 0, default: 0 },
    Shows_what_on_TV: String,

    // POLICIES
    Pet_Policy: String,
    'Smoking Policy': String,
    Kids_friendly_badge: String,
    Group_policy: String,
    Takes_bookings: { type: Boolean, default: false },

    // ATMOSPHERE
    View: String,
    Noise_Level: String,
    Staff_friedliness_bage: String,
    HL_zoho_AC_Fan: String,

    // PHYSICAL FEATURES
    Outdoor_seating: { type: Boolean, default: false },
    Offers_water_refills: { type: Boolean, default: false },
    Day_pass_club: { type: Boolean, default: false },
    Hotel_pool_access: { type: Boolean, default: false },

    // CONTACT & LOGISTICS
    parking_options: String,
    Website: String,
    Int_phone_google_mapsly: String,
    Phone: String,
    PaymentTypes: String,
    'Payment types': String,

    // AMENITIES
    Amenities: {
      wifi: Boolean,
      charging: Boolean,
      outdoor: Boolean,
      parking: String,
      tv: Boolean,
      _id: false
    },

    // VITALS
    operatingHours: {
      monday: String,
      tuesday: String,
      wednesday: String,
      thursday: String,
      friday: String,
      saturday: String,
      sunday: String,
      _id: false
    },

    socialLinks: {
      instagram: String,
      facebook: String,
      twitter: String,
      linkedin: String,
      _id: false
    },

    // SYSTEM
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    isVerified: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    region: { type: String, required: true, index: true, default: 'global' },
  },
  {
    timestamps: true,
    collection: 'venues',
    strict: false
  }
);

// ───── VENUE INDEXES (ONLY ONE 2dsphere for geometry) ─────
VenueSchema.index({ 'geometry': '2dsphere', Rating: -1 });
VenueSchema.index({ groupid: 1, venuecategory: 1 });
VenueSchema.index({ venuetype: 1, BillingDistrict: 1 });
VenueSchema.index({ BudgetFriendly: 1, Rating: -1 });
VenueSchema.index({ Pub_Wifi: 1, Nomad_friendly_score: -1 });
VenueSchema.index({ Alcohol_served: 1, venuecategory: 1 });
VenueSchema.index({ region: 1, isActive: 1 });
VenueSchema.index({ BillingCountry: 1, BillingCity: 1 });
VenueSchema.index({ globalId: 1, region: 1 }, { unique: true, sparse: true });
VenueSchema.index({ createdAt: -1 });

// ───── VENUE VIRTUALS ─────
VenueSchema.virtual('coordinates').get(function (this: IVenue) {
  return this.geometry?.coordinates || null;
});

VenueSchema.virtual('cuisineArray').get(function (this: IVenue) {
  const tags = this.Cuisine_Tags || this.CuisineTags;
  return tags ? tags.split(/[|;,]/).map((t: string) => t.trim()) : [];
});

VenueSchema.virtual('dietaryArray').get(function (this: IVenue) {
  return this.Dietary_tags ? this.Dietary_tags.split(/[|;,]/).map((t: string) => t.trim()) : [];
});

VenueSchema.virtual('paymentArray').get(function (this: IVenue) {
  const payments = this.PaymentTypes || this['Payment types'];
  return payments ? payments.split(/[|;,]/).map((t: string) => t.trim()) : [];
});

// ───── VENUE STATIC METHODS ─────
VenueSchema.statics.findNearby = function (longitude: number, latitude: number, maxDistance: number = 5000) {
  return this.find({
    geometry: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude],
        },
        $maxDistance: maxDistance,
      },
    },
    isActive: true,
  });
};

VenueSchema.statics.findByFilters = function (filters: any) {
  const query: any = { isActive: true };
  if (filters.venueType) query.venuetype = filters.venueType;
  if (filters.district) query.BillingDistrict = filters.district;
  if (filters.budget) query.BudgetFriendly = filters.budget;
  if (filters.wifi) query.Pub_Wifi = true;
  if (filters.alcohol) query.Alcohol_served = true;
  if (filters.minRating) query.Rating = { $gte: filters.minRating };
  if (filters.country) query.BillingCountry = filters.country;
  if (filters.region) query.region = filters.region;
  return this.find(query).sort({ Rating: -1 });
};

VenueSchema.statics.findByGroup = function (groupId: string) {
  return this.find({ groupid: groupId, isActive: true }).sort({ Rating: -1 });
};

VenueSchema.statics.findByCategory = function (categoryId: string) {
  return this.find({ venuecategory: categoryId, isActive: true }).sort({ Rating: -1 });
};

VenueSchema.statics.getGroupStats = async function () {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $group: {
        _id: '$groupid',
        displayName: { $first: '$groupiddisplayname' },
        count: { $sum: 1 },
        avgRating: { $avg: '$Rating' },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

// ───── VENUE INSTANCE METHODS ─────
VenueSchema.methods.getDistance = function (this: IVenue, longitude: number, latitude: number): number | null {
  if (!this.geometry?.coordinates) return null;
  const [venueLng, venueLat] = this.geometry.coordinates;
  const R = 6371;
  const dLat = ((venueLat - latitude) * Math.PI) / 180;
  const dLng = ((venueLng - longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((latitude * Math.PI) / 180) *
    Math.cos((venueLat * Math.PI) / 180) *
    Math.sin(dLng / 2) *
    Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

VenueSchema.methods.isNomadFriendly = function (this: IVenue): boolean {
  return !!(
    this.Pub_Wifi &&
    this.Charging_Ports && this.Charging_Ports > 0 &&
    this.Nomad_friendly_score && this.Nomad_friendly_score >= 3
  );
};

VenueSchema.methods.isFamilyFriendly = function (this: IVenue): boolean {
  return !!(
    (this.Kids_friendly_badge === 'Allowed' || this.Kids_friendly_badge === 'Very Kid Friendly') ||
    (this.Family_frienliness_score && this.Family_frienliness_score >= 3)
  );
};

// ───── VENUE PRE-SAVE MIDDLEWARE ─────
VenueSchema.pre<IVenue>('save', function (next) {
  // Sync geometry from individual coordinates if provided
  if ((this.LatitudeMapslytextsingleLine || this.Latitude_Mapsly_text_singleLine) &&
    (this.LongitudeMapslytextsingleLine || this.Longitude_Mapsly_text_singleLine)) {

    const lat = this.LatitudeMapslytextsingleLine || this.Latitude_Mapsly_text_singleLine;
    const lng = this.LongitudeMapslytextsingleLine || this.Longitude_Mapsly_text_singleLine;

    if (lat && lng) {
      this.geometry = {
        type: 'Point',
        coordinates: [lng, lat]
      };
    }
  }

  // Ensure geometry is valid before save
  if (!this.geometry || !this.geometry.coordinates || this.geometry.coordinates.length !== 2) {
    throw new Error('Invalid geometry: coordinates must be [longitude, latitude]');
  }

  next();
});

// ===== STREET VENDOR SCHEMA (SEPARATE) =====
const StreetVendorSchema = new mongoose.Schema<IStreetVendor>(
  {
    // VENDOR IDENTIFIERS
    vendorName: {
      type: String,
      required: [true, 'vendorName is required'],
      trim: true,
      maxlength: [100, 'Vendor name cannot exceed 100 characters']
    },

    vendorType: {
      type: String,
      enum: ['static', 'mobile'],
      required: true,
      index: true
    },

    // AUTHENTICATION
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false // Don't include password in queries by default
    },
    phone: {
      type: String,
      trim: true
    },
    vendorPhoneNumber: String,

    // PROFILE
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters']
    },
    profileImage: String,
    coverImage: String,

    // MENU ITEMS
    menuItems: [{
      itemId: {
        type: String,
        required: true,
        default: () => new mongoose.Types.ObjectId().toString()
      },
      name: {
        type: String,
        required: [true, 'Menu item name is required'],
        trim: true,
        maxlength: [100, 'Item name cannot exceed 100 characters']
      },
      description: {
        type: String,
        maxlength: [300, 'Item description cannot exceed 300 characters']
      },
      price: {
        type: Number,
        required: [true, 'Price is required'],
        min: [0, 'Price cannot be negative']
      },
      currency: {
        type: String,
        default: 'THB',
        enum: ['THB', 'USD', 'AED', 'EUR', 'GBP']
      },
      image: String,
      category: {
        type: String,
        trim: true
      },
      isAvailable: {
        type: Boolean,
        default: true
      },
      preparationTime: {
        type: Number,
        min: [0, 'Preparation time cannot be negative']
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      updatedAt: {
        type: Date,
        default: Date.now
      },
      _id: false
    }],

    // LIVE LOCATION (VENDOR ONLY)
    currentLocation: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: [true, 'Current location coordinates are required'],
        validate: {
          validator: function (coords: number[]) {
            return coords.length === 2 &&
              coords[0] >= -180 && coords[0] <= 180 &&
              coords[1] >= -90 && coords[1] <= 90;
          },
          message: 'Invalid coordinates for currentLocation: [longitude, latitude]'
        }
      },
      timestamp: {
        type: Date,
        default: Date.now
      },
      accuracy: Number
    },

    // AVAILABILITY
    isOperational: {
      type: Boolean,
      default: false,
      index: true
    },

    // OPERATING HOURS
    operatingHours: {
      monday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      tuesday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      wednesday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      thursday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      friday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      saturday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      sunday: { open: String, close: String, isClosed: { type: Boolean, default: false } },
      _id: false
    },

    // SERVICE AREA
    serviceRadius: {
      type: Number,
      default: 500,
      min: [50, 'Service radius must be at least 50 meters'],
      max: [10000, 'Service radius cannot exceed 10km']
    },

    serviceArea: polygonSchema,

    // LOCATION HISTORY
    locationHistory: [{
      coordinates: [Number],
      timestamp: Date,
      accuracy: Number,
      _id: false
    }],

    // RATINGS & STATISTICS
    rating: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    totalRatings: {
      type: Number,
      default: 0
    },
    totalOrders: {
      type: Number,
      default: 0
    },

    // ADMIN APPROVAL
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'suspended'],
      default: 'pending',
      index: true
    },
    approvalNote: String,
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // SHARED FIELDS
    globalId: String,
    AccountName: String,
    Cuisine_Tags: String,
    'Payment types': String,
    BudgetFriendly: String,
    hotspot: Boolean,

    // SYSTEM
    region: { type: String, required: true, index: true },
    isActive: { type: Boolean, default: true, index: true },
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    lastLoginAt: Date,
  },
  {
    timestamps: true,
    collection: 'street_vendors',
    strict: false
  }
);

// ───── STREET VENDOR INDEXES ─────
StreetVendorSchema.index({ 'currentLocation': '2dsphere' });
StreetVendorSchema.index({ isOperational: 1, vendorType: 1 });
StreetVendorSchema.index({ 'currentLocation.timestamp': -1 });
StreetVendorSchema.index({ region: 1, isActive: 1 });
StreetVendorSchema.index({ email: 1 }, { unique: true, sparse: true });
StreetVendorSchema.index({ approvalStatus: 1, region: 1 });
StreetVendorSchema.index({ vendorName: 'text', description: 'text' });


// ───── REGION HELPER ─────
export const getVenueModel = (region: Region) => {
  return getRegionalModel<IVenue>('Venue', VenueSchema, region);
};

export const getStreetVendorModel = (region: Region) => {
  return getRegionalModel<IStreetVendor>('StreetVendor', StreetVendorSchema, region);
};

// ───── DEFAULT EXPORTS ─────
export default mongoose.model<IVenue, IVenueModel>('Venue', VenueSchema);
export const StreetVendorModel = mongoose.model<IStreetVendor>('StreetVendor', StreetVendorSchema);
