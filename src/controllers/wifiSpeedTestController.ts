import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import WifiSpeedTest from '../models/WifiSpeedTest';
import AgentVenueTemp from '../models/AgentVenueTemp';
import { AuthRequest } from '../middlewares/authMiddleware';

export const submitSpeedTest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
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
      deviceInfo,
      testMethod,
      testServer,
      location,
      notes,
      ssid,
      bssid,
      signalStrength,
      frequency,
      zoneId,
      zoneName
    } = req.body;

    console.log('📥 Received speed test submission:', {
      venueId,
      tempVenueId,
      downloadMbps,
      uploadMbps,
      latencyMs
    });

    // Validate
    if (!venueId && !tempVenueId) {
      return res.status(400).json({
        success: false,
        message: 'Either venueId or tempVenueId is required'
      });
    }

    if (downloadMbps === undefined || uploadMbps === undefined || latencyMs === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Speed test metrics (downloadMbps, uploadMbps, latencyMs) are required'
      });
    }

    // Get region
    let finalVenueId = venueId;
    let region = req.user.region || 'th';

    // If using tempVenueId, verify venue exists
    if (tempVenueId && !venueId) {
      const tempVenue = await AgentVenueTemp.findOne({ tempVenueId });
      
      if (!tempVenue) {
        return res.status(404).json({
          success: false,
          message: 'Venue not found'
        });
      }

      finalVenueId = tempVenue.venueId?.toString() || tempVenueId;
      region = tempVenue.region || region;
    }

    // ✅ FIX: Convert userId to ObjectId if it's a string
    const userIdValue = typeof req.user.userId === 'string' 
      ? new mongoose.Types.ObjectId(req.user.userId)
      : req.user.userId;

    // Create speed test
    const speedTest = new WifiSpeedTest({
      testId: uuidv4(),
      venueId: finalVenueId,
      tempVenueId: tempVenueId || undefined,
      userId: userIdValue, // ✅ FIXED
      userRole: req.user.role,
      downloadMbps: parseFloat(downloadMbps),
      uploadMbps: parseFloat(uploadMbps),
      latencyMs: parseInt(latencyMs),
      jitterMs: jitterMs ? parseFloat(jitterMs) : undefined,
      packetLoss: packetLoss ? parseFloat(packetLoss) : undefined,
      connectionType: connectionType || 'wifi',
      ssid,
      bssid,
      signalStrength,
      frequency,
      deviceInfo: deviceInfo || { model: 'Unknown', os: 'Unknown', browser: 'Unknown' },
      testMethod: testMethod || 'ndt7',
      testServer,
      location,
      zoneId,
      zoneName,
      notes,
      isReliable: true,
      region,
      timestamp: new Date()
    });

    await speedTest.save();

    // Update venue wifiData
    if (tempVenueId) {
      await AgentVenueTemp.findOneAndUpdate(
        { tempVenueId },
        {
          $set: {
            'wifiData.hasSpeedTest': true,
            'wifiData.latestSpeedTest': {
              downloadMbps: speedTest.downloadMbps,
              uploadMbps: speedTest.uploadMbps,
              latencyMs: speedTest.latencyMs,
              qualityScore: speedTest.qualityScore,
              category: speedTest.category,
              testedAt: speedTest.timestamp,
              testedBy: req.user.userId
            }
          }
        }
      );
    }

    console.log(`✅ WiFi speed test saved: ${speedTest.testId}`);

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

export const getVenueSpeedTests = async (req: AuthRequest, res: Response) => {
  try {
    const { venueId } = req.params;
    const { limit = 50 } = req.query;

    const tests = await WifiSpeedTest.find({
      $or: [
        { venueId },
        { tempVenueId: venueId }
      ]
    })
      .populate('userId', 'name email')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit as string))
      .lean();

    return res.json({
      success: true,
      data: tests,
      count: tests.length
    });

  } catch (error: any) {
    console.error('❌ Error fetching venue speed tests:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch speed tests',
      error: error.message
    });
  }
};

export const getMySpeedTests = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { limit = 20 } = req.query;

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