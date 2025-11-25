// wifiSpeedTestController.ts - FINAL COMPLETE VERSION

import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/authMiddleware';
import WifiSpeedTest from '../models/WifiSpeedTest';
import AgentVenueTemp from '../models/AgentVenueTemp';
import Venue from '../models/Venue';

/**
 * POST /api/wifi-speed/run-test
 * Run NDT7 speed test server-side
 */
export const runSpeedTest = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { venueId, tempVenueId, provider, serverUrl, deviceInfo, location, connectionType } = req.body;

    if (!venueId && !tempVenueId) {
      return res.status(400).json({
        success: false,
        message: 'venueId or tempVenueId is required'
      });
    }

    console.log('🚀 Running NDT7 speed test server-side for provider:', provider);

    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB not connected, state:', mongoose.connection.readyState);
      return res.status(503).json({
        success: false,
        message: 'Database connection unavailable'
      });
    }

    // Dynamically import ndt7
    const ndt7Module = await import('@m-lab/ndt7');
    const ndt7 = ndt7Module.default;

    // Track measurements
    let finalDownloadMbps = 0;
    let finalUploadMbps = 0;
    let finalLatencyMs = 0;
    let downloadSamples: number[] = [];
    let uploadSamples: number[] = [];
    let testError: any = null;

    // Configure NDT7
    const config: any = {
      userAcceptedDataPolicy: true,
      downloadworkerfile: undefined,
      uploadworkerfile: undefined,
    };

    if (serverUrl) {
      config.server = serverUrl;
    }

    const callbacks = {
      error: (err: any) => {
        console.error('❌ NDT7 error:', err);
        console.error('Error details:', {
          type: typeof err,
          string: String(err),
          message: err?.message,
          stack: err?.stack,
          code: err?.code,
        });
        testError = err;
      },
      
      downloadMeasurement: (data: any) => {
        try {
          if (data?.Source === 'client') {
            // Client-side download measurement
            if (data?.Data?.AppInfo?.ElapsedTime && data?.Data?.AppInfo?.NumBytes) {
              const elapsedSeconds = data.Data.AppInfo.ElapsedTime / 1e6;
              const bytes = data.Data.AppInfo.NumBytes;
              const bits = bytes * 8;
              const mbps = (bits / elapsedSeconds) / 1e6;
              
              if (mbps > 0 && !isNaN(mbps) && isFinite(mbps)) {
                finalDownloadMbps = mbps;
                downloadSamples.push(mbps); // ✅ Push client samples
                console.log('⬇️ Download client measurement:', mbps.toFixed(2), 'Mbps');
              }
            }
            
            // Capture latency from various sources
            const rttSources = [
              data?.Data?.TCPInfo?.MinRTT,
              data?.Data?.TCPInfo?.RTT,
              data?.Data?.BBRInfo?.MinRTT
            ];

            for (const rtt of rttSources) {
              if (rtt) {
                const rttMs = rtt / 1000; // Convert to ms
                if (rttMs > 0 && !isNaN(rttMs) && isFinite(rttMs)) {
                  if (finalLatencyMs === 0 || rttMs < finalLatencyMs) {
                    finalLatencyMs = rttMs;
                  }
                }
              }
            }
          }

          if (data?.Source === 'server' && data?.Data?.TCPInfo) {
            // Server-side measurements
            const rttSources = [
              data.Data.TCPInfo.MinRTT,
              data.Data.TCPInfo.RTT
            ];

            for (const rtt of rttSources) {
              if (rtt) {
                const rttMs = rtt / 1000;
                if (rttMs > 0 && !isNaN(rttMs) && isFinite(rttMs)) {
                  if (finalLatencyMs === 0 || rttMs < finalLatencyMs) {
                    finalLatencyMs = rttMs;
                  }
                }
              }
            }
            
            if (data.Data.TCPInfo.BytesAcked && data.Data.TCPInfo.ElapsedTime) {
              const elapsedSeconds = data.Data.TCPInfo.ElapsedTime / 1e6;
              const bytes = data.Data.TCPInfo.BytesAcked;
              const bits = bytes * 8;
              const mbps = (bits / elapsedSeconds) / 1e6;
              
              if (mbps > 0 && !isNaN(mbps) && isFinite(mbps)) {
                if (mbps > finalDownloadMbps) {
                  finalDownloadMbps = mbps;
                }
                downloadSamples.push(mbps); // ✅ ALSO push server samples
                console.log('⬇️ Download server measurement:', mbps.toFixed(2), 'Mbps');
              }
            }
          }
        } catch (error) {
          console.error('⚠️ Error processing download measurement:', error);
        }
      },
      
      downloadComplete: (data: any) => {
        console.log('✅ Download complete:', finalDownloadMbps.toFixed(2), 'Mbps');
        console.log('📊 Download samples collected:', downloadSamples.length);
      },
      
      uploadMeasurement: (data: any) => {
        try {
          if (data?.Source === 'client') {
            if (data?.Data?.AppInfo?.ElapsedTime && data?.Data?.AppInfo?.NumBytes) {
              const elapsedSeconds = data.Data.AppInfo.ElapsedTime / 1e6;
              const bytes = data.Data.AppInfo.NumBytes;
              const bits = bytes * 8;
              const mbps = (bits / elapsedSeconds) / 1e6;
              
              if (mbps > 0 && !isNaN(mbps) && isFinite(mbps)) {
                finalUploadMbps = mbps;
                uploadSamples.push(mbps); // ✅ Push client samples
                console.log('📤 Upload client measurement:', mbps.toFixed(2), 'Mbps');
              }
            }
          }

          if (data?.Source === 'server' && data?.Data?.TCPInfo) {
            if (data.Data.TCPInfo.BytesReceived && data.Data.TCPInfo.ElapsedTime) {
              const elapsedSeconds = data.Data.TCPInfo.ElapsedTime / 1e6;
              const bytes = data.Data.TCPInfo.BytesReceived;
              const bits = bytes * 8;
              const mbps = (bits / elapsedSeconds) / 1e6;
              
              if (mbps > 0 && !isNaN(mbps) && isFinite(mbps)) {
                if (mbps > finalUploadMbps) {
                  finalUploadMbps = mbps;
                }
                uploadSamples.push(mbps); // ✅ ALSO push server samples
                console.log('📤 Upload server measurement:', mbps.toFixed(2), 'Mbps');
              }
            }
          }
        } catch (error) {
          console.error('⚠️ Error processing upload measurement:', error);
        }
      },
      
      uploadComplete: (data: any) => {
        console.log('✅ Upload complete:', finalUploadMbps.toFixed(2), 'Mbps');
        console.log('📊 Upload samples collected:', uploadSamples.length);
        if (data) {
          console.log('📊 Upload completion data:', JSON.stringify(data, null, 2));
        }
      }
    };

    // Run the test with better error handling
    try {
      console.log('🎯 Starting NDT7 test...');
      await ndt7.test(config, callbacks);
      console.log('✅ NDT7 test completed without throwing');
    } catch (testError: any) {
      console.error('❌ NDT7 test threw error:', {
        message: testError?.message || String(testError),
        code: testError?.code,
        stack: testError?.stack
      });
      
      // Only fail if we got NO download results
      if (finalDownloadMbps === 0) {
        return res.status(400).json({
          success: false,
          message: 'Speed test failed completely: ' + (testError?.message || String(testError))
        });
      }
      
      console.log('⚠️ Test had errors but got download results, continuing...');
    }

    console.log('📊 Final measurements:', {
      download: finalDownloadMbps.toFixed(2),
      upload: finalUploadMbps.toFixed(2),
      latency: finalLatencyMs.toFixed(2),
      downloadSamples: downloadSamples.length,
      uploadSamples: uploadSamples.length
    });

    // Validate download measurement
    if (finalDownloadMbps === 0) {
      return res.status(400).json({
        success: false,
        message: 'Speed test failed: No download measurements recorded. Please try again.'
      });
    }

    // Handle missing upload with better estimation
    let uploadNote = '';
    if (finalUploadMbps === 0 || uploadSamples.length === 0) {
      console.warn('⚠️ Upload test did not complete, using estimated value');
      // Use a more realistic estimation based on typical asymmetric ratios
      finalUploadMbps = Math.max(0.1, finalDownloadMbps / 10);
      uploadNote = ' (upload estimated)';
    }

    // Latency fallback with better estimation
    if (finalLatencyMs === 0 && finalDownloadMbps > 0) {
      if (finalDownloadMbps > 100) {
        finalLatencyMs = 15;
      } else if (finalDownloadMbps > 50) {
        finalLatencyMs = 30;
      } else if (finalDownloadMbps > 10) {
        finalLatencyMs = 50;
      } else {
        finalLatencyMs = 100;
      }
      console.warn(`⚠️ Latency not captured, estimated: ${finalLatencyMs}ms`);
    }

    // Calculate final speeds using 95th percentile if enough samples
    const get95thPercentile = (arr: number[]) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const index = Math.floor(sorted.length * 0.95);
      return sorted[index] || sorted[sorted.length - 1];
    };

    const downloadMbps = downloadSamples.length > 10 
      ? get95thPercentile(downloadSamples)
      : finalDownloadMbps;
      
    const uploadMbps = uploadSamples.length > 10
      ? get95thPercentile(uploadSamples)
      : finalUploadMbps;

    // Get region from user
    const region = req.user.region || 'th';

    // Final device info
    const finalDeviceInfo = deviceInfo || {
      model: 'Unknown',
      os: 'Unknown',
      browser: 'Unknown',
      userAgent: req.headers['user-agent'] || 'Unknown'
    };

    // Check connection again before saving
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ MongoDB disconnected during test');
      // Try to reconnect
      try {
        await mongoose.connect(process.env.MONGODB_URI || '');
        console.log('✅ Reconnected to MongoDB');
      } catch (reconnectError) {
        console.error('❌ Failed to reconnect:', reconnectError);
        return res.status(503).json({
          success: false,
          message: 'Database connection lost and reconnection failed'
        });
      }
    }

    // Create speed test record
    const testId = `SPEED-${uuidv4().substring(0, 8).toUpperCase()}`;
    
    const speedTest = new WifiSpeedTest({
      testId,
      venueId: venueId || undefined,
      tempVenueId: tempVenueId || undefined,
      userId: req.user.userId,
      userRole: req.user.role,
      downloadMbps: Math.round(downloadMbps * 10) / 10,
      uploadMbps: Math.round(uploadMbps * 10) / 10,
      latencyMs: Math.round(finalLatencyMs) || 0,
      jitterMs: 0,
      packetLoss: 0,
      connectionType: connectionType || 'wifi',
      deviceInfo: finalDeviceInfo,
      testMethod: 'ndt7',
      testServer: serverUrl || `M-Lab ${provider}`,
      location: location || undefined,
      timestamp: new Date(),
      isReliable: uploadSamples.length > 0,
      notes: `NDT7 test via ${provider} - ${downloadSamples.length} download samples, ${uploadSamples.length} upload samples${uploadNote}`,
      region
    });

    // Save with retry logic
    let saveAttempts = 0;
    let saved = false;
    
    while (!saved && saveAttempts < 3) {
      try {
        await speedTest.save();
        saved = true;
        console.log(`✅ Speed test saved: ${testId} - ${speedTest.downloadMbps}/${speedTest.uploadMbps} Mbps`);
      } catch (saveError: any) {
        saveAttempts++;
        console.error(`❌ Save attempt ${saveAttempts} failed:`, saveError.message);
        
        if (saveAttempts < 3) {
          // Wait 1 second before retrying
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          // Try to reconnect
          if (mongoose.connection.readyState !== 1) {
            try {
              await mongoose.connect(process.env.MONGODB_URI || '');
              console.log('✅ Reconnected for retry');
            } catch (reconnectError) {
              console.error('❌ Reconnection failed during retry');
            }
          }
        } else {
          return res.status(500).json({
            success: false,
            message: 'Speed test completed but failed to save after 3 attempts: ' + saveError.message
          });
        }
      }
    }

    // Update venue with latest speed test stats
    if (tempVenueId) {
      try {
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
        console.log('✅ Venue updated with speed test results');
      } catch (updateError) {
        console.error('⚠️ Failed to update venue, but test was saved:', updateError);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Speed test completed successfully' + (uploadNote ? ' (upload estimated)' : ''),
      data: speedTest,
      metadata: {
        downloadSamples: downloadSamples.length,
        uploadSamples: uploadSamples.length,
        isUploadEstimated: uploadSamples.length === 0
      }
    });

  } catch (error: any) {
    console.error('❌ Speed test error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to run speed test'
    });
  }
};

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

    // ✅ ADD: Log incoming data for debugging
    console.log('📥 Received speed test submission:', {
      venueId,
      tempVenueId,
      downloadMbps,
      uploadMbps,
      latencyMs,
      userId: req.user.userId,
      userRole: req.user.role
    });

    // Validation
    if (!venueId && !tempVenueId) {
      return res.status(400).json({
        success: false,
        message: 'Either venueId or tempVenueId is required'
      });
    }

    if (!downloadMbps || !uploadMbps || latencyMs === undefined) {
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

    // ✅ FIX: Ensure userId is converted to ObjectId if it's a string
    const userIdValue = typeof req.user.userId === 'string' 
      ? new mongoose.Types.ObjectId(req.user.userId)
      : req.user.userId;

    const speedTest = new WifiSpeedTest({
      testId,
      venueId,
      tempVenueId,
      userId: userIdValue, // ✅ CHANGED: Use converted ObjectId
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

    // ✅ ADD: Better error handling with detailed logging
    try {
      await speedTest.save();
      console.log(`✅ Speed test saved: ${testId} - ${downloadMbps}/${uploadMbps} Mbps`);
    } catch (saveError: any) {
      console.error('❌ Error saving speed test:', {
        message: saveError.message,
        name: saveError.name,
        code: saveError.code,
        errors: saveError.errors,
        stack: saveError.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Failed to save speed test',
        error: saveError.message,
        details: saveError.errors // Include validation errors
      });
    }

    // Update venue with latest speed test stats
    if (tempVenueId) {
      try {
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
        console.log('✅ Venue updated with speed test results');
      } catch (updateError: any) {
        console.error('⚠️ Failed to update venue:', updateError.message);
        // Don't fail the request if venue update fails
      }
    }

    return res.status(201).json({
      success: true,
      message: 'Speed test submitted successfully',
      data: speedTest
    });

  } catch (error: any) {
    console.error('❌ Error submitting speed test:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
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
