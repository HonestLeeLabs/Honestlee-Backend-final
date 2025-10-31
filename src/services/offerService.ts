import Redemption, { RedemptionStatus } from '../models/Redemption';
import Review from '../models/Review';
import WifiTest from '../models/WifiTest';
import { IUser } from '../models/User';

// Calculate Offer Trust Level (OTL) for a user
export async function calculateOTL(userId: string): Promise<number> {
  let otl = 0;

  // Base points for account age
  const user = await import('../models/User').then(m => m.default.findById(userId));
  if (!user) return 0;

  const accountAgeDays = Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24));
  otl += Math.min(accountAgeDays, 10); // Max 10 points for account age

  // Points for verified redemptions
  const redemptionCount = await Redemption.countDocuments({
    userId,
    status: RedemptionStatus.REDEEMED
  });
  otl += Math.min(redemptionCount * 5, 30); // Max 30 points for redemptions

  // Points for reviews
  const reviewCount = await Review.countDocuments({ user: userId });
  otl += Math.min(reviewCount * 3, 20); // Max 20 points for reviews

  // Points for WiFi tests
  const wifiTestCount = await WifiTest.countDocuments({ user: userId });
  otl += Math.min(wifiTestCount * 2, 15); // Max 15 points for WiFi tests

  // Points for venue exploration (unique venues visited)
  const uniqueVenues = await Redemption.distinct('venueId', {
    userId,
    status: RedemptionStatus.REDEEMED
  });
  otl += Math.min(uniqueVenues.length * 3, 25); // Max 25 points for exploration

  return Math.min(otl, 100); // Cap at 100
}

// Calculate offer ranking based on multiple signals
export function calculateOfferRanking(offers: any[], user: any, userLocation: { lat: string; lng: string }) {
  return offers.map(offer => {
    let score = 0;

    // Proximity boost
    if (userLocation.lat && userLocation.lng && offer.venueId?.location) {
      const distance = calculateDistance(
        parseFloat(userLocation.lat),
        parseFloat(userLocation.lng),
        offer.venueId.location.coordinates[1],
        offer.venueId.location.coordinates[0]
      );
      score += Math.max(0, 100 - distance / 10); // Closer = higher score
    }

    // OTL match boost
    if (offer.eligibility?.userOTL >= offer.minOTL) {
      score += 20;
    }

    // Freshness boost (newly created offers)
    const offerAgeDays = Math.floor((Date.now() - new Date(offer.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    if (offerAgeDays < 7) {
      score += 15;
    }

    // Eligibility boost
    if (offer.eligibility?.isEligible) {
      score += 50;
    }

    // Value boost
    if (offer.offerType === 'PERCENTAGE' && offer.value >= 20) {
      score += 10;
    }

    return { ...offer, rankingScore: score };
  }).sort((a, b) => b.rankingScore - a.rankingScore);
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
