// ===== FILE: src/app.ts =====

import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from './config/passport';
import mongoose from 'mongoose';

import { dbManager } from './config/database';
import { detectRegion } from './middlewares/regionMiddleware';
import { errorHandler } from './utils/errorHandler';
import { testEmailConfig } from './services/emailService';
import { startSyncJobs } from './jobs/syncJob';

// API Route imports
import authRoutes from './routes/authRoutes';
import googleAuthRoutes from './routes/googleAuthRoutes';
import wifiRoutes from './routes/wifiRoutes';
import reviewRoutes from './routes/reviewRoutes';
import venueRoutes from './routes/venueRoutes';
import venueDubaiRoutes from './routes/venueDubaiRoutes';
import eventDubaiRoutes from './routes/eventDubaiRoutes';
import userRoutes from './routes/userRoutes';
import adminRoutes from './routes/adminRoutes';
import zohoRoutes from './routes/zohoRoutes';
import webhookRoutes from './routes/webhookRoutes';
import uploadRoutes from './routes/uploadRoutes';
import offerRoutes from './routes/offerRoutes';
import redemptionRoutes from './routes/redemptionRoutes';
import staffRoutes from './routes/staffRoutes';
import eventRoutes from './routes/eventRoutes';
import paymentRoutes from './routes/paymentRoutes';
import streetVendorRoutes from './routes/streetVendorRoutes';

// Load environment variables
dotenv.config();

const app = express();

// ===== CORS CONFIGURATION =====
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
    'https://th.honestlee.app',
    'https://admin.honestlee.app',
    'https://venue-dashboard.honestlee.app'
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
    'X-Region',
    'accept-language',
    'x-device-id',
    'x-platform'
  ]
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ limit: '1gb', extended: true }));
app.options('*', cors(corsOptions));

// ===== SESSION SUPPORT =====
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-session-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 10 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// ===== REGION DETECTION MIDDLEWARE =====
app.use(detectRegion);

// ===== ADDITIONAL CORS HEADERS =====
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name, x-region, X-Region, x-device-id, x-platform, accept-language');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ===== DATABASE CONNECTION LOGIC =====
const connectDatabases = async () => {
  try {
    // Connect to shared DB (MongoDB Atlas global/shared DB)
    await dbManager.connectShared();

    // Pre-connect to regional DBs that will be frequently accessed (AE, TH)
    await Promise.all([
      dbManager.connectRegion('ae'),
      dbManager.connectRegion('th')
    ]);
    console.log('✅ All databases connected successfully');

    // Global connection for jobs, admin, etc.
    const mongoURI = process.env.MONGODB_URI;
    if (mongoURI) {
      await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
      });
      console.log('✅ Global MongoDB connected:', mongoose.connection.name);

      // Index fixes
      try {
        const db = mongoose.connection.db;
        const userColl = db.collection('users');
        try {
          await userColl.dropIndex('phone_1');
          console.log('✅ Dropped phone_1 index');
        } catch (e) {
          console.log('⚠️  phone_1 index not found');
        }
        try {
          await userColl.dropIndex('email_1');
          console.log('✅ Dropped email_1 index');
        } catch (e) {
          console.log('⚠️  email_1 index not found');
        }
        await userColl.createIndex({ phone: 1 }, { unique: true, sparse: true });
        await userColl.createIndex({ email: 1 }, { unique: true, sparse: true });
        console.log('✅ Created sparse indexes for phone/email');
      } catch (indexError) {
        console.error('❌ Error fixing indexes:', indexError);
      }
      // Kick off services
      testEmailConfig();
      startSyncJobs();
    }
  } catch (error: any) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
};

connectDatabases();

// ===== API ROUTES =====
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
app.use('/api/offers', offerRoutes);
app.use('/api/redemptions', redemptionRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/payments', paymentRoutes);

// ===== STREET VENDOR ROUTES WITH REGION DETECTION =====
app.use('/api/street-vendors', detectRegion, streetVendorRoutes);

// ===== HEALTH CHECK ENDPOINT =====
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      name: mongoose.connection.name || 'Not connected'
    },
    cors: 'Enabled for ports 3000, 3001 and production domains',
    maxBodySize: '1GB',
    regions: {
      ae: 'Dubai/UAE',
      th: 'Thailand'
    },
    routes: {
      venues_dubai: '/api/venues-dubai',
      events_dubai: '/api/events-dubai',
      events: '/api/events',
      auth: '/api/auth',
      google_auth: '/api/auth/google',
      users: '/api/users',
      venues: '/api/venues',
      offers: '/api/offers',
      redemptions: '/api/redemptions',
      staff: '/api/staff',
      street_vendors: '/api/street-vendors',
      bulk_import: '/api/venues-dubai/bulk-import'
    }
  });
});

// ===== ERROR HANDLER =====
app.use(errorHandler);

export default app;
