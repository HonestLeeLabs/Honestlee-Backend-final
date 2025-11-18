// src/models/AuditLog.ts
import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  auditId: string;
  actorId: mongoose.Types.ObjectId;
  actorRole: string;
  venueId?: mongoose.Types.ObjectId;
  action: string;
  meta: any;
  deviceId?: string;
  ip?: string;
  geoLocation?: {
    lat: number;
    lng: number;
  };
  createdAt: Date;
}

const AuditLogSchema = new Schema<IAuditLog>({
  auditId: {
    type: String,
    unique: true,
    required: true,
    index: true
  },
  actorId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  actorRole: {
    type: String,
    required: true
  },
  venueId: {
    type: Schema.Types.ObjectId,
    ref: 'Venue',
    sparse: true,
    index: true
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  meta: {
    type: Schema.Types.Mixed,
    default: {}
  },
  deviceId: String,
  ip: String,
  geoLocation: {
    lat: Number,
    lng: Number
  }
}, {
  timestamps: { createdAt: true, updatedAt: false },
  collection: 'audit_logs'
});

// Indexes
AuditLogSchema.index({ actorId: 1, createdAt: -1 });
AuditLogSchema.index({ venueId: 1, action: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });

export default mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
