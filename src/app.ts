// src/app.ts or src/index.ts
import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from './config/passport';
import authRoutes from './routes/authRoutes';
import googleAuthRoutes from './routes/googleAuthRoutes';
import wifiRoutes from './routes/wifiRoutes';
import reviewRoutes from './routes/reviewRoutes';
import venueRoutes from './routes/venueRoutes';
import userRoutes from './routes/userRoutes';
import adminRoutes from './routes/adminRoutes';
import zohoRoutes from './routes/zohoRoutes';
import webhookRoutes from './routes/webhookRoutes';
import venueDubaiRoutes from './routes/venueDubaiRoutes';
import eventDubaiRoutes from './routes/eventDubaiRoutes';
import { startSyncJobs } from './jobs/syncJob';
import { errorHandler } from './utils/errorHandler';
import { testEmailConfig } from './services/emailService';
import uploadRoutes from './routes/uploadRoutes';

console.log('✅ eventDubaiRoutes imported:', typeof eventDubaiRoutes);
console.log('✅ eventDubaiRoutes is Router?', eventDubaiRoutes?.stack ? 'Yes' : 'No');

dotenv.config();

const app = express();

// CORS Configuration for Frontend Access
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://honestlee.app',
    'https://www.honestlee.app',
    'https://api.honestlee.app',
    'https://honestlee-frontend.netlify.app',
    'http://in.honestlee.app.s3-website.ap-south-1.amazonaws.com',
    'http://ae.honestlee.app.s3-website.ap-south-1.amazonaws.com',
    'http://ae.honestlee.app',
    'http://in.honestlee.app',
    'https://ae.honestlee.app',
    'https://in.honestlee.app',
    'https://honestlee.ae',
    'http://honestlee.ae',
    'https://api.honestlee.ae',
    'https://hlee.app',
    'https://www.hlee.app',
  ],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'Origin',
    'Cache-Control',
    'X-File-Name',
    'x-region',
    'X-Region'
  ]
};

app.use(cors(corsOptions));

// ⭐ INCREASED TO 1GB for massive bulk imports
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ limit: '1gb', extended: true }));

// Session support for OAuth state
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000 // 10 minutes
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Add preflight handler for complex CORS requests
app.options('*', cors(corsOptions));

// Add additional headers for streaming responses
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name, x-region, X-Region');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
}); 

mongoose.connect(process.env.MONGODB_URI || '')
  .then(async () => {
    console.log('✅ MongoDB connected');
    console.log('📦 Max request body size: 1GB (for bulk imports)');

    try {
      const db = mongoose.connection.db;
      const collection = db.collection('users');

      // Drop old indexes
      try {
        await collection.dropIndex('phone_1');
        console.log('✅ Dropped phone_1 index');
      } catch (e) {
        console.log('⚠️  phone_1 index not found or already dropped');
      }

      try {
        await collection.dropIndex('email_1');
        console.log('✅ Dropped email_1 index');
      } catch (e) {
        console.log('⚠️  email_1 index not found or already dropped');
      }

      // Create sparse indexes
      await collection.createIndex({ phone: 1 }, { unique: true, sparse: true });
      await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
      console.log('✅ Created sparse indexes for phone and email');

    } catch (error) {
      console.error('❌ Error fixing indexes:', error);
    }
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Initialize services
testEmailConfig();
startSyncJobs();

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/auth', googleAuthRoutes);
app.use('/api/wifi', wifiRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/venues-dubai', venueDubaiRoutes);
app.use('/api/events-dubai', eventDubaiRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/zoho', zohoRoutes);
app.use('/webhooks', webhookRoutes);
app.use('/api/upload', uploadRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    cors: 'Enabled for ports 3000, 3001 and production domains',
    maxBodySize: '1GB',
    routes: {
      venues_dubai: '/api/venues-dubai',
      events_dubai: '/api/events-dubai',
      auth: '/api/auth',
      google_auth: '/api/auth/google',
      users: '/api/users',
      bulk_import: '/api/venues-dubai/bulk-import'
    }
  });
});

// Error handler
app.use(errorHandler);

export default app;
