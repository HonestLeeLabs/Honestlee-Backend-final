import mongoose, { Schema, Document } from 'mongoose';
import { SyncStatus } from './ZohoTypes';

// Interface for venue owner/user information
interface VenueOwner {
  name: string;
  id: string;
  email?: string;
}

// Interface for address information
interface VenueAddress {
  street?: string;
  city?: string;
  state?: string;
  code?: string;
  country?: string;
}

// Interface for venue business details
interface VenueDetails {
  description?: string;
  industry?: string;
  annual_revenue?: number;
  rating?: string;
  employees?: number;
}

// 🆕 Interface for custom venue-specific fields
interface VenueCustomFields {
  // Venue amenities
  ac_fan?: string | boolean;
  charging_ports?: string | boolean;
  pub_wifi?: string | boolean;
  
  // Internet connectivity
  wifi_ssid?: string;
  wifi_password?: string;
  dl_speed_mbps?: number;
  ul_speed_mbps?: number;
  
  // Location data
  latitude?: number;
  longitude?: number;
  distance_from_center?: number;
  place_id?: string;
  
  // Venue details
  opening_hours?: string;
  noise_level?: string;
  payment_options?: string;
  
  // Ratings and photos
  price_level?: number;
  ratings_count?: number;
  photo_count?: number;
  photo_ref?: string;
  
  // Additional fields
  account_image?: string;
  connected_to?: string;
  wifi_display_method?: string;
  charging_ports_photo?: string;
  
  // Extended amenities
  seating_capacity?: number;
  private_rooms?: boolean;
  meeting_rooms?: boolean;
  presentation_equipment?: boolean;
  kitchen_access?: boolean;
  coffee_available?: boolean;
  food_options?: string;
  alcohol_served?: boolean;
  
  // Tech amenities
  power_outlets?: number;
  charging_stations?: number;
  computer_access?: boolean;
  printer_access?: boolean;
  projector_available?: boolean;
  audio_system?: boolean;
  video_conferencing?: boolean;
  
  // Accessibility
  accessibility_features?: string;
  parking_available?: boolean;
  public_transport_access?: string;
  floor_number?: number;
  building_name?: string;
  landmark?: string;
}

// Interface for timestamps
interface VenueTimestamps {
  created_time: Date;
  modified_time: Date;
  synced_at: Date;
}

// 🆕 COMPLETE IVenueCache Interface
export interface IVenueCache extends Document {
  // Core identifiers
  zoho_id: string;
  account_name: string;
  
  // Contact information
  phone?: string;
  website?: string;
  
  // Owner information
  owner?: VenueOwner;
  
  // Address information
  billing_address: VenueAddress;
  shipping_address?: VenueAddress;
  
  // Business details
  details: VenueDetails;
  
  // 🆕 Custom venue fields
  custom_fields: VenueCustomFields;
  
  // Timestamps
  timestamps: VenueTimestamps;
  
  // Sync information
  sync_status: SyncStatus;
  sync_error?: string;
  last_sync_attempt?: Date;
  
  // Raw Zoho data for debugging
  raw_data?: any;
  
  // Computed fields
  data_completeness?: number;
  field_count?: number;
}

// 🆕 Enhanced MongoDB Schema
const VenueCacheSchema = new Schema<IVenueCache>({
  // Core identifiers
  zoho_id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  account_name: {
    type: String,
    required: true,
    index: true
  },
  
  // Contact information
  phone: {
    type: String,
    sparse: true,
    index: true
  },
  website: {
    type: String,
    sparse: true
  },
  
  // Owner information
  owner: {
    name: { type: String },
    id: { type: String },
    email: { type: String }
  },
  
  // Address information
  billing_address: {
    street: { type: String },
    city: { 
      type: String, 
      index: true  // Index for city-based queries
    },
    state: { type: String },
    code: { type: String },
    country: { type: String }
  },
  shipping_address: {
    street: { type: String },
    city: { type: String },
    state: { type: String },
    code: { type: String },
    country: { type: String }
  },
  
  // Business details
  details: {
    description: { type: String },
    industry: { 
      type: String, 
      index: true  // Index for industry-based queries
    },
    annual_revenue: { type: Number },
    rating: { type: String },
    employees: { type: Number }
  },
  
  // 🆕 Custom venue fields
  custom_fields: {
    // Venue amenities
    ac_fan: { type: Schema.Types.Mixed },
    charging_ports: { type: Schema.Types.Mixed },
    pub_wifi: { type: Schema.Types.Mixed },
    
    // Internet connectivity
    wifi_ssid: { 
      type: String,
      index: true  // Index for WiFi searches
    },
    wifi_password: { type: String },
    dl_speed_mbps: { type: Number },
    ul_speed_mbps: { type: Number },
    
    // Location data
    latitude: { type: Number },
    longitude: { type: Number },
    distance_from_center: { type: Number },
    place_id: { 
      type: String,
      sparse: true,
      index: true
    },
    
    // Venue details
    opening_hours: { type: String },
    noise_level: { type: String },
    payment_options: { type: String },
    
    // Ratings and photos
    price_level: { type: Number },
    ratings_count: { type: Number },
    photo_count: { type: Number },
    photo_ref: { type: String },
    
    // Additional fields
    account_image: { type: String },
    connected_to: { type: String },
    wifi_display_method: { type: String },
    charging_ports_photo: { type: String },
    
    // Extended amenities
    seating_capacity: { type: Number },
    private_rooms: { type: Boolean },
    meeting_rooms: { type: Boolean },
    presentation_equipment: { type: Boolean },
    kitchen_access: { type: Boolean },
    coffee_available: { type: Boolean },
    food_options: { type: String },
    alcohol_served: { type: Boolean },
    
    // Tech amenities
    power_outlets: { type: Number },
    charging_stations: { type: Number },
    computer_access: { type: Boolean },
    printer_access: { type: Boolean },
    projector_available: { type: Boolean },
    audio_system: { type: Boolean },
    video_conferencing: { type: Boolean },
    
    // Accessibility
    accessibility_features: { type: String },
    parking_available: { type: Boolean },
    public_transport_access: { type: String },
    floor_number: { type: Number },
    building_name: { type: String },
    landmark: { type: String }
  },
  
  // Timestamps
  timestamps: {
    created_time: { 
      type: Date, 
      required: true 
    },
    modified_time: { 
      type: Date, 
      required: true,
      index: true  // Index for sorting by modification time
    },
    synced_at: { 
      type: Date, 
      required: true,
      index: true  // Index for sync tracking
    }
  },
  
  // Sync information
  sync_status: {
    type: String,
    enum: ['synced', 'pending', 'error', 'partial', 'stale'],
    default: 'pending',
    index: true  // Index for sync status queries
  },
  sync_error: { type: String },
  last_sync_attempt: { type: Date },
  
  // Raw Zoho data for debugging and future field discovery
  raw_data: { 
    type: Schema.Types.Mixed,
    select: false  // Don't include in queries by default (performance)
  },
  
  // Computed fields
  data_completeness: { 
    type: Number,
    min: 0,
    max: 100
  },
  field_count: { type: Number }
});

// 🆕 Enhanced Indexes for Performance
VenueCacheSchema.index({ 'billing_address.city': 1, 'details.industry': 1 });
VenueCacheSchema.index({ 'custom_fields.wifi_ssid': 1, 'custom_fields.charging_ports': 1 });
VenueCacheSchema.index({ 'timestamps.modified_time': -1 });
VenueCacheSchema.index({ sync_status: 1, 'timestamps.synced_at': -1 });

// 🆕 Middleware to calculate data completeness before saving
VenueCacheSchema.pre('save', function() {
  if (this.isNew || this.isModified()) {
    // Calculate data completeness percentage
    const allFields = [
      this.account_name,
      this.phone,
      this.website,
      this.billing_address?.city,
      this.billing_address?.state,
      this.billing_address?.country,
      this.details?.industry,
      this.details?.description,
      this.custom_fields?.wifi_ssid,
      this.custom_fields?.opening_hours,
      this.custom_fields?.payment_options,
      this.custom_fields?.latitude,
      this.custom_fields?.longitude
    ];
    
    const populatedFields = allFields.filter(field => 
      field !== null && field !== undefined && field !== ''
    ).length;
    
    this.data_completeness = Math.round((populatedFields / allFields.length) * 100);
    this.field_count = Object.keys(this.raw_data || {}).length;
  }
});

// 🆕 Virtual fields for computed properties
VenueCacheSchema.virtual('hasWifi').get(function() {
  return !!(this.custom_fields?.wifi_ssid);
});

VenueCacheSchema.virtual('hasLocation').get(function() {
  return !!(this.custom_fields?.latitude && this.custom_fields?.longitude);
});

VenueCacheSchema.virtual('hasCharging').get(function() {
  return this.custom_fields?.charging_ports === true;
});

// 🆕 Instance methods for data analysis
VenueCacheSchema.methods.getFieldAnalysis = function() {
  const rawData = this.raw_data || {};
  const allFields = Object.keys(rawData);
  const customFields = allFields.filter(field => 
    field.includes('HL_') || field.includes('Wifi') || field.includes('Payment') ||
    field.includes('Speed_MBPS') || field.includes('AC_') || field.includes('Charging')
  );
  const populatedFields = allFields.filter(field => {
    const value = rawData[field];
    return value !== null && value !== undefined && value !== '';
  });

  return {
    totalFields: allFields.length,
    customFields: customFields.length,
    populatedFields: populatedFields.length,
    completeness: allFields.length > 0 ? Math.round((populatedFields.length / allFields.length) * 100) : 0,
    customFieldNames: customFields,
    emptyFields: allFields.filter(field => {
      const value = rawData[field];
      return value === null || value === undefined || value === '';
    })
  };
};

// 🆕 Static methods for aggregate queries
VenueCacheSchema.statics.getVenueStats = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        withWifi: {
          $sum: {
            $cond: [
              { $ne: ['$custom_fields.wifi_ssid', null] },
              1,
              0
            ]
          }
        },
        withLocation: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$custom_fields.latitude', null] },
                  { $ne: ['$custom_fields.longitude', null] }
                ]
              },
              1,
              0
            ]
          }
        },
        withCharging: {
          $sum: {
            $cond: [
              { $eq: ['$custom_fields.charging_ports', true] },
              1,
              0
            ]
          }
        },
        avgCompleteness: { $avg: '$data_completeness' },
        avgFieldCount: { $avg: '$field_count' }
      }
    }
  ]);

  return stats[0] || {
    total: 0,
    withWifi: 0,
    withLocation: 0,
    withCharging: 0,
    avgCompleteness: 0,
    avgFieldCount: 0
  };
};

// Enable virtuals in JSON output
VenueCacheSchema.set('toJSON', { virtuals: true });
VenueCacheSchema.set('toObject', { virtuals: true });

export default mongoose.model<IVenueCache>('VenueCache', VenueCacheSchema);
