// Extend Express namespace to fix req.user type errors
declare global {
  namespace Express {
    interface User {
      userId: string;
      role: string;
      email?: string;
      name?: string;
      loginMethod?: string;
      region?: string;
      phone?: string;
      googleId?: string;
      profileImage?: string;
      hl_source_token?: string;
      hl_utm_data?: {
        utm_source?: string;
        utm_medium?: string;
        utm_campaign?: string;
        utm_content?: string;
        utm_term?: string;
      };
    }

    interface Request {
      user?: User;
    }
  }
}

// Make this file a module
export {};
