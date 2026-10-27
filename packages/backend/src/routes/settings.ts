/**
 * Settings Routes
 * Application settings stored in the configured database provider.
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, requireAdmin, validateBody } from '../middleware/auth';
import { logger } from '../services/logger';
import { lazyDatabaseProvider } from '../db/connection';

const router = Router();
const db = lazyDatabaseProvider();

function parseSettingValue(raw: unknown): unknown {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

async function loadSettings(): Promise<Record<string, unknown>> {
  const records = await db.findMany<any>('settings', { limit: 500 });
  return records.reduce((acc: Record<string, unknown>, row: any) => {
    acc[row.key] = parseSettingValue(row.value);
    return acc;
  }, {});
}

router.get('/public', async (_req: Request, res: Response) => {
  try {
    const settings = await loadSettings();
    res.json({
      success: true,
      data: {
        shopName: settings.shopName ?? 'POS for Everything',
        currency: settings.currency ?? 'LKR',
        currencySymbol: settings.currencySymbol ?? 'Rs.',
        taxRate: settings.taxRate ?? 0,
        taxInclusive: settings.taxInclusive ?? false,
        theme: settings.theme ?? 'system',
      },
    });
  } catch (error) {
    logger.error('Failed to load public settings', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to fetch settings', code: 'FETCH_FAILED' });
  }
});

router.get('/', authenticateToken, async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, data: await loadSettings() });
  } catch (error) {
    logger.error('Failed to load settings', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to fetch settings', code: 'FETCH_FAILED' });
  }
});

router.put('/', authenticateToken, requireAdmin, validateBody({ key: 'key', value: 'value' } as any), async (req: Request, res: Response) => {
  try {
    const { key, value } = req.body as { key: string; value: unknown };
    const existing = await db.findMany<any>('settings', {
      filters: [{ field: 'key', operator: 'eq', value: key }],
      limit: 1,
    });

    if (existing.length > 0) {
      await db.update('settings', existing[0].id, { value } as any);
    } else {
      await db.create('settings', { key, value } as any);
    }

    res.json({ success: true, data: await loadSettings() });
  } catch (error) {
    logger.error('Failed to update setting', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to update setting', code: 'UPDATE_FAILED' });
  }
});

router.put('/bulk', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const settings = (req.body?.settings ?? req.body ?? {}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(settings)) {
      const existing = await db.findMany<any>('settings', {
        filters: [{ field: 'key', operator: 'eq', value: key }],
        limit: 1,
      });
      if (existing.length > 0) {
        await db.update('settings', existing[0].id, { value } as any);
      } else {
        await db.create('settings', { key, value } as any);
      }
    }
    res.json({ success: true, data: await loadSettings() });
  } catch (error) {
    logger.error('Failed to update settings', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to update settings', code: 'UPDATE_FAILED' });
  }
});

export default router;
