/**
 * API Routes - Main Router
 * Aggregates all API route modules
 */

import { Router } from 'express';
import authRoutes from './auth';
import productRoutes from './products';
import categoryRoutes from './categories';
import customerRoutes from './customers';
import supplierRoutes from './suppliers';
import saleRoutes from './sales';
import purchaseRoutes from './purchases';
import expenseRoutes from './expenses';
import chequeRoutes from './cheques';
import loanRoutes from './loans';
import inventoryRoutes from './inventory';
import employeeRoutes from './employees';
import settingsRoutes from './settings';
import syncRoutes from './sync';
import healthRoutes from './health';
import statsRoutes from './stats';
import databaseRoutes from './database';

const router = Router();

// API Version
router.get('/version', (req, res) => {
  res.json({
    success: true,
    version: '2.0.0',
    name: 'POS for Everything API',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/categories', categoryRoutes);
router.use('/customers', customerRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/sales', saleRoutes);
router.use('/purchases', purchaseRoutes);
router.use('/expenses', expenseRoutes);
router.use('/cheques', chequeRoutes);
router.use('/loans', loanRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/employees', employeeRoutes);
router.use('/settings', settingsRoutes);
router.use('/sync', syncRoutes);
router.use('/health', healthRoutes);
router.use('/stats', statsRoutes);
router.use('/database', databaseRoutes);

// 404 handler for API routes
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `API endpoint not found: ${req.method} ${req.path}`,
    code: 'NOT_FOUND',
  });
});

export default router;
