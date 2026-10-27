/**
 * Inventory Routes
 * Stock adjustments and stock movement history.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireManagerOrAdmin, validateBody } from '../middleware/auth';
import { logger } from '../services/logger';
import { lazyDatabaseProvider } from '../db/connection';

const router = Router();
const db = lazyDatabaseProvider();

const adjustmentSchema = z.object({
  productId: z.string().min(1),
  changeQty: z.number(),
  reason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

router.get('/adjustments', authenticateToken, async (req: Request, res: Response) => {
  try {
    const records = await db.findMany('inventory_adjustments', {
      filters: [{ field: 'deleted', operator: 'eq', value: false }],
      limit: 500,
    });
    res.json({ success: true, data: records });
  } catch (error) {
    logger.error('Failed to list inventory adjustments', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to fetch adjustments', code: 'FETCH_FAILED' });
  }
});

router.post('/adjustments', authenticateToken, requireManagerOrAdmin, validateBody(adjustmentSchema), async (req: Request, res: Response) => {
  try {
    const record = await db.create('inventory_adjustments', req.body as any);
    res.status(201).json({ success: true, data: record });
  } catch (error) {
    logger.error('Failed to create inventory adjustment', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to create adjustment', code: 'CREATE_FAILED' });
  }
});

router.post('/adjustments/:id/approve', authenticateToken, requireManagerOrAdmin, async (req: Request, res: Response) => {
  try {
    const record = await db.update('inventory_adjustments', req.params.id, { is_approved: true } as any);
    res.json({ success: true, data: record });
  } catch (error) {
    logger.error('Failed to approve inventory adjustment', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to approve adjustment', code: 'UPDATE_FAILED' });
  }
});

router.get('/stock-movements', authenticateToken, async (req: Request, res: Response) => {
  try {
    const records = await db.findMany('stock_movements', { limit: 500 });
    res.json({ success: true, data: records });
  } catch (error) {
    logger.error('Failed to list stock movements', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to fetch stock movements', code: 'FETCH_FAILED' });
  }
});

export default router;
