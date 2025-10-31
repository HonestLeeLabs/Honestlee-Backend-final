import { Request, Response, NextFunction } from 'express';

export interface RegionRequest extends Request {
  region: 'ae' | 'th' | 'in' | 'global';
  language: string;
}

const REGION_MAP: { [key: string]: 'ae' | 'th' | 'in' } = {
  'ae.honestlee.app': 'ae',
  'th.honestlee.app': 'th',
  'in.honestlee.app': 'in',
  'localhost': 'ae', // default for development
};

const DEFAULT_LANGUAGES: { [key: string]: string } = {
  'ae': 'en',
  'th': 'th',
  'in': 'en'
};

export const detectRegion = (req: Request, res: Response, next: NextFunction) => {
  const regionReq = req as RegionRequest;
  
  // 1. Check x-region header (highest priority)
  const headerRegion = req.headers['x-region'] as string;
  if (headerRegion && ['ae', 'th', 'in'].includes(headerRegion.toLowerCase())) {
    regionReq.region = headerRegion.toLowerCase() as 'ae' | 'th' | 'in';
  } else {
    // 2. Detect from hostname
    const hostname = req.hostname || 'localhost';
    regionReq.region = REGION_MAP[hostname] || 'ae';
  }

  // 3. Detect language (can be overridden by query param or header)
  const queryLang = req.query.lang as string;
  const headerLang = req.headers['accept-language']?.split(',')[0].split('-')[0];
  
  regionReq.language = queryLang || headerLang || DEFAULT_LANGUAGES[regionReq.region];

  console.log(`🌍 Region: ${regionReq.region}, Language: ${regionReq.language}`);
  
  next();
};
