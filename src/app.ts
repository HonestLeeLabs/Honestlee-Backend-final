// src/app.ts
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
import offerRoutes from './routes/offerRoutes';
import redemptionRoutes from './routes/redemptionRoutes';
import staffRoutes from './routes/staffRoutes'; // ✅ ADDED
import eventRoutes from './routes/eventRoutes';

console.log('✅ eventDubaiRoutes imported:', typeof eventDubaiRoutes);
console.log('✅ eventDubaiRoutes is Router?', eventDubaiRoutes?.stack ? 'Yes' : 'No');

dotenv.config();

const app = express();

// CORS Configuration
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
    'X-Region',
    'x-device-id',    // ✅ ADDED for staff sessions
    'x-platform'      // ✅ ADDED for staff sessions
  ]
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1gb' }));
app.use(express.urlencoded({ limit: '1gb', extended: true }));

// Session support
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
app.options('*', cors(corsOptions));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, X-File-Name, x-region, X-Region, x-device-id, x-platform');
  res.header('Access-Control-Allow-Credentials', 'true');
  next();
});

// ✅ FIX: MongoDB connection with proper scoping
const connectDB = async (retries = 5) => {
  // ✅ FIX: Define mongoURI outside try block
  const mongoURI = process.env.MONGODB_URI;

  try {
    if (!mongoURI) {
      throw new Error('MONGODB_URI is not defined in environment variables');
    }

    console.log('🔄 Attempting MongoDB connection...');
    console.log('📍 Database:', mongoURI.split('/')[3]?.split('?')[0] || 'Not specified');

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB connected successfully');
    console.log('📦 Database name:', mongoose.connection.name);
    console.log('📦 Max request body size: 1GB (for bulk imports)');

    // Fix indexes after successful connection
    try {
      const db = mongoose.connection.db;
      const collection = db.collection('users');

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

      await collection.createIndex({ phone: 1 }, { unique: true, sparse: true });
      await collection.createIndex({ email: 1 }, { unique: true, sparse: true });
      console.log('✅ Created sparse indexes for phone and email');

    } catch (error) {
      console.error('❌ Error fixing indexes:', error);
    }

    // Initialize services after successful connection
    testEmailConfig();
    startSyncJobs();

  } catch (error: any) {
    console.error('❌ MongoDB connection error:', error.message);

    if (retries > 0) {
      console.log(`🔄 Retrying connection... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      return connectDB(retries - 1);
    } else {
      console.error('❌ MongoDB connection failed after all retries');
      console.error('💡 Troubleshooting:');
      console.error('   1. Check MONGODB_URI includes database name: /test?...');
      console.error('   2. Verify IP is whitelisted (0.0.0.0/0 for all)');
      console.error('   3. Ensure cluster is running in MongoDB Atlas');
      console.error('   4. Check username/password are correct');
      console.error('   5. Current URI:', mongoURI?.substring(0, 50) + '...');
      console.error('   6. Try standard connection string instead of SRV');
      
      console.warn('⚠️  Server will continue but database operations will fail');
    }
  }
};

// Connect to database
connectDB();

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
app.use('/api/offers', offerRoutes);
app.use('/api/redemptions', redemptionRoutes);
app.use('/api/staff', staffRoutes); // ✅ ADDED STAFF ROUTES
app.use('/api/events', eventRoutes); 

// Health check endpoint
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
      staff: '/api/staff',           // ✅ ADDED
      bulk_import: '/api/venues-dubai/bulk-import'
    }
  });
});

// Error handler
app.use(errorHandler);

export default app;