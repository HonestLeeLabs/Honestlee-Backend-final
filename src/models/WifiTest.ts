import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IWifiTest extends Document {
  user: Types.ObjectId;
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  testServer?: string;
  ipAddress?: string;
  hostname?: string;
  testDuration?: number;
  createdAt: Date;
}

const WifiTestSchema = new Schema<IWifiTest>({
  user: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  downloadMbps: { 
    type: Number, 
    required: true,
    min: 0,
    max: 10000 // Max 10 Gbps
  },
  uploadMbps: { 
    type: Number, 
    required: true,
    min: 0,
    max: 10000 // Max 10 Gbps
  },
  pingMs: { 
    type: Number, 
    required: true,
    min: 0,
    max: 5000 // Max 5 seconds ping
  },
  jitterMs: { 
    type: Number, 
    required: true,
    min: 0,
    max: 1000 // Max 1 second jitter
  },
  testServer: { 
    type: String,
    default: ''
  },
  ipAddress: { 
    type: String,
    default: ''
  },
  hostname: { 
    type: String,
    default: ''
  },
  testDuration: { 
    type: Number, 
    default: 4,
    min: 1,
    max: 8
  }
}, { 
  timestamps: { 
    createdAt: true, 
    updatedAt: false 
  }
});

// Index for faster queries
WifiTestSchema.index({ user: 1, createdAt: -1 });
WifiTestSchema.index({ createdAt: -1 });

export default mongoose.model<IWifiTest>('WifiTest', WifiTestSchema);
