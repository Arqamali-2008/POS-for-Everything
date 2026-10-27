/**
 * Generic CRUD router factory.
 *
 * Several resource collections (categories, customers, suppliers, ...) share
 * the same list/create/update/delete semantics. This factory keeps the API
 * surface consistent without duplicating hundreds of lines of boilerplate.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticateToken, requireManagerOrAdmin, validateQuery, validateParams } from '../middleware/auth';
import { logger } from '../services/logger';
import { lazyDatabaseProvider } from '../db/connection';

export interface CrudOptions {
  table: string;
  /** Restrict write operations to managers/admins. */
  managerOnly?: boolean;
  /** Columns searched by ?search= (must exist on the table). */
  searchFields?: string[];
  /** Extra defaults applied when creating a record. */
  defaults?: Record<string, unknown>;
}

/** Fields a client may never set directly. */
const PROTECTED_FIELDS = new Set(['id', 'deleted', 'deleted_at', 'synced', 'synced_at', 'sync_version']);

const listQuerySchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(2000).default(50),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().optional(),
  status: z.string().optional(),
  category: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const idParamSchema = z.object({ id: z.string().min(1) });

function toFilterValue(value: unknown): string | number | boolean {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

export function createCrudRouter(options: CrudOptions): Router {
  const router = Router();
  const db = lazyDatabaseProvider();

  const writeMiddleware = options.managerOnly ? requireManagerOrAdmin : (_req: Request, _res: Response, next: NextFunction) => next();

  /** Drop client-supplied system fields so they can never be mass-assigned. */
  function sanitizePayload(body: unknown): Record<string, unknown> {
    const payload = { ...(body as Record<string, unknown>) };
    for (const field of PROTECTED_FIELDS) delete payload[field];
    return payload;
  }

  router.get('/', authenticateToken, validateQuery(listQuerySchema), async (req: Request, res: Response) => {
    try {
      const { page, limit, sortBy, sortOrder, search, status, category, categoryId, isActive } = req.query as any;
      const filters: any[] = [{ field: 'deleted', operator: 'eq', value: false }];

      if (status) filters.push({ field: 'status', operator: 'eq', value: status });
      if (category) filters.push({ field: 'category', operator: 'eq', value: category });
      if (categoryId) filters.push({ field: 'category_id', operator: 'eq', value: categoryId });
      if (isActive !== undefined) filters.push({ field: 'is_active', operator: 'eq', value: isActive });
  if (search && (options.searchFields?.length ?? 0) > 0) {
    filters.push({ field: options.searchFields![0], operator: 'like', value: search });
  }

      const sorts = sortBy ? [{ field: sortBy, order: sortOrder }] : undefined;
      const offset = (page - 1) * limit;

      const [records, total] = await Promise.all([
        db.findMany(options.table, { filters, sorts, limit, offset }),
        db.count(options.table, filters),
      ]);

      res.json({
        success: true,
        data: records,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / limit)),
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      });
    } catch (error) {
      logger.error(`Failed to list ${options.table}`, {}, error instanceof Error ? error : undefined);
      res.status(500).json({ success: false, error: 'Failed to fetch records', code: 'FETCH_FAILED' });
    }
  });

  router.get('/:id', authenticateToken, validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const record = await db.findById(options.table, req.params.id);
      if (!record) {
        res.status(404).json({ success: false, error: 'Record not found', code: 'NOT_FOUND' });
        return;
      }
      res.json({ success: true, data: record });
    } catch (error) {
      logger.error(`Failed to fetch ${options.table}`, {}, error instanceof Error ? error : undefined);
      res.status(500).json({ success: false, error: 'Failed to fetch record', code: 'FETCH_FAILED' });
    }
  });

  router.post('/', authenticateToken, writeMiddleware, async (req: Request, res: Response) => {
    try {
      const payload = { ...(options.defaults ?? {}), ...sanitizePayload(req.body) };
      const record = await db.create(options.table, payload as any);
      res.status(201).json({ success: true, data: record });
    } catch (error) {
      logger.error(`Failed to create ${options.table}`, {}, error instanceof Error ? error : undefined);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create record',
        code: 'CREATE_FAILED',
      });
    }
  });

  router.put('/:id', authenticateToken, writeMiddleware, validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      const payload = sanitizePayload(req.body);
      // Always reflect a fresh modification timestamp on manual updates.
      payload.updatedAt = new Date().toISOString();
      const record = await db.update(options.table, req.params.id, payload as any);
      res.json({ success: true, data: record });
    } catch (error) {
      logger.error(`Failed to update ${options.table}`, {}, error instanceof Error ? error : undefined);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to update record',
        code: 'UPDATE_FAILED',
      });
    }
  });

  router.delete('/:id', authenticateToken, writeMiddleware, validateParams(idParamSchema), async (req: Request, res: Response) => {
    try {
      await db.softDelete(options.table, req.params.id);
      res.json({ success: true, message: 'Record deleted successfully' });
    } catch (error) {
      logger.error(`Failed to delete ${options.table}`, {}, error instanceof Error ? error : undefined);
      res.status(500).json({ success: false, error: 'Failed to delete record', code: 'DELETE_FAILED' });
    }
  });

  return router;
}

export { toFilterValue };
