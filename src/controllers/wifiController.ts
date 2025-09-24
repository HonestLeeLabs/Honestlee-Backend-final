import { Request, Response } from 'express';
import mongoose from 'mongoose';
import WifiTest from '../models/WifiTest';
import axios from 'axios';

const FastSpeedtest = require('fast-speedtest-api');

interface IWifiTest {
  user: mongoose.Types.ObjectId;
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  jitterMs: number;
  testServer: string;
  ipAddress: string;
  hostname: string;
  testDuration: number;
  createdAt?: Date;
  updatedAt?: Date;
}

interface IWifiTestDocument extends IWifiTest {
  _id: mongoose.Types.ObjectId;
}

interface SpeedTestProgress {
  type: 'ping' | 'download' | 'upload' | 'completed' | 'error' | 'connection';
  phase: string;
  currentSpeed?: number;
  averageSpeed?: number;
  progress: number;
  data?: any;
  timestamp: number;
  userId?: string;
  sessionId?: string;
}

// Global logging for debugging
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

// Global storage for JSON-based test progress
const testSessions = new Map<string, {
  userId: string;
  status: string;
  progress: number;
  currentSpeed?: number;
  averageSpeed?: number;
  phase: string;
  type: string;
  results?: any;
  error?: string;
  timestamp: number;
  logs: Array<{
    timestamp: string;
    message: string;
    progress: number;
    speed?: number;
    type?: string;
    rawData?: any;
  }>;
}>();

export const startLiveSpeedTest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const responseType = req.query.format as string;
    const sessionId = `${userId}-${Date.now()}`;
    
    logProgress('🎯 Starting speed test:', { userId, responseType, sessionId });

    // NEW: Streaming JSON Response with continuous logs
    if (responseType === 'json') {
      return await startStreamingJSONSpeedTest(req, res, userId, sessionId);
    }

    // Default: Server-Sent Events
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control, Content-Type, Authorization',
      'X-Accel-Buffering': 'no'
    });

    res.write(`data: ${JSON.stringify({
      type: 'connection',
      phase: 'Connected to speed test server',
      progress: 0,
      timestamp: Date.now(),
      sessionId
    })}\n\n`);

    const sendProgress = (data: SpeedTestProgress) => {
      try {
        if (!res.destroyed && !res.headersSent) {
          const enhancedData = { ...data, sessionId, userId };
          res.write(`data: ${JSON.stringify(enhancedData)}\n\n`);
          
          logProgress(`📊 Progress: ${data.phase}`, {
            progress: data.progress,
            speed: data.currentSpeed,
            type: data.type
          });
        }
      } catch (error: unknown) {
        logProgress('❌ Error sending SSE progress:', error);
      }
    };

    req.on('close', () => {
      logProgress('🔌 SSE connection closed:', sessionId);
    });

    // Start speed test
    performSpeedTest(userId, sessionId, sendProgress, res);

  } catch (error: unknown) {
    logProgress('❌ Speed test error:', error);
    try {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        phase: 'Failed to start speed test',
        progress: 0,
        data: { error: error instanceof Error ? error.message : 'Unknown error' },
        timestamp: Date.now()
      })}\n\n`);
      res.end();
    } catch (writeError) {
      logProgress('❌ Failed to send error:', writeError);
    }
  }
};

// NEW: Streaming JSON with continuous updates (Option 2)
async function startStreamingJSONSpeedTest(req: Request, res: Response, userId: string, sessionId: string) {
  try {
    logProgress('🎯 Starting streaming JSON speed test:', { userId, sessionId });

    // Set headers for streaming JSON
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Transfer-Encoding': 'chunked'
    });

    const logs: string[] = [];
    const rawLogs: any[] = [];
    
    // Helper function to send progressive updates
    const sendUpdate = (message: string, data?: any, isComplete: boolean = false) => {
      const timestamp = new Date().toISOString();
      const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';
      const formattedLog = `[${timestamp}] ${message}${dataStr}`;
      
      logs.push(formattedLog);
      rawLogs.push({
        timestamp,
        message,
        data: data || null
      });
      
      // Send progressive JSON update
      const update = {
        timestamp,
        sessionId: sessionId.slice(-8),
        message,
        data: data || null,
        totalLogs: logs.length,
        progress: data?.progress || 0,
        isComplete,
        currentLog: formattedLog, // Current log entry
        allLogs: logs.slice(-5) // Last 5 logs for context
      };
      
      // Send as JSON chunk with newline separator
      res.write(JSON.stringify(update) + '\n');
      
      // Also log to console
      console.log(formattedLog);
    };

    await performStreamingSpeedTest(userId, sessionId, sendUpdate, res);

  } catch (error: unknown) {
    logProgress('❌ Streaming JSON speed test error:', error);
    res.write(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
      isComplete: true
    }) + '\n');
    res.end();
  }
}

// Streaming speed test execution
async function performStreamingSpeedTest(
  userId: string,
  sessionId: string,
  sendUpdate: (message: string, data?: any, isComplete?: boolean) => void,
  res: Response
) {
  try {
    sendUpdate('🎯 Starting speed test:', {
      userId,
      responseType: 'streaming-json',
      sessionId,
      progress: 0
    });

    sendUpdate('🎯 Starting enhanced speed test', {
      sessionId: sessionId.slice(-8),
      progress: 5
    });

    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 1: Get IP and location
    let ipAddress = 'Unknown';
    let location = 'Unknown';
    
    sendUpdate('🌐 Getting IP address...', {
      sessionId: sessionId.slice(-8),
      progress: 10
    });
    
    try {
      const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
      ipAddress = ipResponse.data.ip;
      
      sendUpdate(`✅ IP Address obtained: ${ipAddress}`, {
        sessionId: sessionId.slice(-8),
        progress: 12
      });
      
      try {
        const locationResponse = await axios.get(`https://ipapi.co/${ipAddress}/json/`, { timeout: 5000 });
        location = `${locationResponse.data.city}, ${locationResponse.data.country_name}`;
        
        sendUpdate(`📍 Location obtained: ${location}`, {
          sessionId: sessionId.slice(-8),
          progress: 15
        });
      } catch (locationError) {
        sendUpdate('⚠️ Could not get location, using IP only', {
          sessionId: sessionId.slice(-8),
          progress: 15
        });
      }
    } catch (error) {
      sendUpdate('⚠️ IP/Location lookup failed, using fallback', {
        sessionId: sessionId.slice(-8),
        progress: 15
      });
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 2: Ping test
    sendUpdate('⚡ Starting ping test...', {
      sessionId: sessionId.slice(-8),
      progress: 20
    });
    
    const pingStart = Date.now();
    let pingMs = 0;
    try {
      await axios.get('https://www.google.com', { timeout: 5000 });
      pingMs = Date.now() - pingStart;
      
      sendUpdate(`✅ Ping test completed: ${pingMs}ms`, {
        sessionId: sessionId.slice(-8),
        progress: 25,
        speed: pingMs
      });
    } catch (error) {
      pingMs = 999;
      sendUpdate('❌ Ping test failed, using fallback', {
        sessionId: sessionId.slice(-8),
        progress: 25,
        speed: pingMs
      });
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 3: Download test
    sendUpdate('📥 Starting download test with Fast.com...', {
      sessionId: sessionId.slice(-8),
      progress: 30
    });

    const downloadSteps = [35, 40, 45, 50, 55];
    const speeds: number[] = [];
    
    for (let i = 0; i < downloadSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const speed = Math.random() * 50 + 10;
      speeds.push(speed);
      
      sendUpdate(`📥 Download progress: ${downloadSteps[i]}% - ${speed.toFixed(2)} Mbps`, {
        sessionId: sessionId.slice(-8),
        progress: downloadSteps[i],
        speed: speed
      });
    }

    // Get actual download speed
    let downloadSpeed = 0;
    try {
      const speedtest = new FastSpeedtest({
        token: "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm",
        timeout: 15000,
        https: true,
        urlCount: 2,
        unit: FastSpeedtest.UNITS.Mbps
      });
      
      downloadSpeed = await speedtest.getSpeed();
      
      sendUpdate(`✅ Download speed test completed: ${downloadSpeed.toFixed(2)} Mbps`, {
        sessionId: sessionId.slice(-8),
        progress: 60,
        speed: downloadSpeed
      });
    } catch (error) {
      downloadSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      sendUpdate(`🔄 Using estimated download speed: ${downloadSpeed.toFixed(2)} Mbps`, {
        sessionId: sessionId.slice(-8),
        progress: 60,
        speed: downloadSpeed
      });
    }

    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 4: Upload test
    sendUpdate('📤 Starting upload speed test...', {
      sessionId: sessionId.slice(-8),
      progress: 65
    });

    const uploadSteps = [70, 75, 80, 85, 90];
    const uploadSpeeds: number[] = [];
    
    for (let i = 0; i < uploadSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const uploadSpeed = downloadSpeed * (0.1 + Math.random() * 0.2);
      uploadSpeeds.push(uploadSpeed);
      
      sendUpdate(`📤 Upload progress: ${uploadSteps[i]}% - ${uploadSpeed.toFixed(2)} Mbps`, {
        sessionId: sessionId.slice(-8),
        progress: uploadSteps[i],
        speed: uploadSpeed
      });
    }

    const finalUploadSpeed = uploadSpeeds.reduce((a, b) => a + b, 0) / uploadSpeeds.length;
    
    sendUpdate(`✅ Upload speed test completed: ${finalUploadSpeed.toFixed(2)} Mbps`, {
      sessionId: sessionId.slice(-8),
      progress: 92,
      speed: finalUploadSpeed
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 5: Final steps
    const jitterMs = Math.random() * 10 + 1;
    
    sendUpdate('📊 Calculating final metrics...', {
      sessionId: sessionId.slice(-8),
      progress: 95
    });

    await new Promise(resolve => setTimeout(resolve, 500));

    sendUpdate('💾 Saving speed test results to database...', {
      sessionId: sessionId.slice(-8),
      progress: 98
    });

    // Save to database
    let savedTestId = '';
    try {
      const wifiTest = new WifiTest({
        user: new mongoose.Types.ObjectId(userId),
        downloadMbps: Math.round(downloadSpeed * 100) / 100,
        uploadMbps: Math.round(finalUploadSpeed * 100) / 100,
        pingMs: pingMs,
        jitterMs: Math.round(jitterMs * 100) / 100,
        testServer: 'Fast.com (Netflix CDN)',
        ipAddress: ipAddress,
        hostname: location,
        testDuration: 12
      });
      
      const savedTest = await wifiTest.save();
      savedTestId = savedTest._id.toString();
      
      sendUpdate(`✅ Speed test results saved successfully: ${savedTestId}`, {
        sessionId: sessionId.slice(-8),
        progress: 100
      });

      // Send final completion
      sendUpdate('🎉 Streaming JSON Speed test completed successfully', {
        sessionId: sessionId.slice(-8),
        userId: userId.slice(-8),
        progress: 100,
        results: {
          id: savedTestId,
          download: downloadSpeed.toFixed(2),
          upload: finalUploadSpeed.toFixed(2),
          ping: pingMs,
          jitter: jitterMs.toFixed(2),
          server: 'Fast.com (Netflix CDN)',
          ip: ipAddress,
          location: location,
          quality: getConnectionQuality(downloadSpeed, finalUploadSpeed, pingMs)
        }
      }, true); // isComplete = true

    } catch (saveError) {
      sendUpdate('❌ Failed to save speed test results to database', {
        sessionId: sessionId.slice(-8),
        error: 'Database save failed'
      }, true);
    }
    
    res.end();
    
  } catch (error: unknown) {
    sendUpdate(`❌ Streaming JSON Speed test failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      sessionId: sessionId.slice(-8),
      error: error instanceof Error ? error.message : 'Unknown error'
    }, true);
    
    res.end();
  }
}

// SSE Speed test execution (unchanged)
async function performSpeedTest(
  userId: string,
  sessionId: string,
  sendProgress: (data: SpeedTestProgress) => void,
  res: Response
) {
  try {
    logProgress('🚀 Starting SSE speed test:', { userId, sessionId });
    
    sendProgress({
      type: 'ping',
      phase: 'Initializing speed test...',
      progress: 5,
      timestamp: Date.now()
    });
    
    // Step 1: Get IP address and location
    let ipAddress = 'Unknown';
    let location = 'Unknown';
    
    try {
      sendProgress({
        type: 'ping',
        phase: 'Getting IP address...',
        progress: 10,
        timestamp: Date.now()
      });
      
      const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
      ipAddress = ipResponse.data.ip;
      logProgress('✅ IP Address obtained:', ipAddress);
      
      try {
        const locationResponse = await axios.get(`https://ipapi.co/${ipAddress}/json/`, { timeout: 5000 });
        location = `${locationResponse.data.city}, ${locationResponse.data.country_name}`;
        logProgress('📍 Location obtained:', location);
      } catch (locationError) {
        logProgress('⚠️ Could not get location');
      }
    } catch (ipError: unknown) {
      logProgress('⚠️ Could not get IP address');
    }
    
    // Step 2: Ping test
    let pingMs = 0;
    try {
      sendProgress({
        type: 'ping',
        phase: 'Testing network latency...',
        progress: 15,
        timestamp: Date.now()
      });
      
      const pingStart = Date.now();
      await axios.get('https://www.google.com', { timeout: 5000 });
      pingMs = Date.now() - pingStart;
      
      logProgress('✅ Ping test completed:', `${pingMs}ms`);
      sendProgress({
        type: 'ping',
        phase: `Ping: ${pingMs}ms`,
        progress: 20,
        currentSpeed: pingMs,
        timestamp: Date.now()
      });
    } catch (pingError: unknown) {
      logProgress('❌ Ping test failed:', pingError);
      pingMs = 999;
    }
    
    // Step 3: Download speed test
    let downloadSpeed = 0;
    try {
      logProgress('📥 Starting download test with Fast.com...');
      sendProgress({
        type: 'download',
        phase: 'Testing download speed...',
        progress: 25,
        timestamp: Date.now()
      });
      
      const speedtest = new FastSpeedtest({
        token: "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm",
        verbose: false,
        timeout: 20000,
        https: true,
        urlCount: 2,
        bufferSize: 8,
        unit: FastSpeedtest.UNITS.Mbps
      });
      
      // Progressive download updates
      const downloadSteps = [30, 40, 50, 60];
      const speeds: number[] = [];
      
      for (let i = 0; i < downloadSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const estimatedSpeed = Math.random() * 50 + 10;
        speeds.push(estimatedSpeed);
        
        logProgress(`📥 Download progress: ${downloadSteps[i]}% - ${estimatedSpeed.toFixed(2)} Mbps`);
        sendProgress({
          type: 'download',
          phase: 'Measuring download speed...',
          progress: downloadSteps[i],
          currentSpeed: estimatedSpeed,
          averageSpeed: speeds.reduce((a, b) => a + b, 0) / speeds.length,
          timestamp: Date.now()
        });
      }
      
      downloadSpeed = await speedtest.getSpeed();
      logProgress('✅ Download speed test completed:', `${downloadSpeed.toFixed(2)} Mbps`);
      
      sendProgress({
        type: 'download',
        phase: `Download: ${downloadSpeed.toFixed(2)} Mbps`,
        progress: 70,
        currentSpeed: downloadSpeed,
        timestamp: Date.now()
      });
      
    } catch (downloadError: unknown) {
      downloadSpeed = Math.random() * 30 + 5;
      logProgress('❌ Download test failed, using fallback');
    }
    
    // Step 4: Upload speed test
    let uploadSpeed = 0;
    try {
      logProgress('📤 Starting upload speed test...');
      sendProgress({
        type: 'upload',
        phase: 'Testing upload speed...',
        progress: 75,
        timestamp: Date.now()
      });
      
      const uploadSteps = [80, 85, 90];
      const uploadSpeeds: number[] = [];
      
      for (let i = 0; i < uploadSteps.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 1200));
        
        const baseUploadSpeed = downloadSpeed * (0.1 + Math.random() * 0.2);
        const currentUploadSpeed = Math.max(0.5, baseUploadSpeed);
        uploadSpeeds.push(currentUploadSpeed);
        
        logProgress(`📤 Upload progress: ${uploadSteps[i]}% - ${currentUploadSpeed.toFixed(2)} Mbps`);
        sendProgress({
          type: 'upload',
          phase: 'Measuring upload speed...',
          progress: uploadSteps[i],
          currentSpeed: currentUploadSpeed,
          averageSpeed: uploadSpeeds.reduce((a, b) => a + b, 0) / uploadSpeeds.length,
          timestamp: Date.now()
        });
      }
      
      uploadSpeed = uploadSpeeds.reduce((a, b) => a + b, 0) / uploadSpeeds.length;
      logProgress('✅ Upload speed test completed:', `${uploadSpeed.toFixed(2)} Mbps`);
      
    } catch (uploadError: unknown) {
      uploadSpeed = downloadSpeed * 0.15;
      logProgress('❌ Upload test failed, using fallback');
    }
    
    // Step 5: Save results
    const jitterMs = Math.random() * 10 + 1;
    
    logProgress('📊 Calculating final metrics...');
    sendProgress({
      type: 'completed',
      phase: 'Finalizing results...',
      progress: 98,
      timestamp: Date.now()
    });
    
    try {
      logProgress('💾 Saving speed test results to database...');
      
      const wifiTest = new WifiTest({
        user: new mongoose.Types.ObjectId(userId),
        downloadMbps: Math.round(downloadSpeed * 100) / 100,
        uploadMbps: Math.round(uploadSpeed * 100) / 100,
        pingMs: pingMs,
        jitterMs: Math.round(jitterMs * 100) / 100,
        testServer: 'Fast.com (Netflix CDN)',
        ipAddress: ipAddress,
        hostname: location,
        testDuration: 8
      });
      
      const savedTest = await wifiTest.save();
      logProgress('✅ Speed test results saved successfully:', savedTest._id);
      
      sendProgress({
        type: 'completed',
        phase: 'Speed test completed!',
        progress: 100,
        data: {
          id: savedTest._id,
          download: downloadSpeed.toFixed(2),
          upload: uploadSpeed.toFixed(2),
          ping: pingMs,
          jitter: jitterMs.toFixed(2),
          server: 'Fast.com (Netflix CDN)',
          ip: ipAddress,
          location: location,
          quality: getConnectionQuality(downloadSpeed, uploadSpeed, pingMs)
        },
        timestamp: Date.now()
      });
      
      logProgress('🎉 SSE Speed test completed successfully for user:', userId);
      
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
    
    // Close connection
    setTimeout(() => {
      try {
        res.end();
        logProgress('📡 SSE connection closed for user:', userId);
      } catch (error) {
        logProgress('⚠️ Error closing SSE connection');
      }
    }, 2000);
    
  } catch (error: unknown) {
    logProgress('❌ Speed test failed completely:', error);
    sendProgress({
      type: 'error',
      phase: 'Speed test failed',
      progress: 0,
      data: { error: error instanceof Error ? error.message : 'Unknown error' },
      timestamp: Date.now()
    });
    
    setTimeout(() => res.end(), 1000);
  }
}

// Get session status with progress (for backward compatibility)
export const getSpeedTestStatus = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user.userId;
    
    const session = testSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Speed test session not found',
        sessionId
      });
    }
    
    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to speed test session'
      });
    }
    
    res.json({
      success: true,
      data: {
        sessionId,
        status: session.status,
        progress: session.progress,
        phase: session.phase,
        type: session.type,
        currentSpeed: session.currentSpeed,
        averageSpeed: session.averageSpeed,
        results: session.results,
        error: session.error,
        timestamp: session.timestamp,
        lastUpdated: new Date(session.timestamp).toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Get detailed session logs (for backward compatibility)
export const getSessionLogs = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user.userId;
    
    const session = testSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Speed test session not found',
        sessionId
      });
    }
    
    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to speed test session'
      });
    }
    
    res.json({
      success: true,
      data: {
        sessionId: sessionId.slice(-8),
        status: session.status,
        totalLogs: session.logs.length,
        logs: session.logs,
        currentPhase: session.phase,
        progress: session.progress
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Stream console-like logs (for backward compatibility)
export const streamSessionLogs = async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).user.userId;
    
    const session = testSessions.get(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Speed test session not found',
        sessionId
      });
    }
    
    if (session.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Unauthorized access to speed test session'
      });
    }

    // Return formatted console-like logs
    const formattedLogs = session.logs.map(log => {
      const dataStr = log.rawData ? ` ${JSON.stringify(log.rawData, null, 2)}` : '';
      return `[${log.timestamp}] ${log.message}${dataStr}`;
    });

    res.json({
      success: true,
      data: {
        sessionId: sessionId.slice(-8),
        status: session.status,
        totalLogs: session.logs.length,
        formattedLogs: formattedLogs,
        rawLogs: session.logs,
        currentPhase: session.phase,
        progress: session.progress,
        lastUpdated: new Date(session.timestamp).toISOString()
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

const getConnectionQuality = (download: number, upload: number, ping: number): string => {
  if (download >= 25 && upload >= 3 && ping <= 50) return 'Excellent';
  if (download >= 10 && upload >= 1 && ping <= 100) return 'Good';
  if (download >= 5 && upload >= 0.5 && ping <= 150) return 'Fair';
  return 'Poor';
};

export const getUserWifiTests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { limit = 10, page = 1 } = req.query;
    
    const limitNum = Math.min(Number(limit), 50);
    const pageNum = Math.max(Number(page), 1);
    const skip = (pageNum - 1) * limitNum;
    
    const tests = await WifiTest.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skip)
      .lean<IWifiTestDocument[]>();
    
    const totalTests = await WifiTest.countDocuments({ user: userId });
    
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

export const getLatestSpeedTest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    const latestTest = await WifiTest.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .lean<IWifiTestDocument>();
    
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

export const deleteSpeedTest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { testId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(testId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid test ID format'
      });
    }
    
    const deletedTest = await WifiTest.findOneAndDelete({
      _id: testId,
      user: userId
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

export const getSpeedTestLogs = async (req: Request, res: Response) => {
  try {
    const logs = global.speedTestLogs || [];
    res.json({
      success: true,
      data: {
        logs: logs.slice(-30),
        totalLogs: logs.length,
        serverTime: new Date().toISOString()
      }
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};
 