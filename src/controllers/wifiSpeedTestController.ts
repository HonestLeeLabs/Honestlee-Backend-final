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
      zoneId,        // ✅ Direct zoneId from frontend
      zoneName,      // ✅ Direct zoneName from frontend
      // Connection details
      networkType,
      effectiveType,
      downlink,
      rtt,
      wifiSecurity,
      captivePortal,
      userProvidedSsid,
      isOnVenueWifi,
      wifiNetworkName,
      // WiFi commercial / password details
      isWifiFree,
      wifiPassword,
      wifiPasswordNote,
      // Contextual fields
      displayMethod,
      displayLocation,
      peopleCount,
      zoneInfo,      // ✅ Structured zoneInfo from frontend
      hasNoWifi,
      // ✅ NEW: Mobile Network Info
      mobileNetworkInfo,
    } = req.body;

    console.log('📥 Received speed test submission:', {
      venueId,
      tempVenueId,
      downloadMbps,
      uploadMbps,
      latencyMs,
      ssid,
      zoneId,
      zoneName,
      networkType,
      userProvidedSsid,
      isWifiFree,
      hasPassword: !!wifiPassword,
      displayMethod,
      displayLocation,
      peopleCount,
      hasNoWifi,
      mobileNetworkInfo,
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

    // Build WiFi QR payload text
    let wifiQrCode: string | undefined;
    if (finalSsid && wifiPassword && !hasNoWifi) {
      // Map security to QR type
      const sec = (wifiSecurity || '').toUpperCase();
      let qrType = 'WPA';
      if (sec.includes('WPA')) qrType = 'WPA';
      else if (sec.includes('WEP')) qrType = 'WEP';
      else if (!wifiPassword) qrType = 'nopass';

      wifiQrCode = `WIFI:T:${qrType};S:${finalSsid};P:${wifiPassword};H:false;`;
    }

    // ✅ FIXED: Build final zone info - prioritize structured zoneInfo, fallback to individual fields
    let finalZoneInfo;
    let finalZoneId = zoneId;
    let finalZoneName = zoneName;

    if (zoneInfo) {
      try {
        finalZoneInfo = JSON.parse(JSON.stringify(zoneInfo));
        finalZoneId = finalZoneInfo.zoneId || zoneId;
        finalZoneName = finalZoneInfo.zoneName || zoneName;
      } catch (e) {
        console.warn('⚠️ Invalid zoneInfo JSON, using individual fields');
        finalZoneInfo = undefined;
      }
    }

    // Fallback: create zoneInfo from individual fields if not provided
    if (!finalZoneInfo && (finalZoneId || finalZoneName)) {
      finalZoneInfo = {
        zoneId: finalZoneId,
        zoneName: finalZoneName,
        hasWifi: !hasNoWifi
      };
    }

    console.log('🎯 Final zone data:', {
      zoneId: finalZoneId,
      zoneName: finalZoneName,
      zoneInfo: finalZoneInfo
    });

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
    const parsedPeopleCount =
      peopleCount !== undefined
        ? (typeof peopleCount === 'number' ? peopleCount : parseInt(peopleCount))
        : undefined;

    // Enhanced auto notes with contextual info
    const wifiCommercialNoteParts: string[] = [];
    if (typeof isWifiFree === 'boolean') {
      wifiCommercialNoteParts.push(`WiFi free: ${isWifiFree ? 'Yes' : 'No'}`);
    }
    if (wifiPassword) {
      wifiCommercialNoteParts.push('Password stored');
    }
    if (wifiPasswordNote) {
      wifiCommercialNoteParts.push(`Note: ${wifiPasswordNote}`);
    }

    // Add mobile network info to notes if available
    if (mobileNetworkInfo?.carrier) {
      const mobileParts = [];
      mobileParts.push(`Mobile: ${mobileNetworkInfo.carrier}`);
      if (mobileNetworkInfo.networkType) mobileParts.push(mobileNetworkInfo.networkType);
      if (mobileNetworkInfo.signalBars) mobileParts.push(`${mobileNetworkInfo.signalBars}/5 bars`);
      if (mobileNetworkInfo.signalStrength) mobileParts.push(mobileNetworkInfo.signalStrength);
      if (mobileNetworkInfo.towerDistance) mobileParts.push(`Tower: ~${mobileNetworkInfo.towerDistance}`);
      wifiCommercialNoteParts.push(`Mobile Network: ${mobileParts.join(', ')}`);
    }

    const baseAutoNotes = `SSID: ${finalSsid || 'Unknown'}, Venue WiFi: ${
      isVenueWifi ? 'Yes' : 'No'
    }${
      wifiCommercialNoteParts.length ? ' | ' + wifiCommercialNoteParts.join(' | ') : ''
    }`;

    // Add contextual notes
    const contextualNotes: string[] = [];
    if (displayMethod && displayMethod !== 'unknown') contextualNotes.push(`Display: ${displayMethod}`);
    if (displayLocation) contextualNotes.push(`Location: ${displayLocation}`);
    if (parsedPeopleCount !== undefined) contextualNotes.push(`People: ${parsedPeopleCount}`);
    if (hasNoWifi) contextualNotes.push('NO WIFI at venue');
    if (finalZoneName) contextualNotes.push(`Zone: ${finalZoneName}`);

    const enhancedAutoNotes = `${baseAutoNotes}${contextualNotes.length ? ' | ' + contextualNotes.join(' | ') : ''}`;

    // ✅ ADDED: Calculate quality score (from first version)
    const calculateQualityScore = (download: number, upload: number, latency: number): number => {
      const downloadScore = Math.min((download / 100) * 40, 40);
      const uploadScore = Math.min((upload / 50) * 30, 30);
      const latencyScore = Math.max(30 - (latency / 10), 0);
      return Math.round(downloadScore + uploadScore + latencyScore);
    };

    const getCategory = (score: number): string => {
      if (score >= 80) return 'excellent';
      if (score >= 60) return 'good';
      if (score >= 40) return 'fair';
      return 'poor';
    };

    const qualityScore = calculateQualityScore(parsedDownload, parsedUpload, parsedLatency);
    const category = getCategory(qualityScore);

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
      zoneId: finalZoneId,     // ✅ Fixed: use finalZoneId
      zoneName: finalZoneName, // ✅ Fixed: use finalZoneName
      notes: notes || enhancedAutoNotes,
      isReliable: true,
      region,
      timestamp: new Date(),
      // WiFi commercial fields
      isWifiFree: !!isWifiFree,
      wifiPassword: wifiPassword || undefined,
      wifiPasswordNote: wifiPasswordNote || undefined,
      wifiQrCode,
      // NEW contextual fields
      displayMethod: displayMethod || 'unknown',
      displayLocation,
      peopleCount: parsedPeopleCount,
      zoneInfo: finalZoneInfo,  // ✅ Fixed: use finalZoneInfo
      hasNoWifi: !!hasNoWifi,
      // ✅ NEW: Mobile Network Info
      mobileNetworkInfo: mobileNetworkInfo || undefined,
      // ✅ ADDED: Quality score fields (from first version)
      qualityScore,
      category,
    });

    await speedTest.save();

    // ✅✅✅ COMBINED: Update venue wifiData with BOTH password AND ssids array
    if ((tempVenueId || finalVenueId) && finalSsid && !hasNoWifi) {
      try {
        // Determine which ID to use
        const updateQuery: any = tempVenueId 
          ? { tempVenueId } 
          : { venueId: finalVenueId };
        
        // Use aggregation pipeline to do everything in ONE update
        await AgentVenueTemp.findOneAndUpdate(
          updateQuery,
          [
            // Stage 1: Initialize wifiData if null
            {
              $set: {
                wifiData: { $ifNull: ['$wifiData', {}] },
              },
            },
            // Stage 2: Set all wifiData fields including password
            {
              $set: {
                // ✅ Root-level wifiData fields (including password!)
                'wifiData.ssid': finalSsid,
                'wifiData.password': wifiPassword || null,
                'wifiData.security': wifiPassword ? (wifiSecurity || 'WPA2') : null,
                'wifiData.isWifiFree': isWifiFree !== undefined ? isWifiFree : null,
                'wifiData.note': wifiPasswordNote || null,
                'wifiData.lastUpdated': new Date(),
                'wifiData.lastTestedBy': req.user.userId,
                'wifiData.hasSpeedTest': true,
                'wifiData.latestQualityScore': qualityScore,
                'wifiData.latestCategory': category,
                
                // ✅ Latest speed test info
                'wifiData.latestSpeedTest': {
                  downloadMbps: parsedDownload,
                  uploadMbps: parsedUpload,
                  latencyMs: parsedLatency,
                  qualityScore: qualityScore,
                  category: category,
                  testedAt: new Date(),
                  testedBy: req.user.userId,
                  ssid: finalSsid,
                  isVenueWifi: isVenueWifi,
                  isWifiFree: !!isWifiFree,
                  hasWifiPassword: !!wifiPassword,
                  displayMethod: displayMethod || 'unknown',
                  displayLocation,
                  peopleCount: parsedPeopleCount,
                  zoneInfo: finalZoneInfo,
                  zoneId: finalZoneId,
                  zoneName: finalZoneName,
                  hasNoWifi: !!hasNoWifi,
                  mobileNetworkInfo: mobileNetworkInfo || undefined,
                },
                
                // ✅ SSIDs array (track multiple networks)
                'wifiData.ssids': {
                  $let: {
                    vars: {
                      existing: { $ifNull: ['$wifiData.ssids', []] },
                    },
                    in: {
                      $cond: {
                        // Does SSID already exist?
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
                        // Update existing SSID
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
                                  testCount: { $add: ['$$s.testCount', 1] },
                                  isWifiFree: !!isWifiFree,
                                  hasWifiPassword: !!wifiPassword,
                                  displayMethod: displayMethod || 'unknown',
                                  displayLocation,
                                  peopleCount: parsedPeopleCount,
                                  zoneInfo: finalZoneInfo,
                                  zoneId: finalZoneId,
                                  zoneName: finalZoneName,
                                  hasNoWifi: !!hasNoWifi,
                                  mobileNetworkInfo: mobileNetworkInfo || undefined,
                                },
                                '$$s',
                              ],
                            },
                          },
                        },
                        // Add new SSID
                        else: {
                          $concatArrays: [
                            '$$existing',
                            [
                              {
                                ssid: finalSsid,
                                isVenueWifi: isVenueWifi,
                                lastTested: new Date(),
                                testCount: 1,
                                isWifiFree: !!isWifiFree,
                                hasWifiPassword: !!wifiPassword,
                                displayMethod: displayMethod || 'unknown',
                                displayLocation,
                                peopleCount: parsedPeopleCount,
                                zoneInfo: finalZoneInfo,
                                zoneId: finalZoneId,
                                zoneName: finalZoneName,
                                hasNoWifi: !!hasNoWifi,
                                mobileNetworkInfo: mobileNetworkInfo || undefined,
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
          ]
        );

        console.log('✅✅✅ WiFi credentials saved to venue document:', {
          venueId: tempVenueId || finalVenueId,
          ssid: finalSsid,
          hasPassword: !!wifiPassword,
          isWifiFree,
          password: wifiPassword ? '***' : 'none',
          qualityScore,
          category
        });
      } catch (venueUpdateError) {
        console.error('⚠️ Failed to update venue with WiFi credentials:', venueUpdateError);
        // Continue anyway - speed test is already saved
      }
    }

    console.log(`✅ WiFi speed test saved: ${speedTest.testId}, SSID: ${finalSsid}, Zone: ${finalZoneName || 'None'}, Mobile Network: ${mobileNetworkInfo?.carrier || 'None'}, Quality Score: ${qualityScore} (${category})`);

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