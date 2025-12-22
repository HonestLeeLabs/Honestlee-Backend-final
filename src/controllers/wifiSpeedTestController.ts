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
      // WiFi-specific fields
      ssid,
      bssid,
      signalStrength,
      frequency,
      zoneId,
      zoneName,
      // Connection details
      networkType,
      effectiveType,
      downlink,
      rtt,
      wifiSecurity,
      captivePortal,
      userProvidedSsid,
      isOnVenueWifi,
      wifiNetworkName
    } = req.body;

    console.log('📥 Received speed test submission:', {
      venueId,
      tempVenueId,
      downloadMbps,
      uploadMbps,
      latencyMs,
      ssid,
      networkType,
      userProvidedSsid
    });

    // Validate
    if (!venueId && !tempVenueId) {
      return res.status(400).json({
        success: false,
        message: 'Either venueId or tempVenueId is required'
      });
    }

    if (
      downloadMbps === undefined ||
      uploadMbps === undefined ||
      latencyMs === undefined
    ) {
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

    // Convert userId to ObjectId if it's a string
    const userIdValue =
      typeof req.user.userId === 'string'
        ? new mongoose.Types.ObjectId(req.user.userId)
        : req.user.userId;

    // Determine final SSID (prefer user-provided name, then raw ssid, then wifiNetworkName)
    const finalSsid: string | undefined =
      userProvidedSsid || ssid || wifiNetworkName;

    // Determine if this is venue WiFi
    const isVenueWifi: boolean = !!isOnVenueWifi;

    // Store network details
    const networkInfo = {
      ssid: finalSsid,
      bssid,
      signalStrength,
      frequency,
      connectionType: connectionType || networkType || 'wifi',
      effectiveType,
      downlink,
      rtt,
      security: wifiSecurity || 'unknown',
      captivePortal: !!captivePortal,
      isVenueWifi
    };

    // Parse numeric fields robustly
    const parsedDownload = typeof downloadMbps === 'number'
      ? downloadMbps
      : parseFloat(downloadMbps);
    const parsedUpload = typeof uploadMbps === 'number'
      ? uploadMbps
      : parseFloat(uploadMbps);
    const parsedLatency = typeof latencyMs === 'number'
      ? latencyMs
      : parseInt(latencyMs, 10);
    const parsedJitter =
      jitterMs !== undefined
        ? (typeof jitterMs === 'number' ? jitterMs : parseFloat(jitterMs))
        : undefined;
    const parsedPacketLoss =
      packetLoss !== undefined
        ? (typeof packetLoss === 'number' ? packetLoss : parseFloat(packetLoss))
        : undefined;

    const speedTest = new WifiSpeedTest({
      testId: uuidv4(),
      venueId: finalVenueId,
      tempVenueId: tempVenueId || undefined,
      userId: userIdValue,
      userRole: req.user.role,
      downloadMbps: parsedDownload,
      uploadMbps: parsedUpload,
      latencyMs: parsedLatency,
      jitterMs: parsedJitter,
      packetLoss: parsedPacketLoss,
      connectionType: connectionType || networkType || 'wifi',
      ssid: finalSsid,
      bssid,
      signalStrength,
      frequency,
      // store comprehensive network info
      networkInfo,
      deviceInfo:
        deviceInfo || { model: 'Unknown', os: 'Unknown', browser: 'Unknown' },
      testMethod: testMethod || 'ndt7',
      testServer,
      location,
      zoneId,
      zoneName,
      notes:
        notes ||
        `SSID: ${finalSsid || 'Unknown'}, Venue WiFi: ${
          isVenueWifi ? 'Yes' : 'No'
        }`,
      isReliable: true,
      region,
      timestamp: new Date()
    });

    await speedTest.save();

// Update venue wifiData with SSID info
if (tempVenueId) {
  await AgentVenueTemp.findOneAndUpdate(
    { tempVenueId },
    [
      {
        $set: {
          wifiData: {
            $ifNull: ['$wifiData', {}],
          },
        },
      },
      {
        $set: {
          'wifiData.hasSpeedTest': true,
          'wifiData.latestSpeedTest': {
            downloadMbps: '$$ROOT.downloadMbps',
            uploadMbps: '$$ROOT.uploadMbps',
            latencyMs: '$$ROOT.latencyMs',
            qualityScore: '$$ROOT.qualityScore',
            category: '$$ROOT.category',
            testedAt: '$$ROOT.timestamp',
            testedBy: req.user.userId,
            ssid: finalSsid,
            isVenueWifi: isVenueWifi,
          },
          'wifiData.ssids': {
            $let: {
              vars: {
                existing: {
                  $ifNull: ['$wifiData.ssids', []],
                },
              },
              in: {
                $cond: {
                  // does SSID already exist?
                  if: {
                    $gt: [
                      {
                        $size: {
                          $filter: {
                            input: '$$existing',
                            as: 's',
                            cond: { $eq: ['$$s.ssid', finalSsid] },
                          },
                        },
                      },
                      0,
                    ],
                  },
                  // ✅ update existing ssid: increment testCount + update lastTested & isVenueWifi
                  then: {
                    $map: {
                      input: '$$existing',
                      as: 's',
                      in: {
                        $cond: [
                          { $eq: ['$$s.ssid', finalSsid] },
                          {
                            ssid: '$$s.ssid',
                            isVenueWifi: isVenueWifi,
                            lastTested: new Date(),
                            testCount: {
                              $add: ['$$s.testCount', 1],
                            },
                          },
                          '$$s',
                        ],
                      },
                    },
                  },
                  // ✅ new ssid: push new item
                  else: {
                    $concatArrays: [
                      '$$existing',
                      [
                        {
                          ssid: finalSsid,
                          isVenueWifi: isVenueWifi,
                          lastTested: new Date(),
                          testCount: 1,
                        },
                      ],
                    ],
                  },
                },
              },
            },
          },
        },
      },
    ],
  );
}

    console.log(`✅ WiFi speed test saved: ${speedTest.testId}, SSID: ${finalSsid}`);

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

    const isValidObjectId = mongoose.Types.ObjectId.isValid(venueId);

    const query: any = isValidObjectId
      ? {
          $or: [{ venueId }, { tempVenueId: venueId }]
        }
      : {
          tempVenueId: venueId
        };

    const tests = await WifiSpeedTest.find(query)
      .populate('userId', 'name email')
      .sort({ timestamp: -1 })
      .limit(parseInt(limit as string, 10))
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
      .limit(parseInt(limit as string, 10))
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

    if (
      test.userId.toString() !== req.user.userId &&
      req.user.role !== 'ADMIN'
    ) {
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
