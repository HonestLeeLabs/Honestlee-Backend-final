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
  // Existing fields
  isIndoor?: boolean;
  isOutdoor?: boolean;
  climateControl?: 'ac' | 'fan' | 'none';
  // ✅ FIXED: Changed from snake_case to camelCase
  noiseLevel?: 'quiet' | 'lowmusic' | 'moderatemusic' | 'loudmusic' | 'streetnoise' | 'hightraffic';
  // ✅ FIXED: Changed from snake_case to camelCase
  view?: 'mountainview' | 'riverview' | 'seaview' | 'oceanview' | 'lakeview' | 
        'gardenview' | 'poolview' | 'streetview' | 'cityview' | 'skylineview' | 
        'courtyardview' | 'parkview' | 'beachview' | 'forestview' | 'noview' | 'interiorfacing';
  description?: string;
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
    // Existing fields
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
    // ✅ FIXED: Changed from snake_case to camelCase (no underscores)
    noiseLevel: {
      type: String,
      enum: ['quiet', 'lowmusic', 'moderatemusic', 'loudmusic', 'streetnoise', 'hightraffic'],
    },
    // ✅ FIXED: Changed from snake_case to camelCase (no underscores)
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
