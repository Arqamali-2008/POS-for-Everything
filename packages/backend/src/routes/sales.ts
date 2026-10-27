/**
 * Sales Routes
 * CRUD operations for sales with atomic transactions
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateToken, validateBody, validateQuery, validateParams } from '../middleware/auth';
import { logger } from '../services/logger';
import { lazyDatabaseProvider } from '../db/connection';
import type { Sale, SaleItem, PaymentDetail, PaymentType, SaleStatus } from '@pospro/core';

const router = Router();
const db = lazyDatabaseProvider();

// Validation schemas
const saleItemSchema = z.object({
  productId: z.string().min(1),
  variantId: z.string().optional(),
  itemCode: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  unit: z.enum(['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen']),
  quantity: z.number().positive(),
  freeQuantity: z.number().nonnegative().default(0),
  unitPrice: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().nonnegative().default(0),
  taxRate: z.number().nonnegative().default(0),
  taxAmount: z.number().nonnegative().default(0),
  taxInclusive: z.boolean().default(false),
  costPrice: z.number().nonnegative().default(0),
  lineTotal: z.number().nonnegative(),
  profit: z.number().default(0),
});

const paymentDetailSchema = z.object({
  type: z.enum(['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Credit', 'Mixed', 'Other']),
  amount: z.number().nonnegative(),
  reference: z.string().max(100).optional(),
  details: z.record(z.unknown()).optional(),
  receivedAt: z.string().datetime(),
});

const saleCreateSchema = z.object({
  invoiceNo: z.string().min(1).max(50).optional(),
  invoiceType: z.enum(['sale', 'return', 'quote', 'proforma']).default('sale'),
  status: z.enum(['Completed', 'Pending', 'Cancelled', 'Refunded', 'Partial', 'Held']).default('Completed'),
  customerId: z.string().optional(),
  customerName: z.string().max(255).default('Walk-in Customer'),
  customerPhone: z.string().max(20).optional(),
  customerAddress: z.string().max(500).optional(),
  customerGstin: z.string().max(15).optional(),
  cashierId: z.string().min(1),
  cashierName: z.string().min(1).max(255),
  cashierCode: z.string().optional(),
  branchId: z.string().optional(),
  branchName: z.string().optional(),
  subtotal: z.number().nonnegative(),
  discountPercent: z.number().min(0).max(100).default(0),
  discountAmount: z.number().nonnegative().default(0),
  taxableAmount: z.number().nonnegative(),
  taxAmount: z.number().nonnegative().default(0),
  taxBreakdown: z.array(z.object({
    taxName: z.string(),
    rate: z.number().nonnegative(),
    taxableAmount: z.number().nonnegative(),
    taxAmount: z.number().nonnegative(),
    isInclusive: z.boolean(),
  })).optional(),
  grandTotal: z.number().nonnegative(),
  roundingAdjustment: z.number().default(0),
  paymentType: z.enum(['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Credit', 'Mixed', 'Other']).default('Cash'),
  paymentDetails: z.array(paymentDetailSchema).optional(),
  amountPaid: z.number().nonnegative().default(0),
  changeDue: z.number().nonnegative().default(0),
  balanceDue: z.number().nonnegative().default(0),
  items: z.array(saleItemSchema).min(1),
  note: z.string().max(1000).optional(),
  internalNote: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const saleUpdateSchema = saleCreateSchema.partial().omit({ items: true });

const queryParamsSchema = z.object({
  page: z.coerce.number().positive().default(1),
  limit: z.coerce.number().positive().max(500).default(50),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  search: z.string().optional(),
  customerId: z.string().optional(),
  cashierId: z.string().optional(),
  status: z.enum(['Completed', 'Pending', 'Cancelled', 'Refunded', 'Partial', 'Held']).optional(),
  paymentType: z.enum(['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Credit', 'Mixed', 'Other']).optional(),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  minAmount: z.coerce.number().nonnegative().optional(),
  maxAmount: z.coerce.number().nonnegative().optional(),
});

const idParamSchema = z.object({
  id: z.string().min(1),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * GET /api/sales
 * List sales with pagination and filtering
 */
router.get('/', authenticateToken, validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const { page, limit, sortBy, sortOrder, search, customerId, cashierId, status, paymentType, dateFrom, dateTo, minAmount, maxAmount } = req.query as any;
    
    const filters: any[] = [{ field: 'deleted', operator: 'eq', value: false }];
    
    if (customerId) filters.push({ field: 'customer_id', operator: 'eq', value: customerId });
    if (cashierId) filters.push({ field: 'cashier_id', operator: 'eq', value: cashierId });
    if (status) filters.push({ field: 'status', operator: 'eq', value: status });
    if (paymentType) filters.push({ field: 'payment_type', operator: 'eq', value: paymentType });
    if (dateFrom) filters.push({ field: 'created_at', operator: 'gte', value: dateFrom });
    if (dateTo) filters.push({ field: 'created_at', operator: 'lte', value: dateTo });
    if (minAmount) filters.push({ field: 'grand_total', operator: 'gte', value: minAmount });
    if (maxAmount) filters.push({ field: 'grand_total', operator: 'lte', value: maxAmount });
    
    if (search) {
      filters.push({
        field: 'invoice_no',
        operator: 'like',
        value: search,
      });
    }
    
    const sorts = sortBy ? [{ field: sortBy, order: sortOrder }] : [{ field: 'created_at', order: 'desc' as const }];
    const offset = (page - 1) * limit;
    
    const [sales, total] = await Promise.all([
      db!.findMany('sales', { filters, sorts, limit, offset }),
      db!.count('sales', filters),
    ]);
    
    // Fetch items for each sale
    const salesWithItems = await Promise.all(
      sales.map(async (sale: any) => {
        const items = await db!.findMany('sale_items', {
          filters: [{ field: 'sale_id', operator: 'eq', value: sale.id }],
        });
        return { ...sale, items };
      })
    );
    
    res.json({
      success: true,
      data: salesWithItems,
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
    logger.error('Failed to fetch sales', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales',
      code: 'FETCH_FAILED',
    });
  }
});

/**
 * GET /api/sales/:id
 * Get single sale with items
 */
router.get('/:id', authenticateToken, validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const sale = await db!.findById('sales', req.params.id);
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found',
        code: 'NOT_FOUND',
      });
    }
    
    const items = await db!.findMany('sale_items', {
      filters: [{ field: 'sale_id', operator: 'eq', value: sale.id }],
    });
    
    res.json({
      success: true,
      data: { ...sale, items },
    });
  } catch (error) {
    logger.error('Failed to fetch sale', { id: req.params.id }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sale',
      code: 'FETCH_FAILED',
    });
  }
});

/**
 * POST /api/sales
 * Create new sale with atomic transaction
 */
router.post('/', authenticateToken, validateBody(saleCreateSchema), async (req: Request, res: Response) => {
  try {
    const saleData = req.body;
    const { items, ...saleFields } = saleData;
    const now = new Date().toISOString();
    
    // Generate invoice number if not provided
    const invoiceNo = saleFields.invoiceNo || `INV-${Date.now().toString().slice(-6)}`;
    
    // Check for duplicate invoice
    const existing = await db!.findFirst('sales', {
      filters: [
        { field: 'invoice_no', operator: 'eq', value: invoiceNo },
        { field: 'deleted', operator: 'eq', value: false },
      ],
    });
    
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Invoice number already exists',
        code: 'DUPLICATE_INVOICE',
      });
    }
    
    // Use transaction for atomic sale creation
    const result = await db!.transaction(async (tx) => {
      // Create sale
      const sale = await tx.create('sales', {
        ...saleFields,
        invoiceNo,
        synced: false,
        syncVersion: 0,
        createdAt: now,
        updatedAt: now,
      });
      
      // Create sale items and update inventory
      const createdItems = [];
      for (const item of items) {
        // Get current product stock
        const product = await tx.findById('products', item.productId);
        if (!product) {
          throw new Error(`Product not found: ${item.productId}`);
        }
        
        // Check stock availability
        if (product.trackInventory && !product.allowNegativeStock) {
          const availableStock = product.stock;
          if (item.quantity > availableStock) {
            throw new Error(`Insufficient stock for ${product.name}. Available: ${availableStock}, Requested: ${item.quantity}`);
          }
        }
        
        const stockBefore = product.stock;
        const stockAfter = stockBefore - item.quantity + (item.freeQuantity || 0);
        
        // Create sale item
        const saleItem = await tx.create('sale_items', {
          ...item,
          saleId: sale.id,
          stockBefore,
          stockAfter,
          createdAt: now,
          updatedAt: now,
        });
        createdItems.push(saleItem);
        
        // Update product stock
        await tx.update('products', product.id, {
          stock: stockAfter,
          updatedAt: now,
          synced: false,
          syncVersion: (product.syncVersion || 0) + 1,
        });
        
        // Record stock movement
        await tx.create('stock_movements', {
          productId: product.id,
          productName: product.name,
          itemCode: product.itemCode,
          type: 'sale',
          quantity: -item.quantity,
          previousStock: stockBefore,
          newStock: stockAfter,
          unitCost: product.costPrice,
          totalCost: product.costPrice * item.quantity,
          referenceId: sale.id,
          referenceType: 'sale',
          referenceNumber: invoiceNo,
          reason: `Sale ${invoiceNo}`,
          performedBy: req.user!.userId,
          performedByName: req.user!.email,
          branchId: saleFields.branchId,
          createdAt: now,
        });
      }
      
      return { sale, items: createdItems };
    });
    
    logger.info('Sale created', { 
      id: result.sale.id, 
      invoiceNo: result.sale.invoiceNo, 
      grandTotal: result.sale.grandTotal,
      itemCount: result.items.length 
    });
    
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Failed to create sale', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create sale',
      code: 'CREATE_FAILED',
    });
  }
});

/**
 * PUT /api/sales/:id
 * Update sale (limited fields, no items)
 */
router.put('/:id', authenticateToken, validateParams(idParamSchema), validateBody(saleUpdateSchema), async (req: Request, res: Response) => {
  try {
    const sale = await db!.findById('sales', req.params.id);
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found',
        code: 'NOT_FOUND',
      });
    }
    
    // Only allow certain fields to be updated
    const allowedUpdates = ['status', 'note', 'internalNote', 'tags', 'metadata'];
    const updates: any = {};
    
    for (const key of allowedUpdates) {
      if (key in req.body) {
        updates[key] = req.body[key];
      }
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No valid fields to update',
        code: 'INVALID_UPDATE',
      });
    }
    
    const updated = await db!.update('sales', req.params.id, {
      ...updates,
      synced: false,
      syncVersion: (sale.syncVersion || 0) + 1,
    });
    
    logger.info('Sale updated', { id: updated.id, updates: Object.keys(updates) });
    
    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    logger.error('Failed to update sale', { id: req.params.id }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to update sale',
      code: 'UPDATE_FAILED',
    });
  }
});

/**
 * POST /api/sales/:id/cancel
 * Cancel a sale (restore inventory)
 */
router.post('/:id/cancel', authenticateToken, validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const sale = await db!.findById('sales', req.params.id);
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found',
        code: 'NOT_FOUND',
      });
    }
    
    if (sale.status === 'Cancelled' || sale.status === 'Refunded') {
      return res.status(400).json({
        success: false,
        error: `Sale is already ${sale.status}`,
        code: 'INVALID_STATUS',
      });
    }
    
    const items = await db!.findMany('sale_items', {
      filters: [{ field: 'sale_id', operator: 'eq', value: sale.id }],
    });
    
    // Use transaction for atomic cancellation
    await db!.transaction(async (tx) => {
      // Update sale status
      await tx.update('sales', sale.id, {
        status: 'Cancelled',
        synced: false,
        syncVersion: (sale.syncVersion || 0) + 1,
      });
      
      // Restore inventory for each item
      for (const item of items) {
        const product = await tx.findById('products', item.productId);
        if (product && product.trackInventory) {
          const newStock = product.stock + item.quantity - (item.freeQuantity || 0);
          
          await tx.update('products', product.id, {
            stock: newStock,
            synced: false,
            syncVersion: (product.syncVersion || 0) + 1,
          });
          
          // Record stock movement
          await tx.create('stock_movements', {
            productId: product.id,
            productName: product.name,
            itemCode: product.itemCode,
            type: 'return',
            quantity: item.quantity,
            previousStock: product.stock,
            newStock,
            referenceId: sale.id,
            referenceType: 'sale',
            referenceNumber: sale.invoiceNo,
            reason: `Sale cancelled: ${sale.invoiceNo}`,
            performedBy: req.user!.userId,
            performedByName: req.user!.email,
            branchId: sale.branchId,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });
    
    logger.info('Sale cancelled', { id: sale.id, invoiceNo: sale.invoiceNo });
    
    res.json({
      success: true,
      message: 'Sale cancelled and inventory restored',
    });
  } catch (error) {
    logger.error('Failed to cancel sale', { id: req.params.id }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel sale',
      code: 'CANCEL_FAILED',
    });
  }
});

/**
 * POST /api/sales/:id/refund
 * Process refund for a sale
 */
router.post('/:id/refund', authenticateToken, validateParams(idParamSchema), async (req: Request, res: Response) => {
  try {
    const sale = await db!.findById('sales', req.params.id);
    
    if (!sale) {
      return res.status(404).json({
        success: false,
        error: 'Sale not found',
        code: 'NOT_FOUND',
      });
    }
    
    if (sale.status === 'Refunded') {
      return res.status(400).json({
        success: false,
        error: 'Sale is already refunded',
        code: 'INVALID_STATUS',
      });
    }
    
    const { items: refundItems, paymentType, amountPaid, note } = req.body;
    
    if (!refundItems || !Array.isArray(refundItems) || refundItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Refund items required',
        code: 'INVALID_INPUT',
      });
    }
    
    const originalItems = await db!.findMany('sale_items', {
      filters: [{ field: 'sale_id', operator: 'eq', value: sale.id }],
    });
    
    // Validate refund items against original sale
    for (const refundItem of refundItems) {
      const originalItem = originalItems.find(i => i.id === refundItem.saleItemId);
      if (!originalItem) {
        return res.status(400).json({
          success: false,
          error: `Invalid refund item: ${refundItem.saleItemId}`,
          code: 'INVALID_REFUND_ITEM',
        });
      }
      
      if (refundItem.quantity > originalItem.quantity - originalItem.returnedQuantity) {
        return res.status(400).json({
          success: false,
          error: `Cannot refund more than sold for ${originalItem.name}`,
          code: 'INVALID_REFUND_QUANTITY',
        });
      }
    }
    
    // Process refund
    await db!.transaction(async (tx) => {
      // Update sale status
      await tx.update('sales', sale.id, {
        status: 'Refunded',
        synced: false,
        syncVersion: (sale.syncVersion || 0) + 1,
      });
      
      // Process each refund item
      for (const refundItem of refundItems) {
        const originalItem = originalItems.find(i => i.id === refundItem.saleItemId)!;
        
        // Update sale item returned quantity
        await tx.update('sale_items', originalItem.id, {
          returnedQuantity: originalItem.returnedQuantity + refundItem.quantity,
        });
        
        // Restore inventory
        const product = await tx.findById('products', originalItem.productId);
        if (product && product.trackInventory) {
          const newStock = product.stock + refundItem.quantity;
          
          await tx.update('products', product.id, {
            stock: newStock,
            synced: false,
            syncVersion: (product.syncVersion || 0) + 1,
          });
          
          // Record stock movement
          await tx.create('stock_movements', {
            productId: product.id,
            productName: product.name,
            itemCode: product.itemCode,
            type: 'return',
            quantity: refundItem.quantity,
            previousStock: product.stock,
            newStock,
            referenceId: sale.id,
            referenceType: 'sale',
            referenceNumber: sale.invoiceNo,
            reason: `Refund for ${sale.invoiceNo}`,
            performedBy: req.user!.userId,
            performedByName: req.user!.email,
            branchId: sale.branchId,
            createdAt: new Date().toISOString(),
          });
        }
      }
    });
    
    logger.info('Sale refunded', { id: sale.id, invoiceNo: sale.invoiceNo });
    
    res.json({
      success: true,
      message: 'Refund processed successfully',
    });
  } catch (error) {
    logger.error('Failed to process refund', { id: req.params.id }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to process refund',
      code: 'REFUND_FAILED',
    });
  }
});

export default router;