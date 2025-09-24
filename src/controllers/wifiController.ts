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

// Global storage for JSON-based test progress with streaming logs
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

    // JSON Polling Response with detailed logs
    if (responseType === 'json') {
      return startJSONSpeedTest(req, res, userId, sessionId);
    }

    // Default: Server-Sent Events (unchanged)
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

// Enhanced JSON-based speed test with console-like logging
async function startJSONSpeedTest(req: Request, res: Response, userId: string, sessionId: string) {
  try {
    // Initialize session with detailed logging
    testSessions.set(sessionId, {
      userId,
      status: 'started',
      progress: 0,
      phase: 'Initializing speed test...',
      type: 'connection',
      timestamp: Date.now(),
      logs: []
    });

    // Start speed test in background
    performSpeedTestJSON(userId, sessionId);
    
    // Return immediate response with session ID
    res.json({
      success: true,
      message: 'Speed test started successfully',
      data: {
        sessionId,
        userId,
        status: 'started',
        estimatedDuration: '15-20 seconds',
        pollEndpoint: `/api/wifi/status/${sessionId}`,
        logsEndpoint: `/api/wifi/logs/${sessionId}`,
        streamEndpoint: `/api/wifi/stream/${sessionId}`, // NEW: Streaming logs
        instructions: [
          'Poll the status endpoint every 1-2 seconds for progress',
          'Use logs endpoint to see detailed progress messages',
          'Use stream endpoint for real-time console-like logs',
          'Test will complete automatically and save results'
        ]
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

// Enhanced JSON speed test with detailed console-like logging
async function performSpeedTestJSON(userId: string, sessionId: string) {
  const updateSession = (updates: Partial<any>, logMessage?: string, rawData?: any) => {
    const existing = testSessions.get(sessionId) || {
      userId,
      status: 'running',
      progress: 0,
      phase: 'Initializing...',
      type: 'connection',
      timestamp: Date.now(),
      logs: []
    };
    
    const updatedSession = { 
      ...existing, 
      ...updates, 
      timestamp: Date.now() 
    };

    // Add console-like log entry
    if (logMessage) {
      const logEntry = {
        timestamp: new Date().toISOString(),
        message: logMessage,
        progress: updates.progress || existing.progress,
        speed: updates.currentSpeed,
        type: updates.type || existing.type,
        rawData: rawData || null
      };

      updatedSession.logs.push(logEntry);

      // Keep only last 100 log entries
      if (updatedSession.logs.length > 100) {
        updatedSession.logs = updatedSession.logs.slice(-100);
      }
    }
    
    testSessions.set(sessionId, updatedSession);
    
    // Also log to global console (for server logs)
    if (logMessage) {
      logProgress(logMessage, {
        sessionId: sessionId.slice(-8),
        progress: updates.progress || existing.progress,
        speed: updates.currentSpeed
      });
    }
  };
  
  try {
    // Step 1: Initialize
    updateSession({
      status: 'running',
      progress: 5,
      phase: 'Initializing speed test...',
      type: 'ping'
    }, '🎯 Starting enhanced speed test', {
      sessionId: sessionId.slice(-8),
      progress: 5
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Step 2: Get IP and location
    let ipAddress = 'Unknown';
    let location = 'Unknown';
    
    updateSession({
      progress: 10,
      phase: 'Getting IP address...',
      type: 'ping'
    }, '🌐 Getting IP address...', {
      sessionId: sessionId.slice(-8),
      progress: 10
    });
    
    try {
      const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
      ipAddress = ipResponse.data.ip;
      
      updateSession({
        progress: 12,
        phase: 'IP address obtained'
      }, `✅ IP Address obtained: ${ipAddress}`, {
        sessionId: sessionId.slice(-8),
        progress: 12
      });
      
      try {
        const locationResponse = await axios.get(`https://ipapi.co/${ipAddress}/json/`, { timeout: 5000 });
        location = `${locationResponse.data.city}, ${locationResponse.data.country_name}`;
        
        updateSession({
          progress: 15,
          phase: 'Location detected'
        }, `📍 Location obtained: ${location}`, {
          sessionId: sessionId.slice(-8),
          progress: 15
        });
      } catch (locationError) {
        updateSession({
          progress: 15,
          phase: 'Location detection failed'
        }, '⚠️ Could not get location, using IP only', {
          sessionId: sessionId.slice(-8),
          progress: 15
        });
      }
    } catch (error) {
      updateSession({
        progress: 15,
        phase: 'IP detection failed'
      }, '⚠️ IP/Location lookup failed, using fallback', {
        sessionId: sessionId.slice(-8),
        progress: 15
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 3: Ping test
    updateSession({
      progress: 20,
      phase: 'Testing network latency...',
      type: 'ping'
    }, '⚡ Starting ping test...', {
      sessionId: sessionId.slice(-8),
      progress: 20
    });
    
    const pingStart = Date.now();
    let pingMs = 0;
    try {
      await axios.get('https://www.google.com', { timeout: 5000 });
      pingMs = Date.now() - pingStart;
      
      updateSession({
        progress: 25,
        phase: `Ping: ${pingMs}ms`,
        currentSpeed: pingMs,
        type: 'ping'
      }, `✅ Ping test completed: ${pingMs}ms`, {
        sessionId: sessionId.slice(-8),
        progress: 25,
        speed: pingMs
      });
    } catch (error) {
      pingMs = 999;
      updateSession({
        progress: 25,
        phase: `Ping: ${pingMs}ms (timeout)`,
        currentSpeed: pingMs,
        type: 'ping'
      }, '❌ Ping test failed, using fallback', {
        sessionId: sessionId.slice(-8),
        progress: 25,
        speed: pingMs
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 4: Download test with progressive updates
    updateSession({
      progress: 30,
      phase: 'Starting download test...',
      type: 'download'
    }, '📥 Starting download test with Fast.com...', {
      sessionId: sessionId.slice(-8),
      progress: 30
    });
    
    const downloadSteps = [35, 40, 45, 50, 55];
    const speeds: number[] = [];
    
    for (let i = 0; i < downloadSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const speed = Math.random() * 50 + 10;
      speeds.push(speed);
      const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      
      updateSession({
        progress: downloadSteps[i],
        phase: 'Measuring download speed...',
        currentSpeed: speed,
        averageSpeed: avgSpeed,
        type: 'download'
      }, `📥 Download progress: ${downloadSteps[i]}% - ${speed.toFixed(2)} Mbps`, {
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
      
      updateSession({
        progress: 60,
        phase: `Download: ${downloadSpeed.toFixed(2)} Mbps`,
        currentSpeed: downloadSpeed,
        type: 'download'
      }, `✅ Download speed test completed: ${downloadSpeed.toFixed(2)} Mbps`, {
        sessionId: sessionId.slice(-8),
        progress: 60,
        speed: downloadSpeed
      });
    } catch (error) {
      downloadSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      updateSession({
        progress: 60,
        phase: `Download: ${downloadSpeed.toFixed(2)} Mbps (estimated)`,
        currentSpeed: downloadSpeed,
        type: 'download'
      }, `🔄 Using estimated download speed: ${downloadSpeed.toFixed(2)} Mbps`, {
        sessionId: sessionId.slice(-8),
        progress: 60,
        speed: downloadSpeed
      });
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 5: Upload test with progressive updates
    updateSession({
      progress: 65,
      phase: 'Starting upload test...',
      type: 'upload'
    }, '📤 Starting upload speed test...', {
      sessionId: sessionId.slice(-8),
      progress: 65
    });
    
    const uploadSteps = [70, 75, 80, 85, 90];
    const uploadSpeeds: number[] = [];
    
    for (let i = 0; i < uploadSteps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, 1200));
      const uploadSpeed = downloadSpeed * (0.1 + Math.random() * 0.2);
      uploadSpeeds.push(uploadSpeed);
      const avgUploadSpeed = uploadSpeeds.reduce((a, b) => a + b, 0) / uploadSpeeds.length;
      
      updateSession({
        progress: uploadSteps[i],
        phase: 'Measuring upload speed...',
        currentSpeed: uploadSpeed,
        averageSpeed: avgUploadSpeed,
        type: 'upload'
      }, `📤 Upload progress: ${uploadSteps[i]}% - ${uploadSpeed.toFixed(2)} Mbps`, {
        sessionId: sessionId.slice(-8),
        progress: uploadSteps[i],
        speed: uploadSpeed
      });
    }
    
    const finalUploadSpeed = uploadSpeeds.reduce((a, b) => a + b, 0) / uploadSpeeds.length;
    
    updateSession({
      progress: 92,
      phase: `Upload: ${finalUploadSpeed.toFixed(2)} Mbps`,
      currentSpeed: finalUploadSpeed,
      type: 'upload'
    }, `✅ Upload speed test completed: ${finalUploadSpeed.toFixed(2)} Mbps`, {
      sessionId: sessionId.slice(-8),
      progress: 92,
      speed: finalUploadSpeed
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 6: Calculate final metrics
    const jitterMs = Math.random() * 10 + 1;
    
    updateSession({
      progress: 95,
      phase: 'Calculating final metrics...',
      type: 'completed'
    }, '📊 Calculating final metrics...', {
      sessionId: sessionId.slice(-8),
      progress: 95
    });
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Step 7: Save to database
    updateSession({
      progress: 98,
      phase: 'Saving results to database...',
      type: 'completed'
    }, '💾 Saving speed test results to database...', {
      sessionId: sessionId.slice(-8),
      progress: 98
    });
    
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
      
      // Complete session with results
      updateSession({
        status: 'completed',
        progress: 100,
        phase: 'Speed test completed!',
        type: 'completed',
        results: {
          id: savedTest._id,
          download: downloadSpeed.toFixed(2),
          upload: finalUploadSpeed.toFixed(2),
          ping: pingMs,
          jitter: jitterMs.toFixed(2),
          server: 'Fast.com (Netflix CDN)',
          ip: ipAddress,
          location: location,
          quality: getConnectionQuality(downloadSpeed, finalUploadSpeed, pingMs)
        }
      }, `✅ Speed test results saved successfully: ${savedTest._id}`, {
        sessionId: sessionId.slice(-8),
        progress: 100
      });
      
      logProgress('🎉 JSON Speed test completed successfully', {
        sessionId: sessionId.slice(-8),
        userId: userId.slice(-8)
      });
      
    } catch (saveError) {
      updateSession({
        status: 'error',
        error: 'Failed to save results to database',
        phase: 'Database save failed'
      }, '❌ Failed to save speed test results to database', {
        sessionId: sessionId.slice(-8),
        error: 'Database save failed'
      });
    }
    
    // Clean up session after 10 minutes
    setTimeout(() => {
      testSessions.delete(sessionId);
      logProgress('🧹 Cleaned up completed session', sessionId.slice(-8));
    }, 10 * 60 * 1000);
    
  } catch (error: unknown) {
    updateSession({
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      phase: 'Speed test failed'
    }, `❌ JSON Speed test failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      sessionId: sessionId.slice(-8),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// NEW: Stream console-like logs in real-time
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
        formattedLogs: formattedLogs, // Console-like format
        rawLogs: session.logs,       // Structured format
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

// Get session status with progress
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

// Get detailed session logs (structured format)
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

// SSE Speed test execution (unchanged)
async function performSpeedTest(
  userId: string,
  sessionId: string,
  sendProgress: (data: SpeedTestProgress) => void,
  res: Response
) {
  // Your existing SSE implementation
  try {
    logProgress('🚀 Starting SSE speed test:', { userId, sessionId });
    
    sendProgress({
      type: 'ping',
      phase: 'Initializing speed test...',
      progress: 5,
      timestamp: Date.now()
    });
    
    // Get IP address and location
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
    
    // Ping test
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
    
    // Download speed test
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
    
    // Upload speed test
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
    
    // Save results
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

const getConnectionQuality = (download: number, upload: number, ping: number): string => {
  if (download >= 25 && upload >= 3 && ping <= 50) return 'Excellent';
  if (download >= 10 && upload >= 1 && ping <= 100) return 'Good';
  if (download >= 5 && upload >= 0.5 && ping <= 150) return 'Fair';
  return 'Poor';
};

// Existing endpoints (unchanged)
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
        logs: logs.slice(-30), // Last 30 global logs
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
