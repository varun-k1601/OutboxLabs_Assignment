declare global {
  namespace Express {
    interface Request {
      // set by requireAuth
      userId?: string;
    }
  }
}

export {};
