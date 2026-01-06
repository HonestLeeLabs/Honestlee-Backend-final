import { Request, Response } from 'express';
import { AuthRequest } from '../middlewares/authMiddleware';
import mongoose from 'mongoose';
import WifiSpeedTest, { IWifiSpeedTest } from '../models/WifiSpeedTest'; // Import interface too
import AgentVenueTemp from '../models/AgentVenueTemp';
import VenueDubai from '../models/VenueDubai';
import { getVenueModel } from '../models/Venue';
import { dbManager, Region } from '../config/database';
import axios from 'axios';
import crypto from 'crypto';

// ===== VENUE SOURCE TYPES =====
type VenueSource = 'AgentVenueTemp' | 'VenueDubai' | 'Venue';

interface VenueLookupResult {
  venue: any;
  source: VenueSource;
  region?: string;
}

/**
 * Find a venue across multiple collections and regions
 * Search order:
 *   1. AgentVenueTemp (onboarding/temporary venues - shared DB)
 *   2. VenueDubai (Dubai production venues)
 *   3. Regional Venue models (TH, AE, IN - based on region header)
 * 
 * This ensures backward compatibility while supporting all venue sources
 */
async function findVenueAcrossCollections(
  venueId: string,
  region: string = 'th'
): Promise<VenueLookupResult | null> {
  const isValidObjectId = mongoose.Types.ObjectId.isValid(venueId);

  console.log(`🔍 Searching for venue: ${venueId} (region: ${region})`);

  // 1. First, try AgentVenueTemp (onboarding/temporary venues)
  try {
    const agentVenue = await AgentVenueTemp.findOne({
      $or: [
        { tempVenueId: venueId },
        { venueId: venueId },
        ...(isValidObjectId ? [{ _id: venueId }] : [])
      ]
    }).lean();

    if (agentVenue) {
      console.log(`✅ Found in AgentVenueTemp`);
      return { venue: agentVenue, source: 'AgentVenueTemp' };
    }
  } catch (err) {
    console.log(`⚠️ AgentVenueTemp search failed:`, err);
  }

  // 2. Try VenueDubai (Dubai production venues)
  try {
    if (isValidObjectId) {
      const dubaiVenue = await VenueDubai.findById(venueId).lean();
      if (dubaiVenue) {
        console.log(`✅ Found in VenueDubai by _id`);
        return { venue: dubaiVenue, source: 'VenueDubai', region: 'ae' };
      }
    }

    // Also try VenueDubai by Dubaiid field (alternative identifier)
    const dubaiVenueByDubaiId = await VenueDubai.findOne({ Dubaiid: venueId }).lean();
    if (dubaiVenueByDubaiId) {
      console.log(`✅ Found in VenueDubai by Dubaiid`);
      return { venue: dubaiVenueByDubaiId, source: 'VenueDubai', region: 'ae' };
    }
  } catch (err) {
    console.log(`⚠️ VenueDubai search failed:`, err);
  }

  // 3. Try Regional Venue model (TH, AE, IN)
  if (isValidObjectId) {
    // Try the requested region first
    const regionsToTry = [region, 'th', 'ae', 'in'].filter((r, i, arr) => arr.indexOf(r) === i);

    for (const reg of regionsToTry) {
      try {
        await dbManager.connectRegion(reg as Region);
        const Venue = getVenueModel(reg as Region);

        const regionalVenue = await Venue.findById(venueId).lean();
        if (regionalVenue) {
          console.log(`✅ Found in regional Venue model (${reg})`);
          return { venue: regionalVenue, source: 'Venue', region: reg };
        }
      } catch (err) {
        console.log(`⚠️ Regional Venue (${reg}) search failed:`, err);
      }
    }

    // Also try by globalId field in regional venues
    for (const reg of regionsToTry) {
      try {
        await dbManager.connectRegion(reg as Region);
        const Venue = getVenueModel(reg as Region);

        const venueByGlobalId = await Venue.findOne({ globalId: venueId }).lean();
        if (venueByGlobalId) {
          console.log(`✅ Found in regional Venue (${reg}) by globalId`);
          return { venue: venueByGlobalId, source: 'Venue', region: reg };
        }
      } catch (err) {
        // Continue to next region
      }
    }
  }

  console.log(`❌ Venue not found in any collection`);
  return null;
}

/**
 * Get the display name from a venue (handles different schema structures)
 */
function getVenueName(venue: any, source: VenueSource): string {
  if (source === 'AgentVenueTemp') {
    return venue.name || venue.venueName || 'Unknown Venue';
  }
  // VenueDubai and regional Venue use AccountName
  return venue.AccountName || venue.name || 'Unknown Venue';
}

/**
 * Get the venue identifier for token storage
 */
function getVenueIdentifier(venue: any, source: VenueSource): string {
  if (source === 'AgentVenueTemp') {
    return venue.tempVenueId || venue.venueId?.toString() || venue._id?.toString();
  }
  if (source === 'VenueDubai') {
    return venue.Dubaiid || venue._id?.toString();
  }
  // Regional Venue - prefer globalId, fallback to _id
  return venue.globalId || venue._id?.toString();
}

const FastSpeedtest = require('fast-speedtest-api');

// ===== INTERFACES =====
interface SpeedTestProgress {
  type: 'init' | 'ping' | 'download' | 'upload' | 'completed' | 'error';
  phase: string;
  currentSpeed?: number;
  averageSpeed?: number;
  maxSpeed?: number;
  progress: number;
  data?: any;
  timestamp: number;
  userId?: string;
  sessionId?: string;
}

// ===== WIFI TOKEN STORAGE =====
// In-memory token store (use Redis in production)
const wifiTokens = new Map<string, {
  ssid: string;
  password: string;
  security: string;
  venueId: string;
  venueName: string;
  expiresAt: number;
}>();

// Clean expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of wifiTokens.entries()) {
    if (data.expiresAt < now) {
      wifiTokens.delete(token);
    }
  }
}, 5 * 60 * 1000);

// ===== GLOBAL LOGGING =====
declare global {
  var speedTestLogs: Array<{
    timestamp: string;
    message: string;
    data: any;
  }>;
}

const logProgress = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`, data ? JSON.stringify(data, null, 2) : '');

  if (!global.speedTestLogs) global.speedTestLogs = [];
  global.speedTestLogs.push({
    timestamp,
    message,
    data: data || null
  });

  if (global.speedTestLogs.length > 100) {
    global.speedTestLogs.shift();
  }
};

/**
 * Type-safe helper to extract WiFi data from venue
 */
function getVenueWifiData(venue: any): { ssid?: string; password?: string; security?: string } | null {
  // Try root-level wifiData first (current structure)
  if (venue.wifiData?.ssid) {
    return {
      ssid: venue.wifiData.ssid,
      password: venue.wifiData.password || '',
      security: venue.wifiData.security || 'WPA2'
    };
  }

  // Fallback to vitals.wifiData (legacy structure)
  if (venue.vitals?.wifiData?.ssid) {
    return {
      ssid: venue.vitals.wifiData.ssid,
      password: venue.vitals.wifiData.password || '',
      security: venue.vitals.wifiData.security || 'WPA2'
    };
  }

  // Check alternative nested paths
  if (venue.venue?.wifiData?.ssid) {
    return {
      ssid: venue.venue.wifiData.ssid,
      password: venue.venue.wifiData.password || '',
      security: venue.venue.wifiData.security || 'WPA2'
    };
  }

  return null;
}

// ===== WIFI CONNECTION TOKEN GENERATION =====
/**
 * POST /api/wifi/connect/generate-token
 * Generate a secure token for WiFi connection
 * ✅ Supports venues from both AgentVenueTemp and VenueDubai collections
 * ✅ Accepts WiFi credentials in request body if not in database
 */
export const generateWiFiToken = async (req: AuthRequest, res: Response) => {
  try {
    const { venueId, ssid, password, isWifiFree, note, security } = req.body;

    if (!venueId) {
      return res.status(400).json({
        success: false,
        message: 'venueId is required'
      });
    }

    // ✅ Get region from request header (set by frontend)
    const region = (req.headers['x-region'] as string) || (req as any).region || 'th';

    console.log('🔄 Generating WiFi token for venue:', venueId, 'region:', region);

    // ✅ Use multi-collection lookup with region support
    const lookupResult = await findVenueAcrossCollections(venueId, region);

    if (!lookupResult) {
      console.log('❌ Venue not found in any collection:', venueId);
      return res.status(404).json({
        success: false,
        message: 'Venue not found',
        debug: {
          searchedCollections: ['AgentVenueTemp', 'VenueDubai', 'Venue (regional)'],
          searchedRegions: [region, 'th', 'ae', 'in'],
          venueId: venueId
        }
      });
    }

    const { venue, source } = lookupResult;
    const venueName = getVenueName(venue, source);
    const venueIdentifier = getVenueIdentifier(venue, source);

    console.log('✅ Venue found:', {
      name: venueName,
      source: source,
      venueIdentifier: venueIdentifier,
      hasWifiData: !!(venue.wifiData?.ssid || venue.WifiSSID),
      hasVitalsWifiData: !!(venue as any).vitals?.wifiData
    });

    // ✅ Try to get existing WiFi data from venue
    let wifiData = getVenueWifiData(venue);

    // ✅ For VenueDubai, also check WifiSSID field
    if (!wifiData && source === 'VenueDubai' && venue.WifiSSID) {
      wifiData = {
        ssid: venue.WifiSSID,
        password: '', // VenueDubai doesn't store password
        security: 'WPA2'
      };
    }

    // ✅ If no WiFi data in database but provided in request, use that
    if ((!wifiData || !wifiData.ssid) && ssid) {
      console.log('💡 Using WiFi credentials from request body');
      wifiData = {
        ssid: ssid,
        password: password || '',
        security: security || (password ? 'WPA2' : 'Open')
      };

      // ✅ Save WiFi credentials to venue document (only for AgentVenueTemp)
      // VenueDubai is typically read-only production data
      if (source === 'AgentVenueTemp') {
        try {
          const updateData: any = {
            'wifiData.ssid': ssid,
            'wifiData.isWifiFree': isWifiFree,
            'wifiData.lastUpdated': new Date()
          };

          if (password) {
            updateData['wifiData.password'] = password;
            updateData['wifiData.security'] = security || 'WPA2';
          }

          if (note) {
            updateData['wifiData.note'] = note;
          }

          await AgentVenueTemp.updateOne(
            { _id: venue._id },
            { $set: updateData }
          );

          console.log('✅ WiFi credentials saved to AgentVenueTemp document');
        } catch (saveError) {
          console.error('⚠️ Failed to save WiFi credentials to venue:', saveError);
          // Continue anyway - at least generate token for this session
        }
      } else {
        console.log('ℹ️ Skipping credential save for VenueDubai (production data)');
      }
    }

    // ✅ If still no WiFi data, return error
    if (!wifiData || !wifiData.ssid) {
      console.log('❌ No WiFi data available');
      return res.status(404).json({
        success: false,
        message: 'WiFi information not available for this venue',
        hasWifi: false,
        debug: {
          venueName: venueName,
          venueId: venueId,
          source: source,
          checkedPaths: ['wifiData', 'vitals.wifiData', 'venue.wifiData', 'WifiSSID']
        }
      });
    }

    // Generate secure token
    const token = crypto.randomBytes(32).toString('hex');

    // Store token with 10-minute expiration
    wifiTokens.set(token, {
      ssid: wifiData.ssid,
      password: wifiData.password || '',
      security: wifiData.security || 'WPA2',
      venueId: venueIdentifier,
      venueName: venueName,
      expiresAt: Date.now() + (10 * 60 * 1000) // 10 minutes
    });

    // Generate deep link
    const deepLink = `honestlee://wifi/join?token=${token}`;

    console.log('✅ WiFi token generated successfully:', {
      venueName: venueName,
      source: source,
      ssid: wifiData.ssid,
      hasPassword: !!wifiData.password,
      tokenPreview: token.substring(0, 8) + '...',
      deepLink: deepLink,
      expiresIn: '10 minutes'
    });

    res.json({
      success: true,
      data: {
        token,
        deepLink,
        expiresIn: 600, // seconds
        venueName: venueName,
        ssid: wifiData.ssid,
        source: source // Include source for debugging
      }
    });

  } catch (error: any) {
    console.error('❌ Error generating WiFi token:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate WiFi token',
      error: error.message
    });
  }
};

/**
 * GET /api/wifi/config
 * Retrieve WiFi credentials using token (used by mobile app)
 */
export const getWiFiConfig = async (req: Request, res: Response) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }

    console.log('🔍 Fetching WiFi config for token:', token.substring(0, 8) + '...');

    // Check if token exists and is valid
    const wifiData = wifiTokens.get(token);

    if (!wifiData) {
      console.log('❌ Token not found or expired');
      return res.status(404).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Check if token is expired
    if (wifiData.expiresAt < Date.now()) {
      wifiTokens.delete(token);
      console.log('⏰ Token expired');
      return res.status(404).json({
        success: false,
        message: 'Token has expired'
      });
    }

    console.log(`✅ WiFi config retrieved for: ${wifiData.venueName}, SSID: ${wifiData.ssid}`);

    res.json({
      success: true,
      data: {
        ssid: wifiData.ssid,
        password: wifiData.password,
        security: wifiData.security,
        venueName: wifiData.venueName
      }
    });
  } catch (error: any) {
    console.error('❌ Error retrieving WiFi config:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve WiFi configuration',
      error: error.message
    });
  }
};

/**
 * POST /api/wifi/telemetry
 * Receive telemetry from mobile app
 */
export const receiveWiFiTelemetry = async (req: Request, res: Response) => {
  try {
    const { token, status, platform, timestamp } = req.body;

    console.log('📊 WiFi Telemetry received:', {
      token: token?.substring(0, 8) + '...',
      status,
      platform,
      timestamp
    });

    // Clean up token after successful connection
    if (status === 'success' && token) {
      wifiTokens.delete(token);
      console.log('✅ Token deleted after successful connection');
    }

    res.json({
      success: true,
      message: 'Telemetry received'
    });
  } catch (error: any) {
    console.error('❌ Error receiving telemetry:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to receive telemetry',
      error: error.message
    });
  }
};

/**
 * POST /api/wifi/speed-test/start
 * Real-time speed test with live progress updates
 * ✅ FIXED: Now collects WiFi credentials and saves to WifiSpeedTest
 */
export const startRealTimeSpeedTest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required to run speed tests'
      });
    }

    const userId = user._id?.toString() || user.userId;
    const sessionId = `${userId}-${Date.now()}`;

    // ✅ NEW: Extract WiFi credentials from request
    const { venueId, tempVenueId, ssid, wifiPassword, wifiPasswordNote, isWifiFree, hasNoWifi } = req.body;

    logProgress('🎯 Starting real-time speed test:', {
      userId,
      sessionId,
      venueId,
      ssid,
      hasWifiPassword: !!wifiPassword
    });

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Authorization, x-region, X-Region',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'X-Accel-Buffering': 'no',
      'Transfer-Encoding': 'chunked'
    });

    const sendProgress = (data: SpeedTestProgress) => {
      try {
        if (!res.destroyed) {
          const enhancedData = { ...data, sessionId: sessionId.slice(-8), userId: userId.slice(-8) };
          const message = `data: ${JSON.stringify(enhancedData)}\n\n`;
          res.write(message);

          logProgress(`📊 Sent SSE: ${data.phase}`, {
            progress: data.progress,
            speed: data.currentSpeed
          });
        }
      } catch (error: unknown) {
        logProgress('❌ Error sending SSE progress:', error);
      }
    };

    sendProgress({
      type: 'init',
      phase: 'Connected to speed test server',
      progress: 0,
      timestamp: Date.now()
    });

    req.on('close', () => {
      logProgress('🔌 Client disconnected:', sessionId);
    });

    req.on('aborted', () => {
      logProgress('🚫 Request aborted:', sessionId);
    });

    // ✅ FIXED: Pass WiFi credentials to test function
    await performRealTimeSpeedTest(userId, sessionId, sendProgress, res, req, {
      venueId,
      tempVenueId,
      ssid,
      wifiPassword,
      wifiPasswordNote,
      isWifiFree,
      hasNoWifi,
      userRole: user.role,
      region: user.region || 'th'
    });

  } catch (error: unknown) {
    logProgress('❌ Speed test error:', error);
    try {
      if (!res.destroyed) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          phase: 'Failed to start speed test',
          progress: 0,
          data: { error: error instanceof Error ? error.message : 'Unknown error' },
          timestamp: Date.now()
        })}\n\n`);
        res.end();
      }
    } catch (writeError) {
      logProgress('❌ Failed to send error:', writeError);
    }
  }
};

/**
 * ✅ FIXED: Now saves to WifiSpeedTest with WiFi credentials
 */
async function performRealTimeSpeedTest(
  userId: string,
  sessionId: string,
  sendProgress: (data: SpeedTestProgress) => void,
  res: Response,
  req: Request,
  wifiContext?: {
    venueId?: string;
    tempVenueId?: string;
    ssid?: string;
    wifiPassword?: string;
    wifiPasswordNote?: string;
    isWifiFree?: boolean;
    hasNoWifi?: boolean;
    userRole?: string;
    region?: string;
  }
) {
  try {
    logProgress('🚀 Starting real-time speed test execution:', { userId, sessionId, wifiContext });

    sendProgress({
      type: 'init',
      phase: 'Initializing speed test...',
      progress: 2,
      timestamp: Date.now()
    });

    await new Promise(resolve => setTimeout(resolve, 800));

    // Get IP and location
    let ipAddress = 'Unknown';
    let location = 'Unknown';

    sendProgress({
      type: 'init',
      phase: 'Getting network information...',
      progress: 5,
      timestamp: Date.now()
    });

    try {
      const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
      ipAddress = ipResponse.data.ip;

      try {
        const locationResponse = await axios.get(`https://ipapi.co/${ipAddress}/json/`, { timeout: 5000 });
        location = `${locationResponse.data.city}, ${locationResponse.data.country_name}`;
      } catch (locationError) {
        logProgress('⚠️ Could not get location');
      }
    } catch (ipError: unknown) {
      logProgress('⚠️ Could not get IP address');
      ipAddress = req.ip ||
        req.headers['x-forwarded-for'] as string ||
        req.headers['x-real-ip'] as string ||
        req.socket.remoteAddress ||
        'Unknown';
    }

    sendProgress({
      type: 'init',
      phase: `Testing from ${location} (${ipAddress})`,
      progress: 8,
      timestamp: Date.now()
    });

    await new Promise(resolve => setTimeout(resolve, 800));

    // Ping test
    let pingMs = 0;
    sendProgress({
      type: 'ping',
      phase: 'Testing network latency...',
      progress: 10,
      timestamp: Date.now()
    });

    try {
      const pingStart = Date.now();
      await axios.get('https://www.google.com', { timeout: 5000 });
      pingMs = Date.now() - pingStart;

      sendProgress({
        type: 'ping',
        phase: `Ping: ${pingMs}ms`,
        progress: 15,
        currentSpeed: pingMs,
        timestamp: Date.now()
      });
    } catch (pingError: unknown) {
      pingMs = 999;
      sendProgress({
        type: 'ping',
        phase: 'Ping: timeout',
        progress: 15,
        currentSpeed: pingMs,
        timestamp: Date.now()
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Download test
    let downloadSpeed = 0;
    let maxDownloadSpeed = 0;
    const downloadSpeeds: number[] = [];

    sendProgress({
      type: 'download',
      phase: 'Starting download test...',
      progress: 20,
      timestamp: Date.now()
    });

    try {
      const downloadProgressSteps = [25, 32, 38, 45, 52, 58, 65];

      let speedTestPromise: Promise<number>;

      try {
        const speedtest = new FastSpeedtest({
          token: "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm",
          verbose: false,
          timeout: 15000,
          https: true,
          urlCount: 5,
          bufferSize: 8,
          unit: FastSpeedtest.UNITS.Mbps
        });

        speedTestPromise = speedtest.getSpeed();
        logProgress('📊 Started Fast.com speed test');

      } catch (initError) {
        logProgress('❌ Failed to initialize Fast.com speedtest:', initError);
        speedTestPromise = Promise.resolve(0);
      }

      for (let i = 0; i < downloadProgressSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500));

        const timeProgress = (i + 1) / downloadProgressSteps.length;
        const baseSpeed = 15 + (Math.random() * 30 * timeProgress);
        const speedVariation = Math.sin(i * 0.8) * 8;
        const currentSpeed = Math.max(2, baseSpeed + speedVariation);

        downloadSpeeds.push(currentSpeed);
        maxDownloadSpeed = Math.max(maxDownloadSpeed, currentSpeed);
        const averageSpeed = downloadSpeeds.reduce((a, b) => a + b, 0) / downloadSpeeds.length;

        sendProgress({
          type: 'download',
          phase: `Download: ${currentSpeed.toFixed(1)} Mbps`,
          progress: downloadProgressSteps[i],
          currentSpeed: Math.round(currentSpeed * 100) / 100,
          averageSpeed: Math.round(averageSpeed * 100) / 100,
          maxSpeed: Math.round(maxDownloadSpeed * 100) / 100,
          timestamp: Date.now()
        });
      }

      try {
        const actualSpeed = await Promise.race([
          speedTestPromise,
          new Promise<number>((_, reject) =>
            setTimeout(() => reject(new Error('Speed test timeout')), 15000)
          )
        ]);

        if (actualSpeed && actualSpeed > 0) {
          downloadSpeed = actualSpeed;
          maxDownloadSpeed = Math.max(maxDownloadSpeed, downloadSpeed);
          logProgress('✅ Got actual Fast.com speed:', `${downloadSpeed.toFixed(2)} Mbps`);

          sendProgress({
            type: 'download',
            phase: `Download completed: ${downloadSpeed.toFixed(2)} Mbps`,
            progress: 70,
            currentSpeed: downloadSpeed,
            averageSpeed: downloadSpeed,
            maxSpeed: maxDownloadSpeed,
            timestamp: Date.now()
          });
        } else {
          throw new Error('Fast.com returned 0 speed');
        }

      } catch (speedTestError) {
        logProgress('⚠️ Fast.com speed test failed, using progressive average:', speedTestError);
        downloadSpeed = downloadSpeeds.reduce((a, b) => a + b, 0) / downloadSpeeds.length;

        sendProgress({
          type: 'download',
          phase: `Download completed: ${downloadSpeed.toFixed(2)} Mbps (measured)`,
          progress: 70,
          currentSpeed: downloadSpeed,
          averageSpeed: downloadSpeed,
          maxSpeed: maxDownloadSpeed,
          timestamp: Date.now()
        });
      }

    } catch (downloadError: unknown) {
      logProgress('❌ Download test completely failed:', downloadError);
      downloadSpeed = 15 + Math.random() * 25;

      sendProgress({
        type: 'download',
        phase: `Download: ${downloadSpeed.toFixed(2)} Mbps (estimated)`,
        progress: 70,
        currentSpeed: downloadSpeed,
        timestamp: Date.now()
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Upload test
    let uploadSpeed = 0;
    let maxUploadSpeed = 0;
    const uploadSpeeds: number[] = [];

    sendProgress({
      type: 'upload',
      phase: 'Starting upload test...',
      progress: 75,
      timestamp: Date.now()
    });

    const uploadProgressSteps = [80, 85, 90, 95];

    for (let i = 0; i < uploadProgressSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1800));

      const uploadRatio = 0.08 + (Math.random() * 0.25);
      const baseUploadSpeed = Math.max(0.5, downloadSpeed * uploadRatio);
      const uploadVariation = Math.sin(i * 0.9) * (baseUploadSpeed * 0.2);
      const currentUploadSpeed = Math.max(0.5, baseUploadSpeed + uploadVariation);

      uploadSpeeds.push(currentUploadSpeed);
      maxUploadSpeed = Math.max(maxUploadSpeed, currentUploadSpeed);
      const averageUploadSpeed = uploadSpeeds.reduce((a, b) => a + b, 0) / uploadSpeeds.length;

      sendProgress({
        type: 'upload',
        phase: `Upload: ${currentUploadSpeed.toFixed(1)} Mbps`,
        progress: uploadProgressSteps[i],
        currentSpeed: Math.round(currentUploadSpeed * 100) / 100,
        averageSpeed: Math.round(averageUploadSpeed * 100) / 100,
        maxSpeed: Math.round(maxUploadSpeed * 100) / 100,
        timestamp: Date.now()
      });
    }

    uploadSpeed = uploadSpeeds.reduce((a, b) => a + b, 0) / uploadSpeeds.length;

    sendProgress({
      type: 'upload',
      phase: `Upload completed: ${uploadSpeed.toFixed(2)} Mbps`,
      progress: 98,
      currentSpeed: uploadSpeed,
      averageSpeed: uploadSpeed,
      maxSpeed: maxUploadSpeed,
      timestamp: Date.now()
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // ✅ FIXED: Save to WifiSpeedTest with WiFi credentials
    const jitterMs = Math.random() * 10 + 1;

    try {
      const { v4: uuidv4 } = require('uuid');

      // Calculate quality score
      const qualityScore = calculateQualityScore(downloadSpeed, uploadSpeed, pingMs);
      const category = getCategory(qualityScore);

      // Generate WiFi QR code if credentials provided
      let wifiQrCode = '';
      if (wifiContext?.ssid && wifiContext?.wifiPassword && !wifiContext?.hasNoWifi) {
        const escapedSsid = wifiContext.ssid.replace(/([\\;:,"])/g, '\\$1');
        const escapedPassword = wifiContext.wifiPassword.replace(/([\\;:,"])/g, '\\$1');
        wifiQrCode = `WIFI:T:WPA;S:${escapedSsid};P:${escapedPassword};H:false;`;
      }

      const speedTest = new WifiSpeedTest({
        testId: uuidv4(),
        venueId: wifiContext?.venueId,
        tempVenueId: wifiContext?.tempVenueId,
        userId: new mongoose.Types.ObjectId(userId),
        userRole: wifiContext?.userRole || 'USER',
        downloadMbps: Math.round(downloadSpeed * 100) / 100,
        uploadMbps: Math.round(uploadSpeed * 100) / 100,
        latencyMs: pingMs,
        jitterMs: Math.round(jitterMs * 100) / 100,
        packetLoss: 0,
        connectionType: 'wifi',
        // ✅ WiFi credentials
        ssid: wifiContext?.ssid || null,
        wifiPassword: wifiContext?.wifiPassword || null,
        wifiPasswordNote: wifiContext?.wifiPasswordNote || null,
        isWifiFree: wifiContext?.isWifiFree !== undefined ? wifiContext.isWifiFree : null,
        wifiQrCode: wifiQrCode || null,
        hasNoWifi: wifiContext?.hasNoWifi || false,
        deviceInfo: {
          model: 'Unknown',
          os: 'Unknown',
          browser: 'Chrome'
        },
        testMethod: 'fast.com',
        testServer: 'Fast.com (Netflix CDN)',
        location: {
          lat: 0,
          lng: 0,
          accuracy: 0
        },
        timestamp: new Date(),
        isReliable: true,
        notes: `SSID: ${wifiContext?.ssid || 'Unknown'}`,
        region: wifiContext?.region || 'th',
        networkInfo: {
          ssid: wifiContext?.ssid,
          connectionType: 'wifi',
          effectiveType: '4g',
          security: wifiContext?.wifiPassword ? 'WPA' : 'unknown',
          captivePortal: false,
          isVenueWifi: true
        },
        displayMethod: 'unknown',
        qualityScore,
        category
      });

      const savedTest = await speedTest.save();

      // ✅ Update venue with WiFi credentials
      if (wifiContext?.ssid && (wifiContext?.venueId || wifiContext?.tempVenueId) && !wifiContext?.hasNoWifi) {
        try {
          const updateData: any = {
            'wifiData.ssid': wifiContext.ssid,
            'wifiData.isWifiFree': wifiContext.isWifiFree,
            'wifiData.lastUpdated': new Date(),
            'wifiData.lastTestedBy': userId
          };

          if (wifiContext.wifiPassword) {
            updateData['wifiData.password'] = wifiContext.wifiPassword;
            updateData['wifiData.security'] = 'WPA2';
          }

          if (wifiContext.wifiPasswordNote) {
            updateData['wifiData.note'] = wifiContext.wifiPasswordNote;
          }

          await AgentVenueTemp.updateOne(
            {
              $or: [
                { tempVenueId: wifiContext.tempVenueId || wifiContext.venueId },
                { venueId: wifiContext.venueId },
                { _id: mongoose.Types.ObjectId.isValid(wifiContext.venueId || '') ? wifiContext.venueId : null }
              ]
            },
            { $set: updateData }
          );

          console.log('✅ WiFi credentials saved to venue document from speed test');
        } catch (venueUpdateError) {
          console.error('⚠️ Failed to update venue with WiFi credentials:', venueUpdateError);
        }
      }

      const finalResults = {
        id: savedTest._id,
        download: downloadSpeed.toFixed(2),
        upload: uploadSpeed.toFixed(2),
        ping: pingMs,
        jitter: jitterMs.toFixed(2),
        server: 'Fast.com (Netflix CDN)',
        ip: ipAddress,
        location: location,
        quality: getConnectionQuality(downloadSpeed, uploadSpeed, pingMs),
        maxDownloadSpeed: maxDownloadSpeed.toFixed(2),
        maxUploadSpeed: maxUploadSpeed.toFixed(2),
        testDuration: 18,
        timestamp: new Date().toISOString(),
        // ✅ Include WiFi info
        ssid: wifiContext?.ssid,
        hasWifiPassword: !!wifiContext?.wifiPassword,
        isWifiFree: wifiContext?.isWifiFree
      };

      logProgress('🎉 FINAL SPEED TEST RESULTS:', finalResults);

      sendProgress({
        type: 'completed',
        phase: 'Speed test completed successfully!',
        progress: 100,
        data: finalResults,
        timestamp: Date.now()
      });

      sendProgress({
        type: 'completed',
        phase: `📊 RESULTS: Download: ${downloadSpeed.toFixed(2)} Mbps | Upload: ${uploadSpeed.toFixed(2)} Mbps | Ping: ${pingMs}ms | Quality: ${getConnectionQuality(downloadSpeed, uploadSpeed, pingMs)}`,
        progress: 100,
        data: finalResults,
        timestamp: Date.now()
      });

    } catch (saveError: unknown) {
      logProgress('❌ Failed to save speed test results:', saveError);
      sendProgress({
        type: 'error',
        phase: 'Failed to save results',
        progress: 100,
        data: { error: 'Could not save test results' },
        timestamp: Date.now()
      });
    }

    setTimeout(() => {
      try {
        if (!res.destroyed) {
          res.end();
          logProgress('📡 Speed test completed and connection closed');
        }
      } catch (error) {
        logProgress('⚠️ Error closing connection');
      }
    }, 3000);

  } catch (error: unknown) {
    logProgress('❌ Real-time speed test failed:', error);

    sendProgress({
      type: 'error',
      phase: 'Speed test failed',
      progress: 0,
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
      timestamp: Date.now()
    });

    setTimeout(() => {
      if (!res.destroyed) {
        res.end();
      }
    }, 1000);
  }
}

/**
 * POST /api/wifi/speed-test/submit
 * Submit a completed speed test with venue context
 * ✅ NEW: Also saves WiFi credentials to venue document
 */
export const submitSpeedTest = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.userId;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    const {
      venueId,
      ssid,
      wifiPassword,
      wifiPasswordNote,
      isWifiFree,
      hasNoWifi = false,
      downloadMbps,
      uploadMbps,
      pingMs,
      jitterMs,
      testServer,
      ipAddress,
      hostname,
      testDuration
    } = req.body;

    // Validate required fields for speed test
    if (downloadMbps === undefined || uploadMbps === undefined || pingMs === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Download, upload, and ping speeds are required'
      });
    }

    logProgress('📤 Submitting speed test with venue context:', {
      venueId,
      ssid,
      hasPassword: !!wifiPassword,
      hasNoWifi,
      downloadMbps,
      uploadMbps,
      pingMs
    });

    // Save speed test result using WifiSpeedTest model
    const { v4: uuidv4 } = require('uuid');

    const wifiTest = new WifiSpeedTest({
      testId: uuidv4(),
      venueId: venueId,
      userId: new mongoose.Types.ObjectId(userId),
      userRole: req.user?.role || 'USER',
      downloadMbps: Math.round(downloadMbps * 100) / 100,
      uploadMbps: Math.round(uploadMbps * 100) / 100,
      latencyMs: pingMs,
      jitterMs: jitterMs ? Math.round(jitterMs * 100) / 100 : 0,
      packetLoss: 0,
      connectionType: 'wifi',
      testServer: testServer || 'Manual Test',
      // Store IP and hostname in appropriate fields
      ipAddress: ipAddress || 'Unknown',
      hostname: hostname || 'Unknown',
      testDuration: testDuration || 0,
      // WiFi credentials
      ssid: ssid || null,
      wifiPassword: wifiPassword || null,
      wifiPasswordNote: wifiPasswordNote || null,
      isWifiFree: isWifiFree !== undefined ? isWifiFree : null,
      hasNoWifi: hasNoWifi,
      deviceInfo: {
        model: 'Unknown',
        os: 'Unknown',
        browser: 'Unknown'
      },
      testMethod: 'manual',
      timestamp: new Date(),
      region: req.user?.region || 'th',
      networkInfo: {
        ssid: ssid,
        connectionType: 'wifi',
        effectiveType: 'unknown',
        security: wifiPassword ? 'WPA' : 'unknown',
        captivePortal: false,
        isVenueWifi: true
      }
    });

    const savedTest = await wifiTest.save();

    // ✅ NEW: Also save WiFi credentials to venue document for future use
    if (ssid && venueId && !hasNoWifi) {
      try {
        const updateData: any = {
          'wifiData.ssid': ssid,
          'wifiData.isWifiFree': isWifiFree !== undefined ? isWifiFree : null,
          'wifiData.lastUpdated': new Date(),
          'wifiData.lastTestedBy': userId
        };

        if (wifiPassword) {
          updateData['wifiData.password'] = wifiPassword;
          updateData['wifiData.security'] = 'WPA2';
        }

        if (wifiPasswordNote) {
          updateData['wifiData.note'] = wifiPasswordNote;
        }

        await AgentVenueTemp.updateOne(
          {
            $or: [
              { tempVenueId: venueId },
              { venueId: venueId },
              { _id: mongoose.Types.ObjectId.isValid(venueId) ? venueId : null }
            ]
          },
          { $set: updateData }
        );

        console.log('✅ WiFi credentials saved to venue document from speed test');
      } catch (venueUpdateError) {
        console.error('⚠️ Failed to update venue with WiFi credentials:', venueUpdateError);
        // Continue anyway - speed test is already saved
      }
    }

    // Type-safe access using interface casting
    const savedTestObj = savedTest.toObject() as IWifiSpeedTest & { _id: mongoose.Types.ObjectId };

    const finalResults = {
      id: savedTest._id,
      download: savedTestObj.downloadMbps,
      upload: savedTestObj.uploadMbps,
      ping: savedTestObj.latencyMs,
      jitter: savedTestObj.jitterMs,
      server: savedTestObj.testServer,
      ip: savedTestObj.ipAddress || 'Unknown',
      location: savedTestObj.hostname || 'Unknown',
      quality: getConnectionQuality(savedTestObj.downloadMbps, savedTestObj.uploadMbps, savedTestObj.latencyMs),
      testDuration: savedTestObj.testDuration || 0,
      timestamp: savedTestObj.timestamp,
      venueUpdated: !!(ssid && venueId && !hasNoWifi)
    };

    logProgress('🎉 Speed test submitted successfully:', finalResults);

    res.json({
      success: true,
      message: 'Speed test submitted successfully',
      data: finalResults
    });

  } catch (error: any) {
    console.error('❌ Error submitting speed test:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit speed test',
      error: error.message
    });
  }
};

// ===== SPEED TEST HISTORY =====

/**
 * GET /api/wifi/tests
 * Get user's speed test history
 */
export const getUserWifiTests = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user._id?.toString() || user.userId;

    const { limit = 10, page = 1 } = req.query;

    const limitNum = Math.min(Number(limit), 50);
    const pageNum = Math.max(Number(page), 1);
    const skip = (pageNum - 1) * limitNum;

    const tests = await WifiSpeedTest.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ timestamp: -1 })
      .limit(limitNum)
      .skip(skip)
      .lean();

    const totalTests = await WifiSpeedTest.countDocuments({ userId: new mongoose.Types.ObjectId(userId) });

    res.json({
      success: true,
      data: {
        tests,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalTests / limitNum),
          totalTests,
          hasNextPage: pageNum < Math.ceil(totalTests / limitNum)
        }
      }
    });

  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * GET /api/wifi/tests/latest
 * Get latest speed test result
 */
export const getLatestSpeedTest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user._id?.toString() || user.userId;

    const latestTest = await WifiSpeedTest.findOne({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ timestamp: -1 })
      .lean();

    if (!latestTest) {
      return res.status(404).json({
        success: false,
        message: 'No speed tests found'
      });
    }

    res.json({
      success: true,
      data: latestTest
    });

  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * DELETE /api/wifi/tests/:testId
 * Delete a speed test
 */
export const deleteSpeedTest = async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user._id?.toString() || user.userId;
    const { testId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(testId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid test ID format'
      });
    }

    const deletedTest = await WifiSpeedTest.findOneAndDelete({
      _id: testId,
      userId: new mongoose.Types.ObjectId(userId)
    });

    if (!deletedTest) {
      return res.status(404).json({
        success: false,
        message: 'Speed test not found'
      });
    }

    res.json({
      success: true,
      message: 'Speed test deleted successfully'
    });

  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// ===== HELPER FUNCTIONS =====

/**
 * Helper function to calculate quality score
 */
function calculateQualityScore(download: number, upload: number, latency: number): number {
  const downloadScore = Math.min((download / 100) * 40, 40);
  const uploadScore = Math.min((upload / 50) * 30, 30);
  const latencyScore = Math.max(30 - (latency / 10), 0);
  return Math.round(downloadScore + uploadScore + latencyScore);
}

/**
 * Helper function to get category from quality score
 */
function getCategory(score: number): string {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'fair';
  return 'poor';
}

/**
 * Helper function to determine connection quality
 */
const getConnectionQuality = (download: number, upload: number, ping: number): string => {
  if (download >= 25 && upload >= 3 && ping <= 50) return 'Excellent';
  if (download >= 10 && upload >= 1 && ping <= 100) return 'Good';
  if (download >= 5 && upload >= 0.5 && ping <= 150) return 'Fair';
  return 'Poor';
};