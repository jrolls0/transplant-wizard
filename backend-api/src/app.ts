import express from 'express';
import cors from 'cors';
import compression from 'compression';
import morgan from 'morgan';
import helmet from 'helmet';
import { config } from 'dotenv';

// Load environment variables
config();

// Import middleware
import {
  securityHeaders,
  rateLimiter,
  authRateLimiter,
  sanitizeInput,
  corsOptions,
  logSecurityEvents,
  requestSizeLimit
} from './middleware/security';
import { authenticate, optionalAuth } from './middleware/auth';

// Import configuration
import logger from './config/logger';
import DatabaseConfig from './config/database';

// Import routes (we'll create these next)
import authRoutes from './routes/auth';
import patientRoutes from './routes/patients';
import socialWorkerRoutes from './routes/social-workers';
import transplantRoutes from './routes/transplant-centers';
import notificationRoutes from './routes/notifications';
import adminRoutes from './routes/admin';

class App {
  public app: express.Application;
  private db: DatabaseConfig;

  constructor() {
    this.app = express();
    this.db = DatabaseConfig.getInstance();
    
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Basic middleware
    this.app.use(compression());
    this.app.use(express.json({ limit: requestSizeLimit }));
    this.app.use(express.urlencoded({ extended: true, limit: requestSizeLimit }));

    // Security middleware
    this.app.use(securityHeaders);
    this.app.use(logSecurityEvents);
    this.app.use(sanitizeInput);

    // CORS
    if (process.env.ENABLE_CORS === 'true') {
      this.app.use(cors(corsOptions));
    }

    // Rate limiting
    this.app.use(rateLimiter);

    // Logging
    if (process.env.ENABLE_REQUEST_LOGGING === 'true') {
      this.app.use(morgan(process.env.LOG_FORMAT || 'combined', {
        stream: {
          write: (message: string) => {
            logger.http(message.trim());
          }
        }
      }));
    }

    // Health check endpoint (no auth required)
    this.app.get('/health', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Transplant Platform API is healthy',
        timestamp: new Date().toISOString(),
        version: process.env.API_VERSION || 'v1'
      });
    });

    // API info endpoint
    this.app.get('/api', (req, res) => {
      res.status(200).json({
        success: true,
        message: 'Transplant Platform API',
        version: process.env.API_VERSION || 'v1',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        endpoints: {
          auth: '/api/v1/auth',
          patients: '/api/v1/patients',
          socialWorkers: '/api/v1/social-workers',
          transplantCenters: '/api/v1/transplant-centers',
          notifications: '/api/v1/notifications',
          admin: '/api/v1/admin'
        }
      });
    });
  }

  private initializeRoutes(): void {
    const apiVersion = process.env.API_VERSION || 'v1';
    const baseRoute = `/api/${apiVersion}`;

    // Apply auth rate limiting to authentication routes
    this.app.use(`${baseRoute}/auth`, authRateLimiter);

    // Mount routes
    this.app.use(`${baseRoute}/auth`, authRoutes);
    this.app.use(`${baseRoute}/patients`, authenticate, patientRoutes);
    this.app.use(`${baseRoute}/social-workers`, authenticate, socialWorkerRoutes);
    this.app.use(`${baseRoute}/transplant-centers`, optionalAuth, transplantRoutes);
    this.app.use(`${baseRoute}/notifications`, authenticate, notificationRoutes);
    this.app.use(`${baseRoute}/admin`, authenticate, adminRoutes);

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        code: 'ENDPOINT_NOT_FOUND',
        path: req.originalUrl
      });
    });
  }

  private initializeErrorHandling(): void {
    // Global error handler
    this.app.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error', {
        error: error.message,
        stack: error.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Don't leak error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      
      res.status(error.status || 500).json({
        success: false,
        error: isDevelopment ? error.message : 'Internal server error',
        code: error.code || 'INTERNAL_ERROR',
        ...(isDevelopment && { stack: error.stack })
      });
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
      
      // Graceful shutdown
      process.exit(1);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
      logger.error('Unhandled Rejection', {
        reason: reason instanceof Error ? reason.message : reason,
        stack: reason instanceof Error ? reason.stack : undefined
      });
      
      // Graceful shutdown
      process.exit(1);
    });
  }

  public async initialize(): Promise<void> {
    try {
      logger.info('Initializing Transplant Platform API...');
      
      // Test database connection and initialize schema
      await this.db.initializeDatabase();
      
      logger.info('API initialization completed successfully');
    } catch (error) {
      logger.error('Failed to initialize API', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  public async close(): Promise<void> {
    try {
      logger.info('Shutting down API...');
      
      // Close database connections
      await this.db.close();
      
      logger.info('API shutdown completed');
    } catch (error) {
      logger.error('Error during API shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export default App;