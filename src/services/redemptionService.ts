import mongoose from 'mongoose';
import Redemption, { RedemptionStatus } from '../models/Redemption';
import Venue, { IVenue } from '../models/Venue';

// Calculate risk score for fraud detection
export async function calculateRiskScore(
  userId: string,
  deviceFingerprint: string | undefined,
  presenceSignals: any
): Promise<number> {
  let riskScore = 0;

  // Check for multiple accounts from same device
  if (deviceFingerprint) {
    const UserModel = await import('../models/User').then(m => m.default);
    const deviceCount = await UserModel.countDocuments({ deviceFingerprint });
    if (deviceCount > 3) riskScore += 30;
  }

  // Check for rapid consecutive redemptions
  const recentRedemptions = await Redemption.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    createdAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
  });
  if (recentRedemptions > 5) riskScore += 40;

  // Check GPS accuracy
  if (presenceSignals?.gps && presenceSignals.gps.accuracy > 100) {
    riskScore += 20;
  }

  // Check device motion (stationary at venue)
  if (presenceSignals?.deviceMotion === false) {
    riskScore += 10;
  }

  // Check for failed redemption attempts
  const failedAttempts = await Redemption.countDocuments({
    userId: new mongoose.Types.ObjectId(userId),
    status: { $in: [RedemptionStatus.REJECTED, RedemptionStatus.FRAUD_FLAGGED] },
    createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
  });
  if (failedAttempts > 2) riskScore += 30;

  return Math.min(riskScore, 100);
}

// Verify user presence at venue
export async function verifyPresenceSignals(presenceSignals: any, venueId: any): Promise<boolean> {
  try {
    const venue = await Venue.findById(venueId) as IVenue | null;
    if (!venue || !venue.location) return false;

    let verifiedSignals = 0;
    const requiredSignals = 2; // At least 2 signals must match

    // Check GPS coordinates
    if (presenceSignals?.gps) {
      const venueCoords = venue.location.coordinates;
      const distance = calculateDistance(
        presenceSignals.gps.lat,
        presenceSignals.gps.lng,
        venueCoords[1],
        venueCoords[0]
      );
      
      if (distance <= 100) { // Within 100 meters
        verifiedSignals++;
      }
    }

    // Check WiFi SSID/BSSID (if venue has stored WiFi data)
    if (presenceSignals?.ssid && venue.wifiSSID) {
      if (presenceSignals.ssid === venue.wifiSSID) {
        verifiedSignals++;
      }
    }

    if (presenceSignals?.bssid && venue.wifiBSSID) {
      if (presenceSignals.bssid === venue.wifiBSSID) {
        verifiedSignals++;
      }
    }

    // Check QR scan recency
    if (presenceSignals?.qrScannedAt) {
      const scanTime = new Date(presenceSignals.qrScannedAt).getTime();
      const now = Date.now();
      if (now - scanTime < 5 * 60 * 1000) { // Within last 5 minutes
        verifiedSignals++;
      }
    }

    return verifiedSignals >= requiredSignals;

  } catch (error) {
    console.error('Error verifying presence signals:', error);
    return false;
  }
}

// Haversine formula for distance calculation
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) *
    Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
