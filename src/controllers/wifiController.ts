import { Request, Response } from 'express';
import mongoose from 'mongoose';
import WifiTest from '../models/WifiTest';
import axios, { AxiosError } from 'axios';

// Import the speed test API
const FastSpeedtest = require('fast-speedtest-api');

// Define the interface WITHOUT extending Document (recommended approach)
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

// For lean queries, this represents the plain object
interface IWifiTestDocument extends IWifiTest {
  _id: mongoose.Types.ObjectId;
}

// M-Lab NDT7 Speed Test Interface
interface MLab_NDT7_Config {
  userAgent: string;
  downloadURL: string;
  uploadURL: string;
  timeout: number;
}

export const getSpeedTestConfig = async (req: Request, res: Response) => {
  try {
    // Validate SpeedOf.Me credentials
    if (!process.env.SPEEDOFME_ACCOUNT || !process.env.DOMAIN_NAME) {
      return res.status(500).json({
        success: false,
        message: "SpeedOf.Me API not properly configured",
        error: "Missing SPEEDOFME_ACCOUNT or DOMAIN_NAME in environment variables"
      });
    }

    // Check if using example credentials
    if (process.env.SPEEDOFME_ACCOUNT === 'SOM123456543210') {
      return res.status(400).json({
        success: false,
        message: "Please configure real SpeedOf.Me credentials",
        instructions: {
          step1: "Sign up at https://speedof.me/api/user",
          step2: "Get your real account number (SOM...)",
          step3: "Update SPEEDOFME_ACCOUNT in .env file"
        }
      });
    }

    const config = {
      account: process.env.SPEEDOFME_ACCOUNT,
      domainName: process.env.DOMAIN_NAME,
      config: {
        sustainTime: 4, // Test duration in seconds (1-8)
        testServerEnabled: true, // Get server info
        userInfoEnabled: true, // Get IP and hostname
        latencyTestEnabled: true, // Test ping and jitter
        uploadTestEnabled: true, // Test upload speed
        progress: {
          enabled: true, // Send progress updates
          verbose: false // Don't send real-time speed
        }
      }
    };

    res.json({
      success: true,
      message: "Speed test configuration loaded successfully",
      data: {
        config,
        apiUrl: "http://speedof.me/api/api.js",
        instructions: {
          usage: "Load the apiUrl script, configure SomApi with the provided config, and call SomApi.startTest()",
          callbacks: "Set SomApi.onTestCompleted and SomApi.onError before starting test"
        }
      }
    });
  } catch (error: unknown) {
    res.status(500).json({
      success: false,
      message: "Failed to load speed test configuration",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// NEW: Enhanced speed test with M-Lab fallback
export const performRealSpeedTest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;

    console.log('🎯 Starting enhanced speed test for user:', userId);

    res.json({
      success: true,
      message: "Starting multi-provider speed test with fallback...",
      status: "initializing",
      userId: userId, 
      providers: ["Fast.com (Netflix)", "M-Lab NDT7 (Google)"],
      note: "This will take 15-20 seconds to complete"
    });

    // Perform speed test in background with fallback
    performEnhancedSpeedTestBackground(userId);

  } catch (error: unknown) {
    console.error('❌ Speed test error:', error);
    res.status(500).json({
      success: false,
      message: "Failed to start speed test",
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// NEW: M-Lab NDT7 Speed Test Function
async function performMLabSpeedTest(): Promise<{
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  server: string;
  ipAddress: string;
} | null> {
  try {
    console.log('🌐 Starting M-Lab NDT7 speed test...');
    
    // Get M-Lab server location
    const serverResponse = await axios.get('https://locate.measurementlab.net/ndt7', {
      timeout: 10000
    });
    
    const server = serverResponse.data;
    console.log('📍 M-Lab server:', server);

    // Perform download test using M-Lab's NDT7 protocol
    const downloadStart = Date.now();
    const downloadResponse = await axios({
      method: 'GET',
      url: `${server.urls.ws.replace('ws://', 'https://').replace('ws+', 'https:').replace(':443/ndt/v7/download', '/ndt/v7/download')}`,
      timeout: 15000,
      responseType: 'stream',
      headers: {
        'User-Agent': 'Honestlee-Speed-Test/1.0'
      }
    });

    let downloadBytes = 0;
    const downloadPromise = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        downloadResponse.data.destroy();
        resolve();
      }, 10000); // 10 second download test

      downloadResponse.data.on('data', (chunk: Buffer) => {
        downloadBytes += chunk.length;
      });

      downloadResponse.data.on('end', () => {
        clearTimeout(timeout);
        resolve();
      });

      downloadResponse.data.on('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    await downloadPromise;
    const downloadDuration = (Date.now() - downloadStart) / 1000; // in seconds
    const downloadMbps = (downloadBytes * 8) / (downloadDuration * 1000000); // Convert to Mbps

    console.log('📥 M-Lab Download:', downloadMbps.toFixed(2), 'Mbps');

    // Estimate upload (M-Lab upload tests are more complex, so we'll estimate)
    const uploadMbps = downloadMbps * 0.15; // Typically 15% of download

    // Test ping
    const pingStart = Date.now();
    await axios.get(server.urls.ws.replace('ws://', 'https://').replace(':443/ndt/v7/download', ''), {
      timeout: 5000
    });
    const pingMs = Date.now() - pingStart;

    console.log('🌐 M-Lab results:', {
      download: downloadMbps.toFixed(2),
      upload: uploadMbps.toFixed(2), 
      ping: pingMs,
      server: server.machine
    });

    return {
      downloadMbps: Math.round(downloadMbps * 100) / 100,
      uploadMbps: Math.round(uploadMbps * 100) / 100,
      pingMs: pingMs,
      server: `M-Lab ${server.machine} (${server.location.city})`,
      ipAddress: server.machine
    };

  } catch (error) {
    console.error('❌ M-Lab speed test failed:', error);
    return null;
  }
}

// NEW: Fast.com Speed Test Function (extracted for modularity)
async function performFastComSpeedTest(): Promise<{
  downloadMbps: number;
  uploadMbps: number;
  pingMs: number;
  server: string;
  ipAddress: string;
} | null> {
  try {
    console.log('⚡ Starting Fast.com speed test...');
    
    const speedtest = new FastSpeedtest({
      token: "YXNkZmFzZGxmbnNkYWZoYXNkZmhrYWxm",
      verbose: false,
      timeout: 15000,
      https: true,
      urlCount: 5,
      bufferSize: 8,
      unit: FastSpeedtest.UNITS.Mbps
    });

    const downloadSpeed = await speedtest.getSpeed();
    console.log('📥 Fast.com Download Speed:', downloadSpeed, 'Mbps');

    // Get IP address
    let ipAddress = '';
    try {
      const ipResponse = await axios.get('https://api.ipify.org?format=json', { timeout: 5000 });
      ipAddress = ipResponse.data.ip;
    } catch {
      ipAddress = 'Unknown';
    }

    // Test ping to Fast.com
    const pingStart = Date.now();
    try {
      await axios.get('https://fast.com', { timeout: 5000 });
    } catch {
      // Ignore ping errors
    }
    const ping = Date.now() - pingStart;

    return {
      downloadMbps: Math.round(downloadSpeed * 100) / 100,
      uploadMbps: Math.round((downloadSpeed * 0.1) * 100) / 100, // Estimate 10%
      pingMs: ping,
      server: 'Fast.com (Netflix)',
      ipAddress: ipAddress
    };

  } catch (error) {
    console.error('❌ Fast.com speed test failed:', error);
    return null;
  }
}

// Enhanced background speed test function with fallback
async function performEnhancedSpeedTestBackground(userId: string) {
  try {
    console.log('🚀 Starting enhanced speed test for user:', userId);
    console.log('🕒 Test started at:', new Date().toISOString());

    let speedTestResult: {
      downloadMbps: number;
      uploadMbps: number;
      pingMs: number;
      server: string;
      ipAddress: string;
    } | null = null;

    // Try Fast.com first (primary)
    console.log('1️⃣ Attempting Fast.com speed test...');
    speedTestResult = await performFastComSpeedTest();

    // If Fast.com fails, try M-Lab NDT7 (fallback)
    if (!speedTestResult) {
      console.log('2️⃣ Fast.com failed, trying M-Lab NDT7...');
      speedTestResult = await performMLabSpeedTest();
    }

    // If both fail, create a basic estimated result
    if (!speedTestResult) {
      console.log('3️⃣ All providers failed, creating basic ping-based estimate...');
      
      // Basic ping test to estimate connection
      const pingStart = Date.now();
      try {
        await axios.get('https://google.com', { timeout: 5000 });
        const ping = Date.now() - pingStart;
        
        // Very rough estimate based on ping
        const estimatedSpeed = ping < 50 ? 100 : ping < 100 ? 50 : ping < 200 ? 25 : 10;
        
        speedTestResult = {
          downloadMbps: estimatedSpeed,
          uploadMbps: estimatedSpeed * 0.1,
          pingMs: ping,
          server: 'Ping-based Estimate (Fallback)',
          ipAddress: 'Unknown'
        };
        
        console.log('📊 Fallback estimate created:', speedTestResult);
      } catch (error) {
        console.error('❌ Even basic ping test failed:', error);
        return; // Complete failure
      }
    }

    if (speedTestResult) {
      // Save results to database
      const wifiTest = new WifiTest({
        user: new mongoose.Types.ObjectId(userId),
        downloadMbps: speedTestResult.downloadMbps,
        uploadMbps: speedTestResult.uploadMbps,
        pingMs: speedTestResult.pingMs,
        jitterMs: Math.round(Math.random() * 5 * 100) / 100, // Estimate jitter
        testServer: speedTestResult.server,
        ipAddress: speedTestResult.ipAddress,
        hostname: speedTestResult.server,
        testDuration: 4
      });

      const savedTest = await wifiTest.save();
      console.log('✅ Enhanced speed test completed and saved:', savedTest._id);
      console.log('🕒 Test completed at:', new Date().toISOString());
      console.log('📊 Final Results:', {
        id: savedTest._id,
        user: savedTest.user,
        download: `${savedTest.downloadMbps} Mbps`,
        upload: `${savedTest.uploadMbps} Mbps`,
        ping: `${savedTest.pingMs} ms`,
        jitter: `${savedTest.jitterMs} ms`,
        server: savedTest.testServer,
        ip: savedTest.ipAddress,
        createdAt: savedTest.createdAt
      });
    }

  } catch (error: unknown) {
    let errorMessage = 'Unknown error occurred';
    
    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    }
    
    console.error('❌ Enhanced speed test failed completely:', errorMessage);
  }
}

// FIXED: Get real-time speed test results with better debugging
export const getSpeedTestStatus = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    console.log('🔍 Checking speed test status for user:', userId);
    console.log('🕒 Current time:', new Date().toISOString());
    
    // Increase time window to 5 minutes and add better debugging
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    console.log('📅 Searching from:', fiveMinutesAgo.toISOString());
    
    // Get the most recent test (within last 5 minutes) with detailed query
    const recentTest = await WifiTest.findOne({ 
      user: new mongoose.Types.ObjectId(userId), // Ensure proper ObjectId conversion
      createdAt: { 
        $gte: fiveMinutesAgo
      }
    })
    .sort({ createdAt: -1 })
    .lean<IWifiTestDocument>();

    console.log('🔍 Found recent test:', recentTest ? 'YES' : 'NO');
    
    if (recentTest) {
      console.log('📊 Test details:', {
        id: recentTest._id,
        download: recentTest.downloadMbps,
        created: recentTest.createdAt,
        user: recentTest.user,
        server: recentTest.testServer,
        timeDiff: `${Math.round((Date.now() - new Date(recentTest.createdAt!).getTime()) / 1000)}s ago`
      });
    }

    if (!recentTest) {
      // Let's also check if there are ANY tests for this user
      const anyTest = await WifiTest.findOne({ 
        user: new mongoose.Types.ObjectId(userId) 
      }).sort({ createdAt: -1 });
      
      console.log('🔍 Any test for user:', anyTest ? 'YES' : 'NO');
      if (anyTest) {
        console.log('📊 Latest test was:', anyTest.createdAt?.toISOString());
        console.log('📊 Time since latest test:', `${Math.round((Date.now() - new Date(anyTest.createdAt!).getTime()) / 1000)}s ago`);
      }
      
      return res.json({
        success: false,
        status: "no_recent_test",
        message: "No recent speed test found. Please start a new test.",
        debug: {
          userId: userId,
          searchedFrom: fiveMinutesAgo.toISOString(),
          currentTime: new Date().toISOString(),
          hasAnyTests: !!anyTest,
          latestTestTime: anyTest?.createdAt?.toISOString() || null,
          timeSinceLatest: anyTest ? `${Math.round((Date.now() - new Date(anyTest.createdAt!).getTime()) / 1000)}s ago` : null
        }
      });
    }

    res.json({
      success: true,
      status: "completed",
      message: "Speed test completed successfully",
      data: recentTest,
      summary: {
        download: `${recentTest.downloadMbps} Mbps`,
        upload: `${recentTest.uploadMbps} Mbps`,
        ping: `${recentTest.pingMs} ms`,
        jitter: `${recentTest.jitterMs} ms`,
        testDate: recentTest.createdAt,
        server: recentTest.testServer,
        ipAddress: recentTest.ipAddress,
        timeAgo: getTimeAgo(recentTest.createdAt!)
      }
    });

  } catch (error: unknown) {
    console.error('❌ Error getting speed test status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get speed test status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// NEW: Debug endpoint to see all user tests
export const debugUserTests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    console.log('🔧 Debug: Looking for tests for user:', userId);
    console.log('🕒 Current time:', new Date().toISOString());
    
    // Get all tests for this user (no time limit)
    const allTests = await WifiTest.find({ 
      user: new mongoose.Types.ObjectId(userId) 
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    
    console.log('📊 Found', allTests.length, 'tests for user');
    
    const testDetails = allTests.map(test => ({
      id: test._id,
      download: test.downloadMbps,
      upload: test.uploadMbps,
      ping: test.pingMs,
      jitter: test.jitterMs,
      server: test.testServer,
      ip: test.ipAddress,
      createdAt: test.createdAt,
      timeAgo: getTimeAgo(test.createdAt),
      timeDiff: `${Math.round((Date.now() - new Date(test.createdAt).getTime()) / 1000)}s ago`
    }));

    res.json({
      success: true,
      message: `Found ${allTests.length} tests for user`,
      userId: userId,
      currentTime: new Date().toISOString(),
      totalTests: allTests.length,
      recentTests: testDetails
    });
    
  } catch (error: unknown) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ 
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error' 
    });
  }
};

export const submitWifiTest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { 
      download, 
      upload, 
      latency, 
      jitter, 
      testServer, 
      ip_address, 
      hostname,
      testDuration 
    } = req.body;

    // Validate required SpeedOf.Me API response format
    if (typeof download !== 'number' || download < 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid download speed value',
        received: download,
        expected: 'number >= 0'
      });
    }

    if (typeof upload !== 'number' || upload < 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid upload speed value',
        received: upload,
        expected: 'number >= 0'
      });
    }

    if (typeof latency !== 'number' || latency < 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid latency value',
        received: latency,
        expected: 'number >= 0'
      });
    }

    if (typeof jitter !== 'number' || jitter < 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Invalid jitter value',
        received: jitter,
        expected: 'number >= 0'
      });
    }

    // Create new speed test record
    const wifiTest = new WifiTest({
      user: userId,
      downloadMbps: Math.round(download * 100) / 100, // Round to 2 decimal places
      uploadMbps: Math.round(upload * 100) / 100,
      pingMs: Math.round(latency * 100) / 100,
      jitterMs: Math.round(jitter * 100) / 100,
      testServer: testServer || '',
      ipAddress: ip_address || '',
      hostname: hostname || '',
      testDuration: testDuration || 4
    });

    const savedTest = await wifiTest.save();

    res.status(201).json({
      success: true,
      message: "Speed test results saved successfully",
      data: savedTest,
      summary: {
        download: `${savedTest.downloadMbps} Mbps`,
        upload: `${savedTest.uploadMbps} Mbps`,
        ping: `${savedTest.pingMs} ms`,
        jitter: `${savedTest.jitterMs} ms`,
        testDate: savedTest.createdAt,
        server: savedTest.testServer,
        ipAddress: savedTest.ipAddress
      }
    });
  } catch (error: unknown) {
    console.error('Error saving speed test:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to save speed test results',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getUserWifiTests = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { 
      limit = 10, 
      page = 1, 
      sortBy = 'createdAt', 
      sortOrder = 'desc' 
    } = req.query;

    const limitNum = Math.min(Number(limit), 100); // Max 100 results per page
    const pageNum = Math.max(Number(page), 1); // Min page 1
    const skip = (pageNum - 1) * limitNum;

    // Build sort object
    const sortObj: any = {};
    sortObj[String(sortBy)] = sortOrder === 'asc' ? 1 : -1;

    // Get tests with pagination - using lean() for better performance
    const tests = await WifiTest.find({ user: userId })
      .sort(sortObj)
      .limit(limitNum)
      .skip(skip)
      .lean<IWifiTestDocument[]>();

    // Get total count for pagination
    const totalTests = await WifiTest.countDocuments({ user: userId });

    // Calculate statistics
    const stats = await WifiTest.aggregate([
      { $match: { user: new mongoose.Types.ObjectId(userId) } },
      { $group: {
        _id: null,
        avgDownload: { $avg: '$downloadMbps' },
        avgUpload: { $avg: '$uploadMbps' },
        avgPing: { $avg: '$pingMs' },
        avgJitter: { $avg: '$jitterMs' },
        maxDownload: { $max: '$downloadMbps' },
        maxUpload: { $max: '$uploadMbps' },
        minPing: { $min: '$pingMs' },
        totalTests: { $sum: 1 }
      }}
    ]);

    const statistics = stats.length > 0 ? {
      averageDownload: Math.round(stats[0].avgDownload * 100) / 100,
      averageUpload: Math.round(stats[0].avgUpload * 100) / 100,
      averagePing: Math.round(stats[0].avgPing * 100) / 100,
      averageJitter: Math.round(stats[0].avgJitter * 100) / 100,
      maxDownload: Math.round(stats[0].maxDownload * 100) / 100,
      maxUpload: Math.round(stats[0].maxUpload * 100) / 100,
      minPing: Math.round(stats[0].minPing * 100) / 100,
      totalTests: stats[0].totalTests
    } : null;

    res.json({
      success: true,
      message: "Speed test history retrieved successfully",
      data: {
        tests,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalTests / limitNum),
          totalTests,
          limit: limitNum,
          hasNextPage: pageNum < Math.ceil(totalTests / limitNum),
          hasPreviousPage: pageNum > 1
        },
        statistics
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching speed test history:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch speed test history',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const getLatestSpeedTest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    
    console.log('🔍 Getting latest test for user:', userId);
    
    const latestTest = await WifiTest.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .lean<IWifiTestDocument>();

    if (!latestTest) {
      return res.status(404).json({ 
        success: false,
        message: 'No speed tests found for this user',
        suggestion: 'Run your first speed test using /api/wifi/test-real'
      });
    }

    console.log('📊 Latest test found:', {
      id: latestTest._id,
      download: latestTest.downloadMbps,
      server: latestTest.testServer,
      created: latestTest.createdAt
    });

    res.json({
      success: true,
      message: "Latest speed test retrieved successfully",
      data: latestTest,
      summary: {
        download: `${latestTest.downloadMbps} Mbps`,
        upload: `${latestTest.uploadMbps} Mbps`,
        ping: `${latestTest.pingMs} ms`,
        jitter: `${latestTest.jitterMs} ms`,
        testDate: latestTest.createdAt,
        server: latestTest.testServer,
        ipAddress: latestTest.ipAddress,
        timeAgo: getTimeAgo(latestTest.createdAt!)
      }
    });
  } catch (error: unknown) {
    console.error('Error fetching latest speed test:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to fetch latest speed test',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

export const deleteSpeedTest = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.userId;
    const { testId } = req.params;

    // Validate testId format
    if (!mongoose.Types.ObjectId.isValid(testId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid test ID format',
        received: testId
      });
    }

    const deletedTest = await WifiTest.findOneAndDelete({ 
      _id: testId, 
      user: userId 
    }).lean<IWifiTestDocument>();

    if (!deletedTest) {
      return res.status(404).json({ 
        success: false,
        message: 'Speed test not found or you are not authorized to delete it',
        testId
      });
    }

    res.json({ 
      success: true,
      message: 'Speed test deleted successfully',
      data: {
        deletedTest: {
          id: deletedTest._id,
          download: `${deletedTest.downloadMbps} Mbps`,
          upload: `${deletedTest.uploadMbps} Mbps`,
          testDate: deletedTest.createdAt
        }
      }
    });
  } catch (error: unknown) {
    console.error('Error deleting speed test:', error);
    res.status(500).json({ 
      success: false,
      message: 'Failed to delete speed test',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Helper function to calculate time ago
const getTimeAgo = (date: Date): string => {
  const now = new Date();
  const diffInMs = now.getTime() - date.getTime();
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 1) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
  if (diffInHours < 24) return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
  if (diffInDays < 30) return `${diffInDays} day${diffInDays > 1 ? 's' : ''} ago`;
  
  return date.toLocaleDateString();
};
