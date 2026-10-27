/**
 * Products Routes
 * CRUD operations for products
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, requireManagerOrAdmin, validateBody, validateQuery, validateParams } from '../middleware/auth';
import { logger } from '../services/logger';
import { lazyDatabaseProvider } from '../db/connection';
import type { Product, QueryParams } from '@pospro/core';

const router = Router();
const db = lazyDatabaseProvider();

// Validation schemas
const productCreateSchema = z.object({
  itemCode: z.string().min(1).max(50),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(50).optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  costPrice: z.number().nonnegative(),
  sellingPrice: z.number().positive(),
  wholesalePrice: z.number().nonnegative().optional(),
  mrp: z.number().nonnegative().optional(),
  taxRate: z.number().nonnegative().default(0),
  taxInclusive: z.boolean().default(false),
  hsnCode: z.string().max(20).optional(),
  stock: z.number().default(0),
  minStock: z.number().nonnegative().default(0),
  maxStock: z.number().positive().optional(),
  reorderLevel: z.number().nonnegative().optional(),
  reorderQuantity: z.number().positive().optional(),
  unit: z.enum(['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen']).default('pcs'),
  unitValue: z.number().positive().optional(),
  baseUnit: z.enum(['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen']).optional(),
  status: z.enum(['active', 'inactive', 'discontinued']).default('active'),
  isActive: z.boolean().default(true),
  trackInventory: z.boolean().default(true),
  allowNegativeStock: z.boolean().default(false),
  weight: z.number().positive().optional(),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  imageUrl: z.string().url().optional(),
  images: z.array(z.string().url()).optional(),
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  supplierSku: z.string().optional(),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().nonnegative().default(0),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const productUpdateSchema = productCreateSchema.partial();

const queryParamsSchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(2000).default(50),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().optional(),
  categoryId: z.string().optional(),
  isActive: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
  status: z.enum(['active', 'inactive', 'discontinued']).optional(),
  lowStock: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

const idParamSchema = z.object({
  id: z.string().min(1),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/products
 * List products with pagination and filtering
 */
router.get('/', authenticateToken, validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const { page, limit, sortBy, sortOrder, search, categoryId, isActive, status, lowStock } = req.query as any;
    
    const filters: any[] = [{ field: 'deleted', operator: 'eq', value: false }];
    
    if (categoryId) filters.push({ field: 'category_id', operator: 'eq', value: categoryId });
    if (isActive !== undefined) filters.push({ field: 'is_active', operator: 'eq', value: isActive });
    if (status) filters.push({ field: 'status', operator: 'eq', value: status });
    if (lowStock) filters.push({ field: 'stock', operator: 'lte', value: { field: 'min_stock' } });
    
    if (search) {
      filters.push({
        field: 'name',
        operator: 'like',
        value: search,
      });
    }
    
    const sorts = sortBy ? [{ field: sortBy, order: sortOrder }] : [{ field: 'name', order: 'asc' as const }];
    
    const offset = (page - 1) * limit;
    
    const [products, total] = await Promise.all([
      db!.findMany('products', { filters, sorts, limit, offset }),
      db!.count('products', filters),
    ]);
    
    res.json({
      success: true,
      data: products,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch products', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch products',
      code: 'FETCH_FAILED',
    });
  }
});

/**
 * GET /api/products/:id
 * Get single product by ID
 */
router.get('/:id', authenticateToken, validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const product = await db!.findById('products', req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        code: 'NOT_FOUND',
      });
    }
    
    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Failed to fetch product', { id: req.params.id }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
      code: 'FETCH_FAILED',
    });
  }
});

/**
 * GET /api/products/barcode/:barcode
 * Get product by barcode
 */
router.get('/barcode/:barcode', authenticateToken, async (req: Request, res: Response) => {
  try {
    const product = await db!.findFirst('products', {
      filters: [
        { field: 'barcode', operator: 'eq', value: req.params.barcode },
        { field: 'deleted', operator: 'eq', value: false },
      ],
    });
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        code: 'NOT_FOUND',
      });
    }
    
    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Failed to fetch product by barcode', { barcode: req.params.barcode }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch product',
      code: 'FETCH_FAILED',
    });
  }
});

/**
 * POST /api/products
 * Create new product
 */
router.post('/', authenticateToken, requireManagerOrAdmin, validateBody(productCreateSchema), async (req: Request, res: Response) => {
  try {
    const productData = req.body;
    const now = new Date().toISOString();
    
    // Check for duplicate item_code
    const existing = await db!.findFirst('products', {
      filters: [
        { field: 'item_code', operator: 'eq', value: productData.itemCode },
        { field: 'deleted', operator: 'eq', value: false },
      ],
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Product with this item code already exists',
        code: 'DUPLICATE_ITEM_CODE',
      });
    }
    
    // Check for duplicate barcode if provided
    if (productData.barcode) {
      const existingBarcode = await db!.findFirst('products', {
        filters: [
          { field: 'barcode', operator: 'eq', value: productData.barcode },
          { field: 'deleted', operator: 'eq', value: false },
        ],
      });
      
      if (existingBarcode) {
        return res.status(409).json({
          success: false,
          error: 'Product with this barcode already exists',
          code: 'DUPLICATE_BARCODE',
        });
      }
    }
    
    const product = await db!.create('products', {
      ...productData,
      synced: false,
      syncVersion: 0,
      createdAt: now,
      updatedAt: now,
    });
    
    logger.info('Product created', { id: product.id, itemCode: product.itemCode, name: product.name });
    
    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    logger.error('Failed to create product', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to create product',
      code: 'CREATE_FAILED',
    });
  }
});

/**
 * PUT /api/products/:id
 * Update product
 */
router.put('/:id', authenticateToken, requireManagerOrAdmin, validateParams(idParamSchema), validateBody(productUpdateSchema), async (req: Request, res: Response) => {
  try {
    const product = await db!.findById('products', req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        code: 'NOT_FOUND',
      });
    }
    
    // Check for duplicate item_code if being changed
    if (req.body.itemCode && req.body.itemCode !== product.itemCode) {
      const existing = await db!.findFirst('products', {
        filters: [
          { field: 'item_code', operator: 'eq', value: req.body.itemCode },
          { field: 'deleted', operator: 'eq', value: false },
        ],
      });
      
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Product with this item code already exists',
          code: 'DUPLICATE_ITEM_CODE',
        });
      }
    }
    
    const updated = await db!.update('products', req.params.id, {
      ...req.body,
      synced: false,
      syncVersion: (product.syncVersion || 0) + 1,
    });
    
    logger.info('Product updated', { id: updated.id, itemCode: updated.itemCode });
    
    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error('Failed to update product', { id: req.params.id }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to update product',
      code: 'UPDATE_FAILED',
    });
  }
});

/**
 * DELETE /api/products/:id
 * Soft delete product
 */
router.delete('/:id', authenticateToken, requireManagerOrAdmin, validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const product = await db!.findById('products', req.params.id);
    
    if (!product) {
      return res.status(404).json({
        success: false,
        error: 'Product not found',
        code: 'NOT_FOUND',
      });
    }
    
    await db!.softDelete('products', req.params.id);
    
    logger.info('Product deleted', { id: req.params.id, itemCode: product.itemCode });
    
    res.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    logger.error('Failed to delete product', { id: req.params.id }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to delete product',
      code: 'DELETE_FAILED',
    });
  }
});

/**
 * POST /api/products/:id/restore
 * Restore soft-deleted product
 */
router.post('/:id/restore', authenticateToken, requireManagerOrAdmin, validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    await db!.restore('products', req.params.id);
    
    res.json({
      success: true,
      message: 'Product restored successfully',
    });
  } catch (error) {
    logger.error('Failed to restore product', { id: req.params.id }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to restore product',
      code: 'RESTORE_FAILED',
    });
  }
});

/**
 * POST /api/products/bulk
 * Bulk create/update products
 */
router.post('/bulk', authenticateToken, requireManagerOrAdmin, async (req: Request, res: Response) => {
  try {
    const { products } = req.body;
    
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Products array is required',
        code: 'INVALID_INPUT',
      });
    }
    
    const results = await db!.batch(
      products.map((p: any) => ({
        type: p.id ? 'update' : 'create',
        table: 'products',
        id: p.id,
        data: p,
      }))
    );
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    res.json({
      success: failed === 0,
      data: {
        successful,
        failed,
        results,
      },
    });
  } catch (error) {
    logger.error('Bulk product operation failed', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Bulk operation failed',
      code: 'BULK_FAILED',
    });
  }
});

export default router;