import mongoose, { Schema, Document } from "mongoose";

export interface IZone extends Document {
  zoneId: string;
  venueId?: mongoose.Types.ObjectId;  // ✅ Make optional
  tempVenueId?: string;                // ✅ Add this for temp venues
  name: string;
  capacityMin?: number;
  capacityMax?: number;
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
    tempVenueId: {    // ✅ NEW: Support temporary venue IDs
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
      min: 1,
    },
    capacityMax: {
      type: Number,
      min: 1,
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
    },
  },
  {
    timestamps: true,
    collection: "zones",
  }
);

// ✅ Add compound index for both venueId and tempVenueId
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
