import mongoose, { Schema, Document } from 'mongoose';

export interface IAgentWiFiRun extends Document {
runId: string;
venueId: mongoose.Types.ObjectId;
zone?: string; // ✅ Changed from ObjectId to string
dlMbps: number;
ulMbps: number;
latencyMs: number;
jitterMs?: number;
lossPct?: number;
bssidHash: string;
vpnFlag: boolean;
presenceConfidence: 'low' | 'medium' | 'high';
agentVerified: boolean;
agentId: mongoose.Types.ObjectId;
deviceInfo?: {
model?: string;
os?: string;
browser?: string;
};
captivePortal: boolean;
createdAt: Date;
}

const AgentWiFiRunSchema = new Schema<IAgentWiFiRun>({
runId: {
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
zone: {
type: String, // ✅ Changed from ObjectId to String
sparse: true,
index: true
},
dlMbps: {
type: Number,
required: true,
min: 0
},
ulMbps: {
type: Number,
required: true,
min: 0
},
latencyMs: {
type: Number,
required: true,
min: 0
},
jitterMs: Number,
lossPct: Number,
bssidHash: {
type: String,
required: true,
select: false
},
vpnFlag: {
type: Boolean,
default: false
},
presenceConfidence: {
type: String,
enum: ['low', 'medium', 'high'],
default: 'medium'
},
agentVerified: {
type: Boolean,
default: true,
index: true
},
agentId: {
type: Schema.Types.ObjectId,
ref: 'User',
required: true,
index: true
},
deviceInfo: {
model: String,
os: String,
browser: String
},
captivePortal: {
type: Boolean,
default: false
}
}, {
timestamps: { createdAt: true, updatedAt: false },
collection: 'agent_wifi_runs'
});

// Indexes
AgentWiFiRunSchema.index({ venueId: 1, zone: 1, createdAt: -1 });
AgentWiFiRunSchema.index({ agentId: 1, createdAt: -1 });
AgentWiFiRunSchema.index({ agentVerified: 1, createdAt: -1 });

export default mongoose.model<IAgentWiFiRun>('AgentWiFiRun', AgentWiFiRunSchema);