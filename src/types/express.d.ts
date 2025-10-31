// Extend Express namespace to fix req.user type errors
declare global {
  namespace Express {
    interface User {
      userId: string;
      role: string;
      email?: string;
    }

    interface Request {
      user?: User;
    }
  }
}

// Make this file a module
export {};
