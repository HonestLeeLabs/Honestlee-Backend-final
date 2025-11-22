import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { AuthRequest } from '../middlewares/authMiddleware';
import WifiSpeedTest from '../models/WifiSpeedTest';
import AgentVenueTemp from '../models/AgentVenueTemp';
import Venue from '../models/Venue';

/**
 * POST /api/wifi-speed/test
 * Submit a new WiFi speed test result
 */
export const submitSpeedTest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const {
      venueId,
      tempVenueId,
      downloadMbps,
      uploadMbps,
      latencyMs,
      jitterMs,
      packetLoss,
      connectionType,
      ssid,
      bssid,
      signalStrength,
      frequency,
      deviceInfo,
      testMethod,
      testServer,
      location,
      zoneId,
      zoneName,
      notes
    } = req.body;

    // Validation
    if (!venueId && !tempVenueId) {
      return res.status(400).json({
        success: false,
        message: 'Either venueId or tempVenueId is required'
      });
    }

    if (!downloadMbps || !uploadMbps || !latencyMs) {
      return res.status(400).json({
        success: false,
        message: 'Download speed, upload speed, and latency are required'
      });
    }

    // Get region from user or venue
    const region = req.user.region || 'th';

    // Auto-detect device info if not provided
    const finalDeviceInfo = deviceInfo || {
      model: 'Unknown',
      os: 'Unknown',
      browser: 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown'
    };

    // Create speed test
    const testId = `SPEED-${uuidv4().substring(0, 8).toUpperCase()}`;

    const speedTest = new WifiSpeedTest({
      testId,
      venueId,
      tempVenueId,
      userId: req.user.userId,
      userRole: req.user.role,
      downloadMbps: parseFloat(downloadMbps),
      uploadMbps: parseFloat(uploadMbps),
      latencyMs: parseInt(latencyMs),
      jitterMs: jitterMs ? parseInt(jitterMs) : undefined,
      packetLoss: packetLoss ? parseFloat(packetLoss) : undefined,
      connectionType: connectionType || 'unknown',
      ssid,
      bssid,
      signalStrength: signalStrength ? parseInt(signalStrength) : undefined,
      frequency,
      deviceInfo: finalDeviceInfo,
      testMethod: testMethod || 'manual',
      testServer,
      location,
      zoneId,
      zoneName,
      timestamp: new Date(),
      notes,
      region,
      isReliable: true
    });

    await speedTest.save();

    console.log(`✅ Speed test saved: ${testId} - ${downloadMbps}/${uploadMbps} Mbps`);

    // Update venue with latest speed test stats
    if (tempVenueId) {
      await AgentVenueTemp.findOneAndUpdate(
        { tempVenueId },
        {
          $set: {
            'wifiData.latestSpeedTest': {
              downloadMbps: speedTest.downloadMbps,
              uploadMbps: speedTest.uploadMbps,
              latencyMs: speedTest.latencyMs,
              qualityScore: speedTest.qualityScore,
              category: speedTest.category,
              testedAt: speedTest.timestamp
            },
            'wifiData.hasSpeedTest': true
          }
        }
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Speed test submitted successfully',
      data: speedTest
    });

  } catch (error: any) {
    console.error('❌ Error submitting speed test:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to submit speed test',
      error: error.message
    });
  }
};

/**
 * GET /api/wifi-speed/venue/:venueId
 * Get all speed tests for a venue
 */
export const getVenueSpeedTests = async (req: AuthRequest, res: Response) => {
  try {
    const { venueId } = req.params;
    const { limit = '50', sortBy = 'timestamp', order = 'desc' } = req.query;

    const query: any = {};
    
    if (venueId.startsWith('TEMP-')) {
      query.tempVenueId = venueId;
    } else {
      query.venueId = venueId;
    }

    const tests = await WifiSpeedTest.find(query)
      .populate('userId', 'name email')
      .sort({ [sortBy as string]: order === 'desc' ? -1 : 1 })
      .limit(parseInt(limit as string))
      .lean();

    // Calculate statistics
    if (tests.length > 0) {
      const avgDownload = tests.reduce((sum, t) => sum + t.downloadMbps, 0) / tests.length;
      const avgUpload = tests.reduce((sum, t) => sum + t.uploadMbps, 0) / tests.length;
      const avgLatency = tests.reduce((sum, t) => sum + t.latencyMs, 0) / tests.length;
      const avgQuality = tests.reduce((sum, t) => sum + (t.qualityScore || 0), 0) / tests.length;

      return res.json({
        success: true,
        data: tests,
        count: tests.length,
        statistics: {
          averageDownloadMbps: Math.round(avgDownload * 10) / 10,
          averageUploadMbps: Math.round(avgUpload * 10) / 10,
          averageLatencyMs: Math.round(avgLatency),
          averageQualityScore: Math.round(avgQuality),
          maxDownloadMbps: Math.max(...tests.map(t => t.downloadMbps)),
          minDownloadMbps: Math.min(...tests.map(t => t.downloadMbps)),
          totalTests: tests.length
        }
      });
    }

    return res.json({
      success: true,
      data: [],
      count: 0
    });

  } catch (error: any) {
    console.error('❌ Error fetching speed tests:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch speed tests',
      error: error.message
    });
  }
};

/**
 * GET /api/wifi-speed/my-tests
 * Get current user's speed test history
 */
export const getMySpeedTests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { limit = '20' } = req.query;

    const tests = await WifiSpeedTest.find({ userId: req.user.userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit as string))
      .lean();

    return res.json({
      success: true,
      data: tests,
      count: tests.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching user tests:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch tests',
      error: error.message
    });
  }
};

/**
 * DELETE /api/wifi-speed/test/:testId
 * Delete a speed test
 */
export const deleteSpeedTest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { testId } = req.params;

    const test = await WifiSpeedTest.findOne({ testId });

    if (!test) {
      return res.status(404).json({
        success: false,
        message: 'Speed test not found'
      });
    }

    // Only allow user who created the test or admins to delete
    if (test.userId.toString() !== req.user.userId && req.user.role !== 'ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this test'
      });
    }

    await WifiSpeedTest.deleteOne({ testId });

    return res.json({
      success: true,
      message: 'Speed test deleted successfully'
    });

  } catch (error: any) {
    console.error('❌ Error deleting speed test:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete speed test',
      error: error.message
    });
  }
};
