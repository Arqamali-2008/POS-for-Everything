/**
 * Stats Routes
 * Dashboard statistics and analytics
 */

import { Router, Request, Response } from 'express';
import { authenticateToken, validateQuery } from '../middleware/auth';
import { logger } from '../services/logger';
import { lazyDatabaseProvider } from '../db/connection';
import { z } from 'zod';
import type { QueryFilter } from '@pospro/core';

const router = Router();
const db = lazyDatabaseProvider();

const queryParamsSchema = z.object({
  period: z.enum(['today', 'yesterday', 'this_week', 'last_week', 'this_month', 'last_month', 'this_year', 'custom']).default('today'),
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
  branchId: z.string().optional(),
});

/**
 * GET /api/stats/dashboard
 * Dashboard summary statistics
 */
router.get('/dashboard', authenticateToken, validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const { period, dateFrom, dateTo, branchId } = req.query as any;
    
    // Calculate date range
    const now = new Date();
    let from: Date, to: Date = now;
    
    switch (period) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'this_week':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        break;
      case 'last_week':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        break;
      case 'this_month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'this_year':
        from = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = dateTo ? new Date(dateTo) : now;
        break;
      default:
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    
    const fromISO = from.toISOString();
    const toISO = to.toISOString();
    
    const branchFilter: QueryFilter[] = branchId ? [{ field: 'branch_id', operator: 'eq', value: branchId }] : [];
    
    // Parallel queries for dashboard stats
    const [
      productsCount,
      lowStockCount,
      customersCount,
      salesCount,
      salesTotal,
      salesByPayment,
      topProducts,
      recentSales,
    ] = await Promise.all([
      // Total products
      db!.count('products', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        ...branchFilter,
      ]),
      
      // Low stock products
      db!.count('products', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        { field: 'stock', operator: 'lte', value: { field: 'min_stock' } },
        ...branchFilter,
      ]),
      
      // Total customers
      db!.count('customers', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        ...branchFilter,
      ]),
      
      // Sales count in period
      db!.count('sales', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'created_at', operator: 'gte', value: fromISO },
        { field: 'created_at', operator: 'lte', value: toISO },
        ...branchFilter,
      ]),
      
      // Sales total in period
      db!.rawQuery<{ total: number }>(`
        SELECT COALESCE(SUM(grand_total), 0) as total 
        FROM sales 
        WHERE deleted = 0 
        AND created_at >= ? 
        AND created_at <= ?
        ${branchId ? 'AND branch_id = ?' : ''}
      `, [fromISO, toISO, branchId].filter(Boolean)),
      
      // Sales by payment type
      db!.rawQuery<{ payment_type: string; count: number; total: number }[]>(`
        SELECT payment_type, COUNT(*) as count, SUM(grand_total) as total
        FROM sales 
        WHERE deleted = 0 
        AND created_at >= ? 
        AND created_at <= ?
        ${branchId ? 'AND branch_id = ?' : ''}
        GROUP BY payment_type
      `, [fromISO, toISO, branchId].filter(Boolean)),
      
      // Top selling products
      db!.rawQuery<{ product_id: string; name: string; total_qty: number; total_revenue: number }[]>(`
        SELECT si.product_id, p.name, SUM(si.quantity) as total_qty, SUM(si.line_total) as total_revenue
        FROM sale_items si
        JOIN products p ON si.product_id = p.id
        JOIN sales s ON si.sale_id = s.id
        WHERE s.deleted = 0
        AND s.created_at >= ? AND s.created_at <= ?
        ${branchId ? 'AND s.branch_id = ?' : ''}
        GROUP BY si.product_id, p.name
        ORDER BY total_qty DESC
        LIMIT 10
      `, [fromISO, toISO, branchId].filter(Boolean)),
      
      // Recent sales
      db!.findMany('sales', {
        filters: [
          { field: 'deleted', operator: 'eq', value: false },
          { field: 'created_at', operator: 'gte', value: fromISO },
          { field: 'created_at', operator: 'lte', value: toISO },
          ...branchFilter,
        ],
        sorts: [{ field: 'created_at', order: 'desc' }],
        limit: 5,
      }),
    ]);
    
    // Calculate average sale value
    const avgSaleValue = salesCount > 0 && salesTotal[0] ? salesTotal[0].total / salesCount : 0;
    
    res.json({
      success: true,
      data: {
        period,
        dateRange: { from: fromISO, to: toISO },
        summary: {
          products: productsCount,
          lowStockAlerts: lowStockCount,
          customers: customersCount,
          sales: {
            count: salesCount,
            totalRevenue: salesTotal[0]?.total || 0,
            averageValue: Math.round(avgSaleValue * 100) / 100,
          },
        },
        salesByPayment: salesByPayment,
        topProducts,
        recentSales,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch dashboard stats', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch dashboard stats',
      code: 'FETCH_FAILED',
    });
  }
});

/**
 * GET /api/stats/sales
 * Sales statistics for charts
 */
router.get('/sales', authenticateToken, validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const { period, dateFrom, dateTo, branchId } = req.query as any;
    
    // Calculate date range
    const now = new Date();
    let from: Date, to: Date = now;
    
    switch (period) {
      case 'today':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'this_week':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        break;
      case 'last_week':
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
        break;
      case 'this_month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        to = new Date(now.getFullYear(), now.getMonth(), 0);
        break;
      case 'this_year':
        from = new Date(now.getFullYear(), 0, 1);
        break;
      case 'custom':
        from = dateFrom ? new Date(dateFrom) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
        to = dateTo ? new Date(dateTo) : now;
        break;
      default:
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }
    
    const fromISO = from.toISOString();
    const toISO = to.toISOString();
    
    const branchFilter = branchId ? 'AND s.branch_id = ?' : '';
    const params = [fromISO, toISO, branchId].filter(Boolean);
    
    // Hourly sales for today/week
    const hourlySales = await db!.rawQuery<{ hour: number; count: number; revenue: number }[]>(`
      SELECT 
        CAST(strftime('%H', created_at) AS INTEGER) as hour,
        COUNT(*) as count,
        SUM(grand_total) as revenue
      FROM sales
      WHERE deleted = 0
      AND created_at >= ? AND created_at <= ?
      ${branchFilter}
      GROUP BY hour
      ORDER BY hour
    `, params);
    
    // Daily sales for month/year
    const dailySales = await db!.rawQuery<{ date: string; count: number; revenue: number }[]>(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as count,
        SUM(grand_total) as revenue
      FROM sales
      WHERE deleted = 0
      AND created_at >= ? AND created_at <= ?
      ${branchFilter}
      GROUP BY date(created_at)
      ORDER BY date
    `, params);
    
    // Sales by category
    const categorySales = await db!.rawQuery<{ category: string; count: number; revenue: number }[]>(`
      SELECT 
        COALESCE(p.category_name, 'Uncategorized') as category,
        COUNT(DISTINCT s.id) as count,
        SUM(si.line_total) as revenue
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE s.deleted = 0
      AND s.created_at >= ? AND s.created_at <= ?
      ${branchFilter}
      GROUP BY category
      ORDER BY revenue DESC
    `, params);
    
    // Sales by cashier
    const cashierSales = await db!.rawQuery<{ cashier_id: string; cashier_name: string; count: number; revenue: number }[]>(`
      SELECT 
        cashier_id,
        cashier_name,
        COUNT(*) as count,
        SUM(grand_total) as revenue
      FROM sales
      WHERE deleted = 0
      AND created_at >= ? AND created_at <= ?
      ${branchFilter}
      GROUP BY cashier_id, cashier_name
      ORDER BY revenue DESC
    `, params);
    
    res.json({
      success: true,
      data: {
        period,
        dateRange: { from: fromISO, to: toISO },
        hourly: hourlySales,
        daily: dailySales,
        byCategory: categorySales,
        byCashier: cashierSales,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch sales stats', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sales stats',
      code: 'FETCH_FAILED',
    });
  }
});

/**
 * GET /api/stats/inventory
 * Inventory statistics
 */
router.get('/inventory', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { branchId } = req.query as any;
    const branchFilter: QueryFilter[] = branchId ? [{ field: 'branch_id', operator: 'eq', value: branchId }] : [];
    
    const [
      totalProducts,
      activeProducts,
      lowStockProducts,
      outOfStockProducts,
      inventoryValue,
      categoryBreakdown,
    ] = await Promise.all([
      db!.count('products', [
        { field: 'deleted', operator: 'eq', value: false },
        ...branchFilter,
      ]),
      db!.count('products', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        ...branchFilter,
      ]),
      db!.count('products', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        { field: 'stock', operator: 'lte', value: { field: 'min_stock' } },
        { field: 'stock', operator: 'gt', value: 0 },
        ...branchFilter,
      ]),
      db!.count('products', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        { field: 'stock', operator: 'lte', value: 0 },
        ...branchFilter,
      ]),
      db!.rawQuery<{ value: number }[]>(`
        SELECT COALESCE(SUM(stock * cost_price), 0) as value
        FROM products
        WHERE deleted = 0 AND is_active = 1
        ${branchId ? 'AND branch_id = ?' : ''}
      `, branchId ? [branchId] : []),
      db!.rawQuery<{ category: string; count: number; value: number }[]>(`
        SELECT 
          COALESCE(category_name, 'Uncategorized') as category,
          COUNT(*) as count,
          SUM(stock * cost_price) as value
        FROM products
        WHERE deleted = 0 AND is_active = 1
        ${branchId ? 'AND branch_id = ?' : ''}
        GROUP BY category
        ORDER BY value DESC
      `, branchId ? [branchId] : []),
    ]);
    
    res.json({
      success: true,
      data: {
        totalProducts,
        activeProducts,
        lowStockProducts,
        outOfStockProducts,
        inventoryValue: (inventoryValue as any[])[0]?.value || 0,
        categoryBreakdown,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch inventory stats', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inventory stats',
      code: 'FETCH_FAILED',
    });
  }
});

/**
 * GET /api/stats/customers
 * Customer statistics
 */
router.get('/customers', authenticateToken, validateQuery(queryParamsSchema), async (req: Request, res: Response) => {
  try {
    const { period, dateFrom, dateTo, branchId } = req.query as any;
    
    const now = new Date();
    let from: Date;
    
    switch (period) {
      case 'this_month':
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      case 'last_month':
        from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        break;
      case 'this_year':
        from = new Date(now.getFullYear(), 0, 1);
        break;
      default:
        from = new Date(now.getFullYear(), now.getMonth(), 1);
    }
    
    const fromISO = from.toISOString();
    const branchFilter = branchId ? 'AND c.branch_id = ?' : '';
    const params = [fromISO, branchId].filter(Boolean);
    
    const [
      totalCustomers,
      newCustomers,
      activeCustomers,
      topCustomers,
      customerTierBreakdown,
    ] = await Promise.all([
      db!.count('customers', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        ...(branchId ? ([{ field: 'branch_id', operator: 'eq', value: branchId }] as QueryFilter[]) : []),
      ]),
      db!.count('customers', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        { field: 'created_at', operator: 'gte', value: fromISO },
        ...(branchId ? ([{ field: 'branch_id', operator: 'eq', value: branchId }] as QueryFilter[]) : []),
      ]),
      db!.count('customers', [
        { field: 'deleted', operator: 'eq', value: false },
        { field: 'is_active', operator: 'eq', value: true },
        { field: 'last_purchase_at', operator: 'gte', value: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() },
        ...(branchId ? ([{ field: 'branch_id', operator: 'eq', value: branchId }] as QueryFilter[]) : []),
      ]),
      db!.rawQuery<{ id: string; name: string; total_spent: number; total_purchases: number }[]>(`
        SELECT id, name, total_spent, total_purchases
        FROM customers
        WHERE deleted = 0 AND is_active = 1
        ${branchFilter}
        ORDER BY total_spent DESC
        LIMIT 10
      `, branchId ? [branchId] : []),
      db!.rawQuery<{ tier: string; count: number }[]>(`
        SELECT COALESCE(tier, 'none') as tier, COUNT(*) as count
        FROM customers
        WHERE deleted = 0 AND is_active = 1
        ${branchFilter}
        GROUP BY tier
      `, branchId ? [branchId] : []),
    ]);
    
    res.json({
      success: true,
      data: {
        totalCustomers,
        newCustomers,
        activeCustomers,
        topCustomers,
        tierBreakdown: customerTierBreakdown,
      },
    });
  } catch (error) {
    logger.error('Failed to fetch customer stats', {}, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch customer stats',
      code: 'FETCH_FAILED',
    });
  }
});

export default router;