import mongoose, { Schema, Document, Model } from 'mongoose';

// Define the interface for the document
export interface IVenueDubai extends Document {
  // CORE IDENTIFIERS
  Dubaiid: string;
  AccountName: string;

  // TOP-LEVEL CATEGORY (NEW)
  groupid?: string; // e.g., 'gc_accommodation_travel', 'gc_food_drink', 'gc_fitness_wellness'
  groupiddisplayname?: string; // e.g., 'Accommodation Travel', 'Food Drink', 'Fitness Wellness'

  // GEOSPATIAL DATA
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  LatitudeMapslytextsingleLine?: number;
  LongitudeMapslytextsingleLine?: number;

  // ADDRESS INFORMATION
  BillingStreet?: string;
  BillingCity?: string;
  BillingState?: string;
  BillingDistrict?: string;

  // VENUE CLASSIFICATION (HIERARCHICAL)
  venuetype?: string; // e.g., 'vt_hotel', 'vt_restaurant', 'vt_gym'
  venuetypedisplay?: string; // e.g., 'Hotel', 'Restaurant', 'Gym'
  venuecategory?: string; // e.g., 'vc_hotel', 'vc_restaurant', 'vc_gym'
  venuecategorydisplayname?: string; // e.g., 'Hotel', 'Restaurant', 'Gym'

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
  'Payment types'?: string;

  // METADATA
  createdAt: Date;
  updatedAt: Date;

  // INSTANCE METHODS
  getDistance(longitude: number, latitude: number): number | null;
  isNomadFriendly(): boolean;
  isFamilyFriendly(): boolean;
}

// Define the static methods interface
export interface IVenueDubaiModel extends Model<IVenueDubai> {
  findNearby(longitude: number, latitude: number, maxDistance?: number): Promise<IVenueDubai[]>;
  findByFilters(filters?: any): Promise<IVenueDubai[]>;
  findByGroup(groupId: string): Promise<IVenueDubai[]>;
  findByCategory(categoryId: string): Promise<IVenueDubai[]>;
  getGroupStats(): Promise<any>;
}

// Define the GeoJSON Point schema properly
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
            coords[0] <= 180 && // longitude
            coords[1] >= -90 &&
            coords[1] <= 90 // latitude
          );
        },
        message: 'Invalid coordinates format: [longitude, latitude]',
      },
    },
  },
  { _id: false }
);

// Create the main venue schema
const venueSchema = new mongoose.Schema<IVenueDubai>(
  {
    // CORE IDENTIFIERS
    Dubaiid: { type: String, required: true, unique: true, index: true },
    AccountName: { type: String, required: true, index: true },

    // TOP-LEVEL CATEGORY (NEW)
    groupid: { type: String, index: true }, // e.g., 'gc_food_drink'
    groupiddisplayname: String, // e.g., 'Food Drink'

    // GEOSPATIAL DATA
    geometry: { type: pointSchema, required: true, index: '2dsphere' },
    LatitudeMapslytextsingleLine: { type: Number, min: -90, max: 90 },
    LongitudeMapslytextsingleLine: { type: Number, min: -180, max: 180 },

    // ADDRESS INFORMATION
    BillingStreet: String,
    BillingCity: { type: String, index: true },
    BillingState: String,
    BillingDistrict: { type: String, index: true },

    // VENUE CLASSIFICATION (HIERARCHICAL)
    venuetype: { type: String, index: true }, // e.g., 'vt_restaurant'
    venuetypedisplay: String, // e.g., 'Restaurant'
    venuecategory: { type: String, index: true }, // e.g., 'vc_restaurant'
    venuecategorydisplayname: String, // e.g., 'Restaurant'

    // RATINGS & SCORES
    Rating: { type: Number, min: 0, max: 5, index: -1 },
    Nomadfriendlyscore: { type: Number, min: 1, max: 5 },
    Familyfrienlinessscore: { type: Number, min: 1, max: 5 },

    // PRICING INFORMATION
    HLPriceLevel: { type: Number, min: 1, max: 5 },
    BudgetFriendly: { type: String, enum: ['', '$', '$$', '$$$'], index: true },
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
    Healthyfoodlevel: { type: String, enum: ['Low', 'Medium', 'High'] },
    Vegonly: { type: Number, enum: [0, 1] },
    Alcoholserved: { type: Number, enum: [0, 1], index: true },
    TypeOfCoffee: String,

    // CONNECTIVITY & WIFI
    PubWifi: { type: Number, enum: [0, 1], index: true },
    WifiSSID: String,
    Wifibage: { type: String, enum: ['Verified', 'Unverified'] },
    DLSPeedMBPS: { type: Number, min: 0 },
    ULSPeedMBPS: { type: Number, min: 0 },

    // POWER & CHARGING
    ChargingPorts: { type: Number, min: 0 },
    Poweroutletdensity: { type: String, enum: ['Low', 'Medium', 'High'] },
    Powerbackup: { type: Number, enum: [0, 1] },

    // TV & ENTERTAINMENT
    HasTVDisplay: { type: Number, enum: [0, 1] },
    NumberofTVs: { type: Number, min: 0 },
    ShowswhatonTV: String,

    // POLICIES
    PetPolicy: String,
    'Smoking Policy': String,
    Kidsfriendlybadge: { type: String, enum: ['Allowed', 'Limited', 'Not Ideal'] },
    Grouppolicy: String,
    Takesbookings: { type: Number, enum: [0, 1] },

    // ATMOSPHERE & ENVIRONMENT
    View: String,
    NoiseLevel: { type: String, enum: ['Moderate', 'Lively', 'Quiet'] },
    Stafffriedlinessbage: { type: String, enum: ['Very Friendly', 'Friendly', 'Neutral'] },
    HLzohoACFan: { type: String, enum: ['AC', 'Fan'] },

    // PHYSICAL FEATURES
    Outdoorseating: { type: Number, enum: [0, 1] },
    Offerswaterrefills: { type: Number, enum: [0, 1] },
    Daypassclub: { type: Number, enum: [0, 1] },
    Hotelpoolaccess: { type: Number, enum: [0, 1] },

    // CONTACT & LOGISTICS
    parkingoptions: String,
    Website: String,
    Intphonegooglemapsly: String,
    'Payment types': String,
  },
  { timestamps: true, collection: 'venuesDubai' }
);

// COMPOUND INDEXES FOR COMMON QUERIES
venueSchema.index({ groupid: 1, venuecategory: 1 }); // NEW: Top-level category filtering
venueSchema.index({ groupid: 1, Rating: -1 }); // NEW: Best rated by group
venueSchema.index({ venuetype: 1, BillingDistrict: 1 });
venueSchema.index({ BudgetFriendly: 1, Rating: -1 });
venueSchema.index({ PubWifi: 1, Nomadfriendlyscore: -1 });
venueSchema.index({ Alcoholserved: 1, venuecategory: 1 });
venueSchema.index({ 'geometry': '2dsphere', Rating: -1 });

// VIRTUAL FIELDS
venueSchema.virtual('coordinates').get(function (this: IVenueDubai) {
  return this.geometry ? this.geometry.coordinates : null;
});

venueSchema.virtual('cuisineArray').get(function (this: IVenueDubai) {
  return this.CuisineTags ? this.CuisineTags.split('|') : [];
});

venueSchema.virtual('dietaryArray').get(function (this: IVenueDubai) {
  return this.Dietarytags ? this.Dietarytags.split('|') : [];
});

venueSchema.virtual('paymentArray').get(function (this: IVenueDubai) {
  return this['Payment types'] ? this['Payment types'].split('|') : [];
});

// STATIC METHODS
venueSchema.statics.findNearby = function (longitude: number, latitude: number, maxDistance: number = 5000) {
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
  });
};

venueSchema.statics.findByFilters = function (filters: any) {
  const query: any = {};

  if (filters.venueType) query.venuetype = filters.venueType;
  if (filters.district) query.BillingDistrict = filters.district;
  if (filters.budget) query.BudgetFriendly = filters.budget;
  if (filters.wifi) query.PubWifi = 1;
  if (filters.alcohol) query.Alcoholserved = 1;
  if (filters.minRating) query.Rating = { $gte: filters.minRating };

  return this.find(query).sort({ Rating: -1 });
};

// NEW: Find by top-level group
venueSchema.statics.findByGroup = function (groupId: string) {
  return this.find({ groupid: groupId }).sort({ Rating: -1 });
};

// NEW: Find by category
venueSchema.statics.findByCategory = function (categoryId: string) {
  return this.find({ venuecategory: categoryId }).sort({ Rating: -1 });
};

// NEW: Get statistics by group
venueSchema.statics.getGroupStats = async function () {
  return this.aggregate([
    {
      $group: {
        _id: '$groupid',
        displayName: { $first: '$groupiddisplayname' },
        count: { $sum: 1 },
        avgRating: { $avg: '$Rating' },
        categories: { $addToSet: '$venuecategory' },
      },
    },
    { $sort: { count: -1 } },
  ]);
};

// INSTANCE METHODS
venueSchema.methods.getDistance = function (this: IVenueDubai, longitude: number, latitude: number): number | null {
  if (!this.geometry || !this.geometry.coordinates) return null;

  const [venueLng, venueLat] = this.geometry.coordinates;
  const R = 6371; // Earth's radius in kilometers

  const dLat = ((venueLat - latitude) * Math.PI) / 180;
  const dLng = ((venueLng - longitude) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((latitude * Math.PI) / 180) *
      Math.cos((venueLat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in kilometers
};

venueSchema.methods.isNomadFriendly = function (this: IVenueDubai): boolean {
  return (
    this.PubWifi === 1 &&
    this.ChargingPorts !== undefined &&
    this.ChargingPorts > 0 &&
    this.Nomadfriendlyscore !== undefined &&
    this.Nomadfriendlyscore >= 3
  );
};

venueSchema.methods.isFamilyFriendly = function (this: IVenueDubai): boolean {
  return (
    this.Kidsfriendlybadge === 'Allowed' ||
    (this.Familyfrienlinessscore !== undefined && this.Familyfrienlinessscore >= 3)
  );
};

// PRE-SAVE MIDDLEWARE
venueSchema.pre<IVenueDubai>('save', function (next) {
  // Ensure coordinates are properly set in both places
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

export default mongoose.model<IVenueDubai, IVenueDubaiModel>('VenueDubai', venueSchema);
