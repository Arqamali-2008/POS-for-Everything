/**
 * Health Check Routes
 * System health, database status, and diagnostics
 */

import { Router, Request, Response } from 'express';
import { getDatabaseProvider } from '../db/connection';
import { databaseConfig, appConfig } from '../config';
import { optionalAuth } from '../middleware/auth';
import { logger } from '../services/logger';
import { wsService } from '../websocket';
import { syncService } from '../sync';
import { authService } from '../services/auth';

const router = Router();

/**
 * GET /api/health
 * Basic health check
 */
router.get('/', optionalAuth, async (req: Request, res: Response) => {
  const dbProvider = getDatabaseProvider();
  const dbHealth = dbProvider ? await dbProvider.healthCheck() : { healthy: false, latencyMs: 0 };
  
  res.json({
    success: true,
    status: dbHealth.healthy ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: {
      provider: databaseConfig.provider,
      healthy: dbHealth.healthy,
      latencyMs: dbHealth.latencyMs,
    },
    websocket: {
      connectedClients: wsService.getClientCount(),
    },
    sync: syncService.getSyncStatus(),
  });
});

/**
 * GET /api/health/detailed
 * Detailed health check with all subsystems
 */
router.get('/detailed', optionalAuth, async (req: Request, res: Response) => {
  const checks: Record<string, { healthy: boolean; latencyMs?: number; details?: any }> = {};
  
  // Database check
  const dbProvider = getDatabaseProvider();
  if (dbProvider) {
    const dbHealth = await dbProvider.healthCheck();
    checks.database = {
      healthy: dbHealth.healthy,
      latencyMs: dbHealth.latencyMs,
      details: { provider: databaseConfig.provider },
    };
  } else {
    checks.database = { healthy: false, details: { error: 'No database provider' } };
  }
  
  // Auth check
  try {
    const testUser = await authService.getUserById('local-admin-1');
    checks.auth = {
      healthy: !!testUser,
      details: { localAdmin: !!testUser, supabaseEnabled: appConfig.auth.supabaseEnabled },
    };
  } catch {
    checks.auth = { healthy: false };
  }
  
  // WebSocket check
  checks.websocket = {
    healthy: wsService.getClientCount() >= 0, // Always healthy if server running
    details: { connectedClients: wsService.getClientCount() },
  };
  
  // Sync check
  const syncStatus = syncService.getSyncStatus();
  checks.sync = {
    healthy: !syncStatus.isRunning || syncStatus.autoSyncEnabled,
    details: syncStatus,
  };
  
  // Memory check
  const mem = process.memoryUsage();
  checks.memory = {
    healthy: mem.heapUsed < mem.heapTotal * 0.9,
    details: {
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      external: Math.round(mem.external / 1024 / 1024),
    },
  };
  
  // Disk check (if available)
  checks.disk = {
    healthy: true,
    details: { message: 'Disk check not implemented' },
  };
  
  const allHealthy = Object.values(checks).every(c => c.healthy);
  
  res.status(allHealthy ? 200 : 503).json({
    success: true,
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
  });
});

/**
 * GET /api/health/ready
 * Kubernetes readiness probe
 */
router.get('/ready', async (req: Request, res: Response) => {
  const dbProvider = getDatabaseProvider();
  const dbHealth = dbProvider ? await dbProvider.healthCheck() : { healthy: false };
  
  if (dbHealth.healthy) {
    res.json({ success: true, ready: true });
  } else {
    res.status(503).json({ success: false, ready: false, reason: 'Database not healthy' });
  }
});

/**
 * GET /api/health/live
 * Kubernetes liveness probe
 */
router.get('/live', (req: Request, res: Response) => {
  res.json({ success: true, alive: true });
});

export default router;