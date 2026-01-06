// src/app.ts

import express from 'express';
import cors from 'cors';
import 'express-async-errors';
import dotenv from 'dotenv';
import session from 'express-session';
import passport from './config/passport';
import mongoose from 'mongoose';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';

import { dbManager } from './config/database';
import { detectRegion } from './middlewares/regionMiddleware';
import { errorHandler } from './utils/errorHandler';
import { testEmailConfig } from './services/emailService';
import { startSyncJobs } from './jobs/syncJob';

// API Route imports
import authRoutes from './routes/authRoutes';
import googleAuthRoutes from './routes/googleAuthRoutes';
import wifiRoutes from './routes/wifiRoutes';
// Import redirect controller
import { redirectWiFiJoin } from './controllers/wifiController';
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
import agentOnboardingRoutes from './routes/agentOnboarding';
import wifiSpeedTestRoutes from './routes/wifiSpeedTest';

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);

// ===== SOCKET.IO SETUP =====
export const io = new SocketIOServer(server, {
  cors: {
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
      'https://venue-dashboard.honestlee.app',
      'https://agent.honestlee.app'
    ],
    credentials: true
  },
  maxHttpBufferSize: 100 * 1024 * 1024, // 100MB for socket messages
  pingTimeout: 120000, // 2 minutes
  pingInterval: 25000, // 25 seconds
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('👤 Client connected:', socket.id);

  socket.on('track-vendor', (vendorId: string) => {
    console.log(`📍 Client ${socket.id} tracking vendor: ${vendorId}`);
    socket.join(`vendor-${vendorId}`);
  });

  socket.on('untrack-vendor', (vendorId: string) => {
    console.log(`⏹️ Client ${socket.id} stopped tracking vendor: ${vendorId}`);
    socket.leave(`vendor-${vendorId}`);
  });

  socket.on('disconnect', () => {
    console.log('👋 Client disconnected:', socket.id);
  });
});

export { server };

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
    'https://venue-dashboard.honestlee.app',
    'https://agent.honestlee.app'
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
  ],
  exposedHeaders: ['Content-Length', 'Content-Type'],
  maxAge: 86400
};

app.use(cors(corsOptions));

// ✅ CRITICAL: No limit on request body size (for 10GB+ uploads)
app.use(express.json({ limit: Infinity }));
app.use(express.urlencoded({ limit: Infinity, extended: true, parameterLimit: 1000000 }));

app.options('*', cors(corsOptions));

// ✅ CRITICAL: Set extremely long timeout for all requests (15 minutes)
app.use((req, res, next) => {
  req.setTimeout(900000); // 15 minutes
  res.setTimeout(900000); // 15 minutes
  next();
});

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

// ✅✅✅ ANDROID INSTANT APP: Serve assetlinks.json (MUST BE BEFORE OTHER ROUTES)
app.use('/.well-known', express.static(path.join(__dirname, '../public/.well-known'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.json')) {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    }
  }
}));

// ✅ Log when assetlinks.json is accessed
app.get('/.well-known/assetlinks.json', (req, res, next) => {
  console.log('📱 Android App Links: assetlinks.json requested from:', req.ip);
  next();
});

// ===== DATABASE CONNECTION LOGIC =====
const connectDatabases = async () => {
  try {
    await dbManager.connectShared();
    await Promise.all([
      dbManager.connectRegion('ae'),
      dbManager.connectRegion('th')
    ]);
    console.log('✅ All databases connected successfully');

    const mongoURI = process.env.MONGODB_URI;
    if (mongoURI) {
      // ✅ Increased timeouts for long operations
      await mongoose.connect(mongoURI, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 900000, // 15 minutes
        connectTimeoutMS: 60000,
        maxPoolSize: 100, // Increased pool
        minPoolSize: 20,
        maxIdleTimeMS: 120000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
      });
      console.log('✅ Global MongoDB connected:', mongoose.connection.name);

      try {
        const db = mongoose.connection.db;
        const userColl = db.collection('users');
        try {
          await userColl.dropIndex('phone_1');
          console.log('✅ Dropped phone_1 index');
        } catch (e) {
          console.log('⚠️  phone_1 index not found');
        }
        try {
          await userColl.dropIndex('email_1');
          console.log('✅ Dropped email_1 index');
        } catch (e) {
          console.log('⚠️  email_1 index not found');
        }
        await userColl.createIndex({ phone: 1 }, { unique: true, sparse: true });
        await userColl.createIndex({ email: 1 }, { unique: true, sparse: true });
        console.log('✅ Created sparse indexes for phone/email');
      } catch (indexError) {
        console.error('❌ Error fixing indexes:', indexError);
      }

      testEmailConfig();
      startSyncJobs();

      // ✅ Log assetlinks.json file status
      const assetlinksPath = path.join(__dirname, '../public/.well-known/assetlinks.json');
      const fs = require('fs');
      if (fs.existsSync(assetlinksPath)) {
        console.log('✅ assetlinks.json found at:', assetlinksPath);
        console.log('📱 Android Instant App verification file ready');
      } else {
        console.warn('⚠️  assetlinks.json NOT FOUND at:', assetlinksPath);
        console.warn('⚠️  Create file: public/.well-known/assetlinks.json');
      }
    }
  } catch (error: any) {
    console.error('❌ Database connection error:', error.message);
    process.exit(1);
  }
};

connectDatabases();

// ===== PUBLIC REDIRECT ROUTES =====
// Handle WiFi deep link redirect (e.g. from QR codes or frontend)
app.get('/wifi/join', redirectWiFiJoin);

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
app.use('/api/street-vendors', detectRegion, streetVendorRoutes);
app.use('/api/agent', agentOnboardingRoutes);
app.use('/api/wifi-speed', wifiSpeedTestRoutes);

// ===== HEALTH CHECK ENDPOINT =====
app.get('/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
  const fs = require('fs');
  const assetlinksPath = path.join(__dirname, '../public/.well-known/assetlinks.json');
  const assetlinksExists = fs.existsSync(assetlinksPath);

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    database: {
      status: dbStatus,
      name: mongoose.connection.name || 'Not connected'
    },
    socketio: 'Enabled for real-time updates',
    cors: 'Enabled for all production domains',
    maxBodySize: 'Unlimited (supports 10GB+ files)',
    timeout: '15 minutes',
    regions: {
      ae: 'Dubai/UAE',
      th: 'Thailand'
    },
    androidInstantApp: {
      assetlinksFile: assetlinksExists ? 'Ready' : 'Missing',
      url: `${req.protocol}://${req.get('host')}/.well-known/assetlinks.json`
    }
  });
});

// ✅ Handle timeout errors gracefully
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err.code === 'ETIMEDOUT' || err.message.includes('timeout')) {
    return res.status(408).json({
      success: false,
      message: 'Upload timeout. Your file is very large. Please ensure stable internet connection and try again.',
    });
  }
  next(err);
});

app.use(errorHandler);

export default app;
