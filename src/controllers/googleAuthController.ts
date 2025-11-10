import { Request, Response, NextFunction } from "express";
import passport from "../config/passport";
import { signJwt } from "../utils/jwt";

// Helper to get frontend URL based on region/origin
const getFrontendUrl = (region: string, origin?: string): string => {
  // Try to detect from origin header
  if (origin) {
    if (origin.includes("ae.honestlee.app") || origin.includes("honestlee.ae")) {
      return "https://ae.honestlee.app";
    }
    if (origin.includes("th.honestlee.app")) {
      return "https://th.honestlee.app";
    }
    if (origin.includes("in.honestlee.app")) {
      return "https://in.honestlee.app";
    }
  }

  // Fallback based on region
  const regionUrls: Record<string, string> = {
    ae: "https://ae.honestlee.app",
    th: "https://th.honestlee.app",
    in: "https://in.honestlee.app",
    global: "https://honestlee.app",
  };

  return regionUrls[region.toLowerCase()] || process.env.FRONTEND_URL || "http://localhost:3000";
};

// Initiate Google OAuth
export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
  // Get region from header or query
  const region = (req.headers["x-region"] as string) || req.query.region || "ae";
  const hlsrc = req.query.hlsrc;
  const origin = req.headers.origin || req.headers.referer;

  // Determine frontend URL
  const frontendUrl = getFrontendUrl(region as string, origin as string);

  console.log(`🔐 Initiating Google OAuth: region=${region}, frontendUrl=${frontendUrl}, hlsrc=${hlsrc}`);

  // Create state object with all tracking data
  const stateData = {
    region: region,
    frontendUrl: frontendUrl,
    hlsrc: hlsrc || null,
    timestamp: Date.now(),
  };

  // Encode state as base64 JSON
  const stateString = Buffer.from(JSON.stringify(stateData)).toString("base64");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: stateString,
  })(req, res, next);
};

// Handle Google OAuth callback
export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("google", { session: false }, (err, user, info) => {
    if (err || !user) {
      console.error("❌ Google auth error:", err);

      // Try to get frontend URL from state
      let frontendUrl = "https://ae.honestlee.app";
      try {
        if (req.query.state) {
          const stateData = JSON.parse(Buffer.from(req.query.state as string, "base64").toString("utf-8"));
          frontendUrl = stateData.frontendUrl || frontendUrl;
        }
      } catch (e) {
        console.error("❌ Failed to parse state:", e);
      }

      return res.redirect(`${frontendUrl}/login?error=authentication_failed&message=${encodeURIComponent(err?.message || "Google authentication failed")}`);
    }

    try {
      // Decode state to get region and frontend URL
      let region = "ae";
      let frontendUrl = "https://ae.honestlee.app";
      let hlsrc = null;

      if (req.query.state) {
        try {
          const stateData = JSON.parse(Buffer.from(req.query.state as string, "base64").toString("utf-8"));
          region = stateData.region || "ae";
          frontendUrl = stateData.frontendUrl || frontendUrl;
          hlsrc = stateData.hlsrc;
          console.log(`✅ Decoded state: region=${region}, frontendUrl=${frontendUrl}, hlsrc=${hlsrc}`);
        } catch (e) {
          console.error("❌ Failed to parse state:", e);
        }
      }

      // Log user info
      console.log(`👤 User authenticated: userId=${user.id}, email=${user.email}, role=${user.role}`);

      // Generate JWT token with region
      console.log(`🔐 Generating JWT for userId=${user.id}, role=${user.role}, region=${region}`);
      
      const token = signJwt({
        userId: user.id.toString(),
        role: user.role,
        region: region.toLowerCase(),
      });

      console.log(`✅ JWT token generated successfully`);

      // Build query params
      const queryParams = new URLSearchParams({
        token: token,
        userId: user.id.toString(),
        email: user.email || "",
        name: user.name || "",
        role: user.role,
        loginMethod: user.loginMethod || "google",
        region: region,
        ...(user.hlsourcetoken && { hlsourcetoken: user.hlsourcetoken }),
        ...(user.hlutmdata?.utmcampaign && { utmcampaign: user.hlutmdata.utmcampaign }),
        ...(user.hlutmdata?.utmsource && { utmsource: user.hlutmdata.utmsource }),
      });

      // Redirect to the correct regional frontend
      const redirectUrl = `${frontendUrl}/?${queryParams.toString()}`;
      console.log(`🚀 Redirecting to: ${redirectUrl}`);
      
      res.redirect(redirectUrl);
    } catch (error: any) {
      console.error("❌ Token generation error:", error);
      console.error("❌ Error message:", error.message);
      console.error("❌ Error stack:", error.stack);

      // Try to get frontend URL from state for error redirect
      let frontendUrl = "https://ae.honestlee.app";
      try {
        if (req.query.state) {
          const stateData = JSON.parse(Buffer.from(req.query.state as string, "base64").toString("utf-8"));
          frontendUrl = stateData.frontendUrl || frontendUrl;
        }
      } catch (e) {
        console.error("❌ Failed to parse state:", e);
      }

      const errorMessage = error.message || "Failed to generate authentication token";
      return res.redirect(`${frontendUrl}/login?error=token_generation_failed&message=${encodeURIComponent(errorMessage)}`);
    }
  })(req, res, next);
};
