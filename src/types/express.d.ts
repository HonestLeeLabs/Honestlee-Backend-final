// Extend Express namespace
declare global {
  namespace Express {
    interface User {
      id: string;
      userId: string;
      role: string;
      email?: string;
      name?: string;
      loginMethod?: string;
      region?: string;
      phone?: string;
      googleId?: string;
      profileImage?: string;
      hlsourcetoken?: string;
      hlutmdata?: {
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

export {};
