// ===== FILE: src/models/Venue.ts =====
import mongoose, { Schema, Document, Model } from 'mongoose';

// Define the interface matching Dubai schema structure
export interface IVenue extends Document {
  // CORE IDENTIFIERS
  globalId: string;
  AccountName: string;

  // TOP-LEVEL CATEGORY
  groupid?: string;
  groupiddisplayname?: string;

  // GEOSPATIAL DATA
  geometry: {
    type: 'Point';
    coordinates: [number, number];
  };
  LatitudeMapslytextsingleLine?: number;
  LongitudeMapslytextsingleLine?: number;

  // ADDRESS INFORMATION
  BillingStreet?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingDistrict?: string;
  BillingCountry?: string;
  BillingPostalCode?: string; // ✅ ADDED

  // VENUE CLASSIFICATION (HIERARCHICAL)
  venuetype?: string;
  venuetypedisplay?: string;
  venuecategory?: string;
  venuecategorydisplayname?: string;

  // RATINGS & SCORES
  Rating?: number;
  Nomadfriendlyscore?: number;
  Familyfrienlinessscore?: number;

  // PRICING INFORMATION
  HLPriceLevel?: number;
  BudgetFriendly?: string;
  Coffeepricerange?: string;
  EntranceFee?: string;

  // OPERATING HOURS & MEAL SERVICE
  HLOpeningHoursText?: string;
  OpenLate?: number;
  Breakfastoffered?: number;
  Brunchoffered?: number;
  Dinneroffered?: number;

  // FOOD & BEVERAGE
  CuisineTags?: string;
  Dietarytags?: string;
  Healthyfoodlevel?: string;
  Vegonly?: number;
  Alcoholserved?: number;
  TypeOfCoffee?: string;

  // CONNECTIVITY & WIFI
  PubWifi?: number;
  WifiSSID?: string;
  Wifibage?: string;
  DLSPeedMBPS?: number;
  ULSPeedMBPS?: number;

  // POWER & CHARGING
  ChargingPorts?: number;
  Poweroutletdensity?: string;
  Powerbackup?: number;

  // TV & ENTERTAINMENT
  HasTVDisplay?: number;
  NumberofTVs?: number;
  ShowswhatonTV?: string;

  // POLICIES
  PetPolicy?: string;
  'Smoking Policy'?: string;
  Kidsfriendlybadge?: string;
  Grouppolicy?: string;
  Takesbookings?: number;

  // ATMOSPHERE & ENVIRONMENT
  View?: string;
  NoiseLevel?: string;
  Stafffriedlinessbage?: string;
  HLzohoACFan?: string;

  // PHYSICAL FEATURES
  Outdoorseating?: number;
  Offerswaterrefills?: number;
  Daypassclub?: number;
  Hotelpoolaccess?: number;

  // CONTACT & LOGISTICS
  parkingoptions?: string;
  Website?: string;
  Intphonegooglemapsly?: string;
  Phone?: string; // ✅ ADDED
  'Payment types'?: string;

  // ✅ VITALS FIELDS - ADDED
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

  // METADATA
  ownerId?: mongoose.Schema.Types.ObjectId;
  isVerified?: boolean;
  isActive?: boolean;
  region?: string;
  createdAt: Date;
  updatedAt: Date;

  // Allow any other fields
  [key: string]: any;

  // INSTANCE METHODS
  getDistance(longitude: number, latitude: number): number | null;
  isNomadFriendly(): boolean;
  isFamilyFriendly(): boolean;
}

// Define static methods interface
export interface IVenueModel extends Model<IVenue> {
  findNearby(longitude: number, latitude: number, maxDistance?: number): Promise<IVenue[]>;
  findByFilters(filters?: any): Promise<IVenue[]>;
  findByGroup(groupId: string): Promise<IVenue[]>;
  findByCategory(categoryId: string): Promise<IVenue[]>;
  getGroupStats(): Promise<any>;
}

// Define GeoJSON Point schema
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
      required: true,
      validate: {
        validator: function (coords: number[]) {
          return (
            coords.length === 2 &&
            coords[0] >= -180 &&
            coords[0] <= 180 &&
            coords[1] >= -90 &&
            coords[1] <= 90
          );
        },
        message: 'Invalid coordinates format: [longitude, latitude]',
      },
    },
  },
  { _id: false }
);

// Create the main venue schema
const VenueSchema = new mongoose.Schema<IVenue>(
  {
    // CORE IDENTIFIERS
    globalId: { type: String, required: true, unique: true, sparse: true, index: true },
    AccountName: { type: String, required: true, index: true },

    // TOP-LEVEL CATEGORY
    groupid: { type: String, index: true },
    groupiddisplayname: String,

    // GEOSPATIAL DATA
    geometry: { type: pointSchema, required: true, index: '2dsphere' },
    LatitudeMapslytextsingleLine: { type: Number, min: -90, max: 90 },
    LongitudeMapslytextsingleLine: { type: Number, min: -180, max: 180 },

    // ADDRESS INFORMATION
    BillingStreet: String,
    BillingCity: { type: String, index: true },
    BillingState: String,
    BillingDistrict: { type: String, index: true },
    BillingCountry: { type: String, index: true },
    BillingPostalCode: String, // ✅ ADDED

    // VENUE CLASSIFICATION (HIERARCHICAL)
    venuetype: { type: String, index: true },
    venuetypedisplay: String,
    venuecategory: { type: String, index: true },
    venuecategorydisplayname: String,

    // RATINGS & SCORES
    Rating: { type: Number, min: 0, max: 5, index: -1 },
    Nomadfriendlyscore: { type: Number, min: 1, max: 5 },
    Familyfrienlinessscore: { type: Number, min: 1, max: 5 },

    // PRICING INFORMATION
    HLPriceLevel: { type: Number, min: 1, max: 5 },
    BudgetFriendly: { type: String, index: true },
    Coffeepricerange: String,
    EntranceFee: String,

    // OPERATING HOURS & MEAL SERVICE
    HLOpeningHoursText: String,
    OpenLate: { type: Number, enum: [0, 1], index: true },
    Breakfastoffered: { type: Number, enum: [0, 1] },
    Brunchoffered: { type: Number, enum: [0, 1] },
    Dinneroffered: { type: Number, enum: [0, 1] },

    // FOOD & BEVERAGE
    CuisineTags: String,
    Dietarytags: String,
    Healthyfoodlevel: { type: String, enum: ['Low', 'Medium', 'High', ''] },
    Vegonly: { type: Number, enum: [0, 1] },
    Alcoholserved: { type: Number, enum: [0, 1], index: true },
    TypeOfCoffee: String,

    // CONNECTIVITY & WIFI
    PubWifi: { type: Number, enum: [0, 1], index: true },
    WifiSSID: String,
    Wifibage: { type: String, enum: ['Verified', 'Unverified', ''] },
    DLSPeedMBPS: { type: Number, min: 0 },
    ULSPeedMBPS: { type: Number, min: 0 },

    // POWER & CHARGING
    ChargingPorts: { type: Number, min: 0 },
    Poweroutletdensity: { type: String, enum: ['Low', 'Medium', 'High', ''] },
    Powerbackup: { type: Number, enum: [0, 1] },

    // TV & ENTERTAINMENT
    HasTVDisplay: { type: Number, enum: [0, 1] },
    NumberofTVs: { type: Number, min: 0 },
    ShowswhatonTV: String,

    // POLICIES
    PetPolicy: String,
    'Smoking Policy': String,
    Kidsfriendlybadge: { type: String, enum: ['Allowed', 'Limited', 'Not Ideal', ''] },
    Grouppolicy: String,
    Takesbookings: { type: Number, enum: [0, 1] },

    // ATMOSPHERE & ENVIRONMENT
    View: String,
    NoiseLevel: { type: String, enum: ['Moderate', 'Lively', 'Quiet', ''] },
    Stafffriedlinessbage: { type: String, enum: ['Very Friendly', 'Friendly', 'Neutral', ''] },
    HLzohoACFan: { type: String, enum: ['AC', 'Fan', ''] },

    // PHYSICAL FEATURES
    Outdoorseating: { type: Number, enum: [0, 1] },
    Offerswaterrefills: { type: Number, enum: [0, 1] },
    Daypassclub: { type: Number, enum: [0, 1] },
    Hotelpoolaccess: { type: Number, enum: [0, 1] },

    // CONTACT & LOGISTICS
    parkingoptions: String,
    Website: String,
    Intphonegooglemapsly: String,
    Phone: String, // ✅ ADDED
    'Payment types': String,

    // ✅ VITALS FIELDS - ADDED
    operatingHours: {
      monday: String,
      tuesday: String,
      wednesday: String,
      thursday: String,
      friday: String,
      saturday: String,
      sunday: String
    },
    socialLinks: {
      instagram: String,
      facebook: String,
      twitter: String,
      linkedin: String
    },

    // ADDITIONAL METADATA
    ownerId: { type: Schema.Types.ObjectId, ref: 'User' },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    region: { type: String, index: true, default: 'global' },
  },
  {
    timestamps: true,
    collection: 'venues',
    strict: false, // ⭐ CRITICAL: Allow fields not in schema
  }
);

// COMPOUND INDEXES FOR COMMON QUERIES
VenueSchema.index({ groupid: 1, venuecategory: 1 });
VenueSchema.index({ groupid: 1, Rating: -1 });
VenueSchema.index({ venuetype: 1, BillingDistrict: 1 });
VenueSchema.index({ BudgetFriendly: 1, Rating: -1 });
VenueSchema.index({ PubWifi: 1, Nomadfriendlyscore: -1 });
VenueSchema.index({ Alcoholserved: 1, venuecategory: 1 });
VenueSchema.index({ geometry: '2dsphere', Rating: -1 });
VenueSchema.index({ region: 1, isActive: 1 });
VenueSchema.index({ BillingCountry: 1, BillingCity: 1 });

// VIRTUAL FIELDS
VenueSchema.virtual('coordinates').get(function (this: IVenue) {
  return this.geometry ? this.geometry.coordinates : null;
});

VenueSchema.virtual('cuisineArray').get(function (this: IVenue) {
  return this.CuisineTags ? this.CuisineTags.split(/[|;,]/) : [];
});

VenueSchema.virtual('dietaryArray').get(function (this: IVenue) {
  return this.Dietarytags ? this.Dietarytags.split(/[|;,]/) : [];
});

VenueSchema.virtual('paymentArray').get(function (this: IVenue) {
  return this['Payment types'] ? this['Payment types'].split(/[|;,]/) : [];
});

// STATIC METHODS
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
  if (filters.wifi) query.PubWifi = 1;
  if (filters.alcohol) query.Alcoholserved = 1;
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
        categories: { $addToSet: { id: '$venuecategory', name: '$venuecategorydisplayname' } },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

// INSTANCE METHODS
VenueSchema.methods.getDistance = function (this: IVenue, longitude: number, latitude: number): number | null {
  if (!this.geometry || !this.geometry.coordinates) return null;

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
  return (
    this.PubWifi === 1 &&
    this.ChargingPorts !== undefined &&
    this.ChargingPorts > 0 &&
    this.Nomadfriendlyscore !== undefined &&
    this.Nomadfriendlyscore >= 3
  );
};

VenueSchema.methods.isFamilyFriendly = function (this: IVenue): boolean {
  return (
    this.Kidsfriendlybadge === 'Allowed' ||
    (this.Familyfrienlinessscore !== undefined && this.Familyfrienlinessscore >= 3)
  );
};

// PRE-SAVE MIDDLEWARE
VenueSchema.pre<IVenue>('save', function (next) {
  // Auto-populate geometry from lat/lng if provided
  if (this.LatitudeMapslytextsingleLine && this.LongitudeMapslytextsingleLine) {
    if (!this.geometry) {
      this.geometry = {
        type: 'Point',
        coordinates: [this.LongitudeMapslytextsingleLine, this.LatitudeMapslytextsingleLine],
      };
    } else {
      this.geometry.coordinates = [this.LongitudeMapslytextsingleLine, this.LatitudeMapslytextsingleLine];
    }
  }
  next();
});

export default mongoose.model<IVenue, IVenueModel>('Venue', VenueSchema);
