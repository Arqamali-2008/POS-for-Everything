/**
 * POS for Everything - Backend - Main Entry Point
 * Express server with TypeScript
 */

import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';

import { serverConfig, appConfig, isDevelopment, validateDatabaseConfig } from './config';
import { initializeDatabase, getDatabaseProvider, healthCheck, gracefulShutdown } from './db/connection';
import { logger } from './services/logger';
import { wsService } from './websocket';
import { syncService } from './sync';
import routes from './routes';
import { errorHandler, requestLogger, corsMiddleware, rateLimit } from './middleware/auth';
import { camelizeResponse } from './middleware/casing';

// ============================================================================
// Express App Setup
// ============================================================================

const app = express();
const httpServer = createServer(app);

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false, // Disable for development
}));

// CORS
app.use(corsMiddleware(serverConfig.corsOrigins));
app.use(cors({
  origin: serverConfig.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing
app.use(express.json({ limit: serverConfig.bodySizeLimit }));
app.use(express.urlencoded({ extended: true, limit: serverConfig.bodySizeLimit }));

// Compression
app.use(compression());

// Request logging
app.use(requestLogger);

// Rate limiting
app.use(rateLimit(serverConfig.rateLimitWindowMs, serverConfig.rateLimitMaxRequests));

// ============================================================================
// API Routes
// ============================================================================

app.use('/api', camelizeResponse);
app.use('/api', routes);

// ============================================================================
// Static Files (for production frontend)
// ============================================================================

if (isDevelopment()) {
  // In development, frontend is served separately by Vite
  app.get('/', (req, res) => {
    res.json({
      success: true,
      message: 'POS for Everything API Server',
      version: '2.0.0',
      docs: '/api/version',
      health: '/api/health',
    });
  });
} else {
  // In production, serve built frontend
  const path = require('path');
  const frontendPath = path.join(__dirname, '../../frontend/dist');
  
  app.use(express.static(frontendPath));
  
  app.get('*', (req, res, next) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.join(frontendPath, 'index.html'));
  });
}

// ============================================================================
// Error Handling
// ============================================================================

app.use(errorHandler);

// ============================================================================
// Server Startup
// ============================================================================

async function startServer(): Promise<void> {
  try {
    // Validate database configuration
    const validation = validateDatabaseConfig();
    if (!validation.valid) {
      logger.fatal('Invalid database configuration', { errors: validation.errors });
      process.exit(1);
    }

    // Initialize database
    await initializeDatabase();

    // Initialize WebSocket
    wsService.initialize(httpServer);

    // Initialize Sync Service
    syncService.initialize();

    // Start HTTP server
    httpServer.listen(serverConfig.port, serverConfig.host, () => {
      logger.info(`🚀 POS for Everything API Server started`, {
        host: serverConfig.host,
        port: serverConfig.port,
        environment: process.env.NODE_ENV,
        database: serverConfig.corsOrigins,
      });
      
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    POS for Everything API v2.0.0              ║
╠══════════════════════════════════════════════════════════════╣
║  Server:   http://${serverConfig.host}:${serverConfig.port}                                    ║
║  API:      http://${serverConfig.host}:${serverConfig.port}/api                                ║
║  Health:   http://${serverConfig.host}:${serverConfig.port}/api/health                         ║
║  WebSocket: ws://${serverConfig.host}:${serverConfig.port}                                    ║
║  Database: ${appConfig.database.provider.padEnd(20)}                                    ║
║  Environment: ${process.env.NODE_ENV?.padEnd(18) || 'development'.padEnd(18)}                         ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown...`);
      
      // Stop accepting new connections
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });
      
      // Shutdown services
      await gracefulShutdown();
      syncService.shutdown();
      await wsService.shutdown();
      
      logger.info('Graceful shutdown complete');
      process.exit(0);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.fatal('Uncaught exception', {}, error);
      shutdown('UNCAUGHT_EXCEPTION');
    });

    process.on('unhandledRejection', (reason) => {
      logger.fatal('Unhandled rejection', {}, reason instanceof Error ? reason : new Error(String(reason)));
      shutdown('UNHANDLED_REJECTION');
    });

  } catch (error) {
    logger.fatal('Failed to start server', {}, error instanceof Error ? error : undefined);
    process.exit(1);
  }
}

// Start the server
startServer();

export { app, httpServer };