import mongoose, { Schema, Document, Model } from 'mongoose';

// Define the interface for the document
export interface IVenueDubai extends Document {
  // === CORE IDENTIFIERS ===
  Dubai_id: string;
  Account_Name: string;

  // === GEOSPATIAL DATA ===
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude]
  };
  Latitude_Mapsly_text_singleLine?: number;
  Longitude_Mapsly_text_singleLine?: number;

  // === ADDRESS INFORMATION ===
  Billing_Street?: string;
  Billing_City?: string;
  Billing_State?: string;
  Billing_District?: string;

  // === VENUE CLASSIFICATION ===
  venue_type?: string;
  venue_type_display?: string;
  venue_category?: string;
  venue_category_display?: string;

  // === RATINGS & SCORES ===
  Rating?: number;
  Nomad_friendly_score?: number;
  Family_frienliness_score?: number;

  // === PRICING INFORMATION ===
  HL_Price_Level?: number;
  Budget_Friendly?: string;
  Coffee_price_range?: string;
  Entrance_Fee?: string;

  // === OPERATING HOURS & MEAL SERVICE ===
  HL_Opening_Hours_Text?: string;
  Open_Late?: number;
  Breakfast_offered?: number;
  Brunch_offered?: number;
  Dinner_offered?: number;

  // === FOOD & BEVERAGE ===
  Cuisine_Tags?: string;
  Dietary_tags?: string;
  Healthy_food_level?: string;
  'Veg_only '?: number;
  Alcohol_served?: number;
  Type_Of_Coffee?: string;

  // === CONNECTIVITY & WIFI ===
  Pub_Wifi?: number;
  Wifi_SSID?: string;
  Wifi_bage?: string;
  DL_SPeed_MBPS?: number;
  UL_SPeed_MBPS?: number;

  // === POWER & CHARGING ===
  Charging_Ports?: number;
  Power_outlet_density?: string;
  Power_backup?: number;

  // === TV & ENTERTAINMENT ===
  Has_TV_Display?: number;
  Number_of_TVs?: number;
  Shows_what_on_TV?: string;

  // === POLICIES ===
  Pet_Policy?: string;
  'Smoking Policy '?: string;
  Kids_friendly_badge?: string;
  Group_policy?: string;
  Takes_bookings?: number;

  // === ATMOSPHERE & ENVIRONMENT ===
  View?: string;
  Noise_Level?: string;
  Staff_friedliness_bage?: string;
  HL_zoho_AC_Fan?: string;

  // === PHYSICAL FEATURES ===
  Outdoor_seating?: number;
  Offers_water_refills?: number;
  Day_pass_club?: number;
  Hotel_pool_access?: number;

  // === CONTACT & LOGISTICS ===
  parking_options?: string;
  Website?: string;
  Int_phone_google_mapsly?: string;
  'Payment types'?: string;

  // === METADATA ===
  createdAt: Date;
  updatedAt: Date;

  // === INSTANCE METHODS ===
  getDistance(longitude: number, latitude: number): number | null;
  isNomadFriendly(): boolean;
  isFamilyFriendly(): boolean;
}

// Define the static methods interface
export interface IVenueDubaiModel extends Model<IVenueDubai> {
  findNearby(longitude: number, latitude: number, maxDistance?: number): Promise<IVenueDubai[]>;
  findByFilters(filters?: any): Promise<IVenueDubai[]>;
}

// Define the GeoJSON Point schema properly
const pointSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    required: true,
    default: 'Point'
  },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function(coords: number[]) {
        return coords.length === 2 && 
               coords[0] >= -180 && coords[0] <= 180 && // longitude
               coords[1] >= -90 && coords[1] <= 90;     // latitude
      },
      message: 'Invalid coordinates format [longitude, latitude]'
    }
  }
}, { _id: false });

// Create the main venue schema
const venueSchema = new mongoose.Schema({
  // === CORE IDENTIFIERS ===
  Dubai_id: { 
    type: String, 
    required: true, 
    unique: true,
    index: true
  },
  Account_Name: { 
    type: String, 
    required: true,
    index: true
  },

  // === GEOSPATIAL DATA ===
  geometry: {
    type: pointSchema,
    required: true,
    index: '2dsphere'
  },
  Latitude_Mapsly_text_singleLine: { 
    type: Number, 
    min: -90, 
    max: 90 
  },
  Longitude_Mapsly_text_singleLine: { 
    type: Number, 
    min: -180, 
    max: 180 
  },

  // === ADDRESS INFORMATION ===
  Billing_Street: String,
  Billing_City: { 
    type: String,
    index: true
  },
  Billing_State: String,
  Billing_District: { 
    type: String,
    index: true
  },

  // === VENUE CLASSIFICATION ===
  venue_type: { 
    type: String,
    index: true
  },
  venue_type_display: String,
  venue_category: { 
    type: String,
    index: true
  },
  venue_category_display: String,

  // === RATINGS & SCORES ===
  Rating: { 
    type: Number, 
    min: 0, 
    max: 5,
    index: -1
  },
  Nomad_friendly_score: { 
    type: Number, 
    min: 1, 
    max: 5 
  },
  Family_frienliness_score: { 
    type: Number, 
    min: 1, 
    max: 5 
  },

  // === PRICING INFORMATION ===
  HL_Price_Level: { 
    type: Number, 
    min: 1, 
    max: 5 
  },
  Budget_Friendly: { 
    type: String, 
    enum: ['$', '$$', '$$$'],
    index: true
  },
  Coffee_price_range: String,
  Entrance_Fee: String,

  // === OPERATING HOURS & MEAL SERVICE ===
  HL_Opening_Hours_Text: String,
  Open_Late: { 
    type: Number, 
    enum: [0, 1],
    index: true
  },
  Breakfast_offered: { 
    type: Number, 
    enum: [0, 1] 
  },
  Brunch_offered: { 
    type: Number, 
    enum: [0, 1] 
  },
  Dinner_offered: { 
    type: Number, 
    enum: [0, 1] 
  },

  // === FOOD & BEVERAGE ===
  Cuisine_Tags: String,
  Dietary_tags: String, 
  Healthy_food_level: { 
    type: String, 
    enum: ['Low', 'Medium', 'High'] 
  },
  'Veg_only ': { 
    type: Number, 
    enum: [0, 1] 
  },
  Alcohol_served: { 
    type: Number, 
    enum: [0, 1],
    index: true
  },
  Type_Of_Coffee: String,

  // === CONNECTIVITY & WIFI ===
  Pub_Wifi: { 
    type: Number, 
    enum: [0, 1],
    index: true
  },
  Wifi_SSID: String,
  Wifi_bage: { 
    type: String, 
    enum: ['Verified', 'Unverified'] 
  },
  DL_SPeed_MBPS: { 
    type: Number, 
    min: 0 
  },
  UL_SPeed_MBPS: { 
    type: Number, 
    min: 0 
  },

  // === POWER & CHARGING ===
  Charging_Ports: { 
    type: Number, 
    min: 0 
  },
  Power_outlet_density: { 
    type: String, 
    enum: ['Low', 'Medium', 'High'] 
  },
  Power_backup: { 
    type: Number, 
    enum: [0, 1] 
  },

  // === TV & ENTERTAINMENT ===
  Has_TV_Display: { 
    type: Number, 
    enum: [0, 1] 
  },
  Number_of_TVs: { 
    type: Number, 
    min: 0 
  },
  Shows_what_on_TV: String,

  // === POLICIES ===
  Pet_Policy: String,
  'Smoking Policy ': String,
  Kids_friendly_badge: { 
    type: String, 
    enum: ['Allowed', 'Limited', 'Not Ideal'] 
  },
  Group_policy: String,
  Takes_bookings: { 
    type: Number, 
    enum: [0, 1] 
  },

  // === ATMOSPHERE & ENVIRONMENT ===
  View: String,
  Noise_Level: { 
    type: String, 
    enum: ['Moderate', 'Lively', 'Quiet'] 
  },
  Staff_friedliness_bage: { 
    type: String, 
    enum: ['Very Friendly', 'Friendly', 'Neutral'] 
  },
  HL_zoho_AC_Fan: { 
    type: String, 
    enum: ['AC', 'Fan'] 
  },

  // === PHYSICAL FEATURES ===
  Outdoor_seating: { 
    type: Number, 
    enum: [0, 1] 
  },
  Offers_water_refills: { 
    type: Number, 
    enum: [0, 1] 
  },
  Day_pass_club: { 
    type: Number, 
    enum: [0, 1] 
  },
  Hotel_pool_access: { 
    type: Number, 
    enum: [0, 1] 
  },

  // === CONTACT & LOGISTICS ===
  parking_options: String,
  Website: String,
  Int_phone_google_mapsly: String,
  'Payment types': String
}, {
  timestamps: true,
  collection: 'venuesDubai'
});

// === COMPOUND INDEXES FOR COMMON QUERIES ===
venueSchema.index({ venue_type: 1, Billing_District: 1 });
venueSchema.index({ Budget_Friendly: 1, Rating: -1 });
venueSchema.index({ Pub_Wifi: 1, Nomad_friendly_score: -1 });
venueSchema.index({ Alcohol_served: 1, venue_category: 1 });
venueSchema.index({ 'geometry': '2dsphere', Rating: -1 });

// === VIRTUAL FIELDS ===
venueSchema.virtual('coordinates').get(function(this: IVenueDubai) {
  return this.geometry ? this.geometry.coordinates : null;
});

venueSchema.virtual('cuisineArray').get(function(this: IVenueDubai) {
  return this.Cuisine_Tags ? this.Cuisine_Tags.split(';') : [];
});

venueSchema.virtual('dietaryArray').get(function(this: IVenueDubai) {
  return this.Dietary_tags ? this.Dietary_tags.split(';') : [];
});

venueSchema.virtual('paymentArray').get(function(this: IVenueDubai) {
  return this['Payment types'] ? this['Payment types'].split(';') : [];
});

// === STATIC METHODS ===
venueSchema.statics.findNearby = function(longitude: number, latitude: number, maxDistance: number = 5000) {
  return this.find({
    geometry: {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    }
  });
};

venueSchema.statics.findByFilters = function(filters: any = {}) {
  const query: any = {};

  if (filters.venueType) query.venue_type = filters.venueType;
  if (filters.district) query.Billing_District = filters.district;
  if (filters.budget) query.Budget_Friendly = filters.budget;
  if (filters.wifi) query.Pub_Wifi = 1;
  if (filters.alcohol) query.Alcohol_served = 1;
  if (filters.minRating) query.Rating = { $gte: filters.minRating };

  return this.find(query).sort({ Rating: -1 });
};

// === INSTANCE METHODS ===
venueSchema.methods.getDistance = function(this: IVenueDubai, longitude: number, latitude: number): number | null {
  if (!this.geometry || !this.geometry.coordinates) return null;

  const [venueLng, venueLat] = this.geometry.coordinates;
  const R = 6371; // Earth's radius in kilometers

  const dLat = (venueLat - latitude) * Math.PI / 180;
  const dLng = (venueLng - longitude) * Math.PI / 180;

  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(latitude * Math.PI / 180) * Math.cos(venueLat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in kilometers
};

venueSchema.methods.isNomadFriendly = function(this: IVenueDubai): boolean {
  return this.Pub_Wifi === 1 && 
         this.Charging_Ports !== undefined && this.Charging_Ports > 0 && 
         this.Nomad_friendly_score !== undefined && this.Nomad_friendly_score >= 3;
};

venueSchema.methods.isFamilyFriendly = function(this: IVenueDubai): boolean {
  return this.Kids_friendly_badge === 'Allowed' &&
         this.Family_frienliness_score !== undefined && this.Family_frienliness_score >= 3;
};

// === PRE-SAVE MIDDLEWARE ===
venueSchema.pre<IVenueDubai>('save', function(next) {
  // Ensure coordinates are properly set in both places
  if (this.Latitude_Mapsly_text_singleLine && this.Longitude_Mapsly_text_singleLine) {
    if (!this.geometry) {
      this.geometry = { 
        type: 'Point', 
        coordinates: [
          this.Longitude_Mapsly_text_singleLine, 
          this.Latitude_Mapsly_text_singleLine
        ]
      };
    } else {
      this.geometry.coordinates = [
        this.Longitude_Mapsly_text_singleLine, 
        this.Latitude_Mapsly_text_singleLine
      ];
    }
  }
  next();
});

export default mongoose.model<IVenueDubai, IVenueDubaiModel>('VenueDubai', venueSchema);
