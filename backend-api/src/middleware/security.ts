import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { securityLogger } from '../config/logger';

// HIPAA-compliant security headers
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: { policy: "cross-origin" },
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  referrerPolicy: { policy: "no-referrer" },
  xssFilter: true,
});

// Rate limiting for HIPAA compliance
export const rateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'), // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    securityLogger.warn('Rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  }
});

// Authentication rate limiting (stricter for auth endpoints)
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED'
  },
  skipSuccessfulRequests: true,
  handler: (req: Request, res: Response) => {
    securityLogger.warn('Authentication rate limit exceeded', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: req.path,
      method: req.method
    });
    
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED'
    });
  }
});

// Input sanitization middleware
export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
  // Remove potentially dangerous characters from string inputs
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj
        .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
        .replace(/<[^>]*>/g, '') // Remove HTML tags
        .trim();
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }
    
    return obj;
  };

  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  if (req.params) {
    req.params = sanitizeObject(req.params);
  }

  next();
};

// CORS configuration for HIPAA compliance
export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // List of allowed origins based on environment
    const allowedOrigins = process.env.NODE_ENV === 'production' 
      ? [
          'https://transplant-platform.com',
          'https://app.transplant-platform.com',
          'https://dashboard.transplant-platform.com'
        ]
      : [
          'http://localhost:3000',
          'http://localhost:3001',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:3001'
        ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      securityLogger.warn('CORS policy violation', {
        origin,
        timestamp: new Date().toISOString()
      });
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-API-Key'
  ]
};

// Security logging middleware
export const logSecurityEvents = (req: Request, res: Response, next: NextFunction) => {
  // Log potentially suspicious requests
  const suspiciousPatterns = [
    /(\.\.|\/etc\/|\/bin\/|\/usr\/|\/var\/)/i, // Path traversal
    /(script|javascript|vbscript|onload|onerror)/i, // XSS attempts
    /(union|select|insert|delete|update|drop|exec)/i, // SQL injection
    /(cmd|exec|system|shell)/i, // Command injection
  ];

  const fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params
  });

  const isSuspicious = suspiciousPatterns.some(pattern => 
    pattern.test(fullUrl) || pattern.test(requestData)
  );

  if (isSuspicious) {
    securityLogger.warn('Suspicious request detected', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      method: req.method,
      url: fullUrl,
      body: req.body,
      query: req.query,
      params: req.params,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });
  }

  next();
};

// Request size limitation for HIPAA compliance
export const requestSizeLimit = '10mb'; // Limit request size to 10MB

// File upload security
export const fileUploadSecurity = {
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB file size limit
    files: 5, // Maximum 5 files per request
    fields: 20, // Maximum 20 form fields
    headerPairs: 2000 // Maximum header pairs
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: any) => {
    // Allowed file types for medical documents
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      securityLogger.warn('File upload rejected - invalid type', {
        filename: file.originalname,
        mimetype: file.mimetype,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
      cb(new Error('File type not allowed'), false);
    }
  }
};