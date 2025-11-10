import { Request, Response, NextFunction } from "express";
import passport from "../config/passport";
import { signJwt } from "../utils/jwt";

const getFrontendUrl = (region: string, origin?: string): string => {
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

  const regionUrls: Record<string, string> = {
    ae: "https://ae.honestlee.app",
    th: "https://th.honestlee.app",
    in: "https://in.honestlee.app",
    global: "https://honestlee.app",
  };

  return regionUrls[region.toLowerCase()] || process.env.FRONTEND_URL || "http://localhost:3000";
};

export const googleAuth = (req: Request, res: Response, next: NextFunction) => {
  const region = (req.headers["x-region"] as string) || req.query.region || "ae";
  const hlsrc = req.query.hlsrc;
  const origin = req.headers.origin || req.headers.referer;

  const frontendUrl = getFrontendUrl(region as string, origin as string);

  console.log(`🔐 Initiating Google OAuth: region=${region}, frontendUrl=${frontendUrl}, hlsrc=${hlsrc}`);

  const stateData = {
    region: region,
    frontendUrl: frontendUrl,
    hlsrc: hlsrc || null,
    timestamp: Date.now(),
  };

  const stateString = Buffer.from(JSON.stringify(stateData)).toString("base64");

  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: stateString,
  })(req, res, next);
};

export const googleAuthCallback = (req: Request, res: Response, next: NextFunction) => {
  passport.authenticate("google", { session: false }, (err, user, info) => {
    if (err || !user) {
      console.error("❌ Google auth error:", err);

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
      // ✅ Validate user object
      if (!user || !user.id || !user.userId) {
        throw new Error("User object is missing required properties (id or userId)");
      }

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

      console.log(`👤 User authenticated:`, {
        id: user.id,
        userId: user.userId,
        email: user.email,
        role: user.role,
      });

      console.log(`🔐 Generating JWT for userId=${user.id}, role=${user.role}, region=${region}`);

      const token = signJwt({
        userId: user.id.toString(),
        role: user.role,
        region: region.toLowerCase(),
      });

      console.log(`✅ JWT token generated successfully`);

      const queryParams = new URLSearchParams({
        token: token,
        userId: user.id.toString(),
        email: user.email || "",
        name: user.name || "",
        role: user.role,
        loginMethod: user.loginMethod || "google",
        region: region,
        ...(user.hlsourcetoken && { hlsourcetoken: user.hlsourcetoken }),
        ...(user.hlutmdata?.utm_campaign && { utm_campaign: user.hlutmdata.utm_campaign }),
        ...(user.hlutmdata?.utm_source && { utm_source: user.hlutmdata.utm_source }),
      });

      const redirectUrl = `${frontendUrl}/?${queryParams.toString()}`;
      console.log(`🚀 Redirecting to: ${redirectUrl}`);

      res.redirect(redirectUrl);
    } catch (error: any) {
      console.error("❌ Token generation error:", error);
      console.error("❌ Error message:", error.message);
      console.error("❌ Error stack:", error.stack);
      console.error("❌ User object:", user);

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