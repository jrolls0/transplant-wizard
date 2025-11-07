import App from './app';
import logger from './config/logger';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

const PORT = process.env.PORT || 3001;
const WEBSOCKET_PORT = process.env.WEBSOCKET_PORT || 3002;

async function startServer() {
  try {
    const app = new App();
    
    // Initialize the application
    await app.initialize();
    
    // Create HTTP server
    const server = createServer(app.app);
    
    // Initialize WebSocket server for real-time notifications
    const io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://dashboard.transplant-platform.com']
          : ['http://localhost:3000', 'http://127.0.0.1:3000'],
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling']
    });

    // WebSocket authentication middleware
    io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Authentication error'));
      }
      // TODO: Verify JWT token and attach user info to socket
      next();
    });

    // WebSocket connection handling
    io.on('connection', (socket) => {
      logger.info('WebSocket client connected', {
        socketId: socket.id,
        ip: socket.handshake.address
      });

      // Join room based on user role and ID
      socket.on('join-room', (roomId) => {
        socket.join(roomId);
        logger.debug('Client joined room', { socketId: socket.id, roomId });
      });

      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason
        });
      });
    });

    // Store WebSocket server instance for use in other modules
    app.app.set('io', io);

    // Start HTTP server
    server.listen(PORT, () => {
      logger.info(`🚀 Transplant Platform API started successfully`, {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        version: process.env.API_VERSION || 'v1',
        websocketEnabled: process.env.WEBSOCKET_ENABLED === 'true'
      });

      logger.info('📋 API Endpoints Available:', {
        health: `http://localhost:${PORT}/health`,
        api: `http://localhost:${PORT}/api`,
        auth: `http://localhost:${PORT}/api/v1/auth`,
        patients: `http://localhost:${PORT}/api/v1/patients`,
        socialWorkers: `http://localhost:${PORT}/api/v1/social-workers`,
        transplantCenters: `http://localhost:${PORT}/api/v1/transplant-centers`,
        notifications: `http://localhost:${PORT}/api/v1/notifications`
      });

      if (process.env.WEBSOCKET_ENABLED === 'true') {
        logger.info(`🔌 WebSocket server running on port ${PORT} (same as HTTP)`);
      }
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, shutting down gracefully`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        // Close WebSocket server
        io.close(() => {
          logger.info('WebSocket server closed');
        });
        
        // Close application resources
        await app.close();
        
        process.exit(0);
      });

      // Force close after 30 seconds
      setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
      }, 30000);
    };

    // Listen for termination signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Start the server
startServer();