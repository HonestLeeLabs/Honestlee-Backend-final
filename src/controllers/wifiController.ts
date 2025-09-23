import { Request, Response } from 'express';
import mongoose from 'mongoose';
import WifiTest from '../models/WifiTest';

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
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to load speed test configuration",
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
  } catch (error) {
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
  } catch (error) {
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
    
    const latestTest = await WifiTest.findOne({ user: userId })
      .sort({ createdAt: -1 })
      .lean<IWifiTestDocument>();

    if (!latestTest) {
      return res.status(404).json({ 
        success: false,
        message: 'No speed tests found for this user',
        suggestion: 'Run your first speed test using /api/wifi/config'
      });
    }

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
  } catch (error) {
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
  } catch (error) {
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
