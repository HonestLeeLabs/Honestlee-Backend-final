import mongoose, { Schema, Document } from "mongoose";

export interface IZone extends Document {
  zoneId: string;
  venueId?: mongoose.Types.ObjectId;  // ✅ Optional for temp venues
  tempVenueId?: string;                // ✅ Support temporary venue IDs
  name: string;
  capacityMin?: number;
  capacityMax?: number;
  // ✅ NEW FIELDS
  numTables?: number;
  numSeats?: number;
  numChargingPorts?: number;
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
      sparse: true,  // ✅ Allow null/undefined
      index: true,
    },
    tempVenueId: {    // ✅ Support temporary venue IDs
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
    // ✅ NEW FIELDS - Infrastructure tracking
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

// ✅ Add compound indexes for both venueId and tempVenueId
ZoneSchema.index({ venueId: 1, isActive: 1 });
ZoneSchema.index({ tempVenueId: 1, isActive: 1 });

// ✅ Add validation to ensure at least one venue identifier exists
ZoneSchema.pre("validate", function (next) {
  if (!this.venueId && !this.tempVenueId) {
    next(new Error("Either venueId or tempVenueId must be provided"));
  } else {
    next();
  }
});

export default mongoose.model<IZone>("Zone", ZoneSchema);
