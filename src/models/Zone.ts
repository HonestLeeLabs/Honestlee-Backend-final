import mongoose, { Schema, Document } from "mongoose";

export interface IZone extends Document {
  zoneId: string;
  venueId?: mongoose.Types.ObjectId;
  tempVenueId?: string;
  name: string;
  capacityMin?: number;
  capacityMax?: number;
  numTables?: number;
  numSeats?: number;
  numChargingPorts?: number;
  isIndoor?: boolean;
  isOutdoor?: boolean;
  climateControl?: 'ac' | 'fan' | 'none';
  noiseLevel?: 'quiet' | 'lowmusic' | 'moderatemusic' | 'loudmusic' | 'streetnoise' | 'hightraffic';
  view?: 'mountainview' | 'riverview' | 'seaview' | 'oceanview' | 'lakeview' | 
        'gardenview' | 'poolview' | 'streetview' | 'cityview' | 'skylineview' | 
        'courtyardview' | 'parkview' | 'beachview' | 'forestview' | 'noview' | 'interiorfacing';
  description?: string;
  
  // ✅ NEW: Seating fields
  seatingType?: 'diningchairs' | 'longbenches' | 'lowseating' | 'plasticchairs' | 
                'barstools' | 'sofas' | 'beanbags' | 'floorseating' | 'standingonly' | 'none';
  seatingComfort?: 'excellent' | 'good' | 'fair' | 'poor' | 'notsuitable';
  
  // ✅ NEW: Lighting fields
  lightingType?: 'natural' | 'indoor' | 'mixed';
  lightingBrightness?: 'verybright' | 'bright' | 'moderate' | 'dim' | 'dark';
  
  zonePhotoUrl?: string;
  zonePhotoS3Key?: string;
  zonePhotoUploadedAt?: Date;
  colorToken: string;
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ZoneSchema = new Schema<IZone>(
  {
    zoneId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    venueId: {
      type: Schema.Types.ObjectId,
      ref: "Venue",
      sparse: true,
      index: true,
    },
    tempVenueId: {
      type: String,
      sparse: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      maxlength: 18,
    },
    capacityMin: {
      type: Number,
      min: 0,
    },
    capacityMax: {
      type: Number,
      min: 0,
    },
    numTables: {
      type: Number,
      min: 0,
    },
    numSeats: {
      type: Number,
      min: 0,
    },
    numChargingPorts: {
      type: Number,
      min: 0,
    },
    isIndoor: {
      type: Boolean,
      default: false,
    },
    isOutdoor: {
      type: Boolean,
      default: false,
    },
    climateControl: {
      type: String,
      enum: ['ac', 'fan', 'none'],
      default: 'none',
    },
    noiseLevel: {
      type: String,
      enum: ['quiet', 'lowmusic', 'moderatemusic', 'loudmusic', 'streetnoise', 'hightraffic'],
    },
    view: {
      type: String,
      enum: [
        'mountainview',
        'riverview',
        'seaview',
        'oceanview',
        'lakeview',
        'gardenview',
        'poolview',
        'streetview',
        'cityview',
        'skylineview',
        'courtyardview',
        'parkview',
        'beachview',
        'forestview',
        'noview',
        'interiorfacing'
      ],
    },
    description: {
      type: String,
      maxlength: 500,
    },
    
    // ✅ NEW: Seating fields
    seatingType: {
      type: String,
      enum: [
        'diningchairs',
        'longbenches',
        'lowseating',
        'plasticchairs',
        'barstools',
        'sofas',
        'beanbags',
        'floorseating',
        'standingonly',
        'none'
      ],
    },
    seatingComfort: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor', 'notsuitable'],
    },
    
    // ✅ NEW: Lighting fields
    lightingType: {
      type: String,
      enum: ['natural', 'indoor', 'mixed'],
    },
    lightingBrightness: {
      type: String,
      enum: ['verybright', 'bright', 'moderate', 'dim', 'dark'],
    },
    
    zonePhotoUrl: {
      type: String,
    },
    zonePhotoS3Key: {
      type: String,
    },
    zonePhotoUploadedAt: {
      type: Date,
    },
    colorToken: {
      type: String,
      required: true,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "zones",
  }
);

// Indexes
ZoneSchema.index({ venueId: 1, isActive: 1 });
ZoneSchema.index({ tempVenueId: 1, isActive: 1 });

// Validation
ZoneSchema.pre("validate", function (next) {
  if (!this.venueId && !this.tempVenueId) {
    next(new Error("Either venueId or tempVenueId must be provided"));
  } else {
    next();
  }
});

export default mongoose.model<IZone>("Zone", ZoneSchema);
