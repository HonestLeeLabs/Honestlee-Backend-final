import mongoose, { Schema, Document } from 'mongoose';

export interface IVenueCache extends Document {
  zoho_id: string;
  account_name: string;
  phone?: string;
  website?: string;
  owner?: {
    name: string;
    id: string;
    email?: string;
  };
  billing_address: {
    street?: string;
    city?: string;
    state?: string;
    code?: string;
    country?: string;
  };
  details: {
    description?: string;
    industry?: string;
    annual_revenue?: number;
    rating?: string;
    employees?: number;
  };
  timestamps: {
    created_time: Date;
    modified_time: Date;
    synced_at: Date;
  };
  sync_status: 'synced' | 'pending' | 'error';
  raw_data: any; // Store full Zoho response for backup
}

const VenueCacheSchema: Schema = new Schema({
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
  phone: { 
    type: String,
    index: true 
  },
  website: String,
  owner: {
    name: String,
    id: String,
    email: String
  },
  billing_address: {
    street: String,
    city: { type: String, index: true },
    state: { type: String, index: true },
    code: String,
    country: { type: String, index: true }
  },
  details: {
    description: String,
    industry: { type: String, index: true },
    annual_revenue: Number,
    rating: String,
    employees: Number
  },
  timestamps: {
    created_time: { type: Date, required: true },
    modified_time: { type: Date, required: true, index: true },
    synced_at: { type: Date, default: Date.now, index: true }
  },
  sync_status: { 
    type: String, 
    enum: ['synced', 'pending', 'error'], 
    default: 'synced',
    index: true 
  },
  raw_data: Schema.Types.Mixed
}, {
  timestamps: true,
  collection: 'venue_cache'
});

// Compound indexes for common queries
VenueCacheSchema.index({ 'billing_address.city': 1, 'details.industry': 1 });
VenueCacheSchema.index({ 'timestamps.modified_time': -1 });
VenueCacheSchema.index({ sync_status: 1, 'timestamps.synced_at': 1 });

export default mongoose.model<IVenueCache>('VenueCache', VenueCacheSchema);
