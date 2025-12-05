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
  
  // ✅ NEW FIELDS
  isIndoor?: boolean;
  isOutdoor?: boolean;
  climateControl?: 'ac' | 'fan' | 'none';
  noiseLevel?: 'quiet' | 'low_music' | 'moderate_music' | 'loud_music' | 'street_noise' | 'high_traffic';
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
    
    // ✅ NEW FIELDS
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
      enum: ['quiet', 'low_music', 'moderate_music', 'loud_music', 'street_noise', 'high_traffic'],
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

ZoneSchema.index({ venueId: 1, isActive: 1 });
ZoneSchema.index({ tempVenueId: 1, isActive: 1 });

ZoneSchema.pre("validate", function (next) {
  if (!this.venueId && !this.tempVenueId) {
    next(new Error("Either venueId or tempVenueId must be provided"));
  } else {
    next();
  }
});

export default mongoose.model<IZone>("Zone", ZoneSchema);
