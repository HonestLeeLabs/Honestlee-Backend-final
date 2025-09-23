import mongoose, { Schema, Document } from 'mongoose';

export interface IVenue extends Document {
  name: string;
  category: string;
  subcategory?: string;
  description?: string;
  address?: string;
  location: {
    type: 'Point',
    coordinates: [number, number]  // [longitude, latitude]
  };
  phone?: string;
  website?: string;
  email?: string;
  hours?: {
    monday?: string;
    tuesday?: string;
    wednesday?: string;
    thursday?: string;
    friday?: string;
    saturday?: string;
    sunday?: string;
  };
  images?: string[];  // Array of image URLs
  priceRange?: 'Budget' | 'Mid-range' | 'Expensive' | 'Very Expensive';
  averageRating?: number;
  totalReviews?: number;
  amenities?: string[];  // WiFi, Parking, AC, etc.
  cuisineType?: string[];  // For restaurants
  paymentMethods?: string[];  // Cash, Card, UPI, etc.
  capacity?: number;
  hasWifi?: boolean;
  wifiQuality?: 'Poor' | 'Fair' | 'Good' | 'Excellent';
  accessibility?: {
    wheelchairAccessible?: boolean;
    hasElevator?: boolean;
    braileMenus?: boolean;
  };
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
  };
  tags?: string[];
  isVerified?: boolean;
  isActive?: boolean;
  ownerId?: mongoose.Schema.Types.ObjectId;  // Reference to User who owns this venue
  createdAt: Date;
  updatedAt: Date;
}

const VenueSchema = new Schema<IVenue>({
  name: { type: String, required: true },
  category: { type: String, required: true },
  subcategory: { type: String },
  description: { type: String, maxlength: 1000 },
  address: { type: String },
  location: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true } // [lng, lat]
  },
  phone: { type: String },
  website: { type: String },
  email: { type: String },
  hours: {
    monday: { type: String },
    tuesday: { type: String },
    wednesday: { type: String },
    thursday: { type: String },
    friday: { type: String },
    saturday: { type: String },
    sunday: { type: String }
  },
  images: [{ type: String }],
  priceRange: { 
    type: String, 
    enum: ['Budget', 'Mid-range', 'Expensive', 'Very Expensive'] 
  },
  averageRating: { type: Number, default: 0, min: 0, max: 5 },
  totalReviews: { type: Number, default: 0 },
  amenities: [{ type: String }],
  cuisineType: [{ type: String }],
  paymentMethods: [{ type: String }],
  capacity: { type: Number },
  hasWifi: { type: Boolean, default: false },
  wifiQuality: { 
    type: String, 
    enum: ['Poor', 'Fair', 'Good', 'Excellent'] 
  },
  accessibility: {
    wheelchairAccessible: { type: Boolean, default: false },
    hasElevator: { type: Boolean, default: false },
    braileMenus: { type: Boolean, default: false }
  },
  socialMedia: {
    instagram: { type: String },
    facebook: { type: String },
    twitter: { type: String }
  },
  tags: [{ type: String }],
  isVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  ownerId: { type: Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

VenueSchema.index({ location: '2dsphere' });
VenueSchema.index({ category: 1 });
VenueSchema.index({ averageRating: -1 });
VenueSchema.index({ name: 'text', description: 'text' });

export default mongoose.model<IVenue>('Venue', VenueSchema);
