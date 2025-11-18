// src/models/Zone.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IZone extends Document {
  zoneId: string;
  venueId: mongoose.Types.ObjectId;
  name: string;
  capacityMin?: number;
  capacityMax?: number;
  colorToken: string;
  createdBy: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ZoneSchema = new Schema<IZone>({
  zoneId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  venueId: {
    type: Schema.Types.ObjectId,
    ref: 'Venue',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    maxlength: 18
  },
  capacityMin: Number,
  capacityMax: Number,
  colorToken: {
    type: String,
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  }
}, {
  timestamps: true,
  collection: 'zones'
});

// Indexes
ZoneSchema.index({ venueId: 1, isActive: 1 });
ZoneSchema.index({ venueId: 1, name: 1 });

export default mongoose.model<IZone>('Zone', ZoneSchema);
