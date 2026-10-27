/**
 * Sync Routes
 * Manual sync triggers and sync status
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireAdmin, validateBody } from '../middleware/auth';
import { logger } from '../services/logger';
import { syncService } from '../sync';
import type { SyncConfig } from '@pospro/core';

const router = Router();

const syncConfigSchema = z.object({
  tables: z.array(z.string()).optional(),
  direction: z.enum(['push', 'pull', 'bidirectional']).optional(),
  conflictResolution: z.enum(['local_wins', 'remote_wins', 'last_write_wins', 'manual', 'merge']).optional(),
  batchSize: z.number().positive().optional(),
});

/**
 * GET /api/sync/status
 * Get sync service status
 */
router.get('/status', authenticateToken, (req: Request, res: Response) => {
  const status = syncService.getSyncStatus();
  const history = syncService.getSyncHistory(20);
  
  res.json({
    success: true,
    data: {
      ...status,
      history,
    },
  });
});

/**
 * POST /api/sync/trigger
 * Manually trigger a sync
 */
router.post('/trigger', authenticateToken, requireAdmin, validateBody(syncConfigSchema), async (req: Request, res: Response) => {
  try {
    const config = req.body as Partial<SyncConfig>;
    const result = await syncService.performSync(config);
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    logger.error('Manual sync failed', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Sync failed',
      code: 'SYNC_FAILED',
    });
  }
});

/**
 * POST /api/sync/push
 * Push local changes to cloud
 */
router.post('/push', authenticateToken, requireAdmin, validateBody(syncConfigSchema), async (req: Request, res: Response) => {
  try {
    const { tables = [] } = req.body;
    const result = await syncService.pushLocalChanges(tables);
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    logger.error('Push sync failed', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Push sync failed',
      code: 'PUSH_FAILED',
    });
  }
});

/**
 * POST /api/sync/pull
 * Pull remote changes from cloud
 */
router.post('/pull', authenticateToken, requireAdmin, validateBody(syncConfigSchema), async (req: Request, res: Response) => {
  try {
    const { tables = [] } = req.body;
    const result = await syncService.pullRemoteChanges(tables);
    
    res.json({
      success: result.success,
      data: result,
    });
  } catch (error) {
    logger.error('Pull sync failed', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Pull sync failed',
      code: 'PULL_FAILED',
    });
  }
});

/**
 * POST /api/sync/conflict/resolve
 * Resolve a sync conflict
 */
router.post('/conflict/resolve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { table, recordId, resolution, localData, remoteData } = req.body;
    
    if (!table || !recordId || !resolution) {
      return res.status(400).json({
        success: false,
        error: 'table, recordId, and resolution are required',
        code: 'INVALID_INPUT',
      });
    }
    
    await syncService.resolveConflict(table, recordId, resolution, localData, remoteData);
    
    res.json({
      success: true,
      message: 'Conflict resolved',
    });
  } catch (error) {
    logger.error('Conflict resolution failed', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Conflict resolution failed',
      code: 'CONFLICT_RESOLUTION_FAILED',
    });
  }
});

/**
 * GET /api/sync/providers
 * Get available sync providers
 */
router.get('/providers', authenticateToken, (req: Request, res: Response) => {
  const providers = [
    { id: 'sqlite', name: 'SQLite (Local)', sync: false },
    { id: 'supabase', name: 'Supabase (PostgreSQL)', sync: true },
    { id: 'turso', name: 'Turso (LibSQL)', sync: true },
    { id: 'azuresql', name: 'Azure SQL Database', sync: false },
  ];
  
  res.json({
    success: true,
    data: providers,
  });
});

export default router;