/**
 * Zod Validation Schemas for AMi POS
 * Used for runtime validation on both frontend and backend
 */

import { z } from 'zod';
import {
  UserRole,
  ProductStatus,
  StockMovementType,
  UnitType,
  PaymentType,
  SaleStatus,
  PurchaseStatus,
  ExpenseCategory,
  ChequeStatus,
  LoanType,
  LoanStatus,
  DatabaseProvider,
  SyncStatus,
  DeviceType,
  PrinterType,
  PrintJobStatus,
  ThemeMode,
  ConflictResolution,
  SyncDirection,
  InvoiceType,
} from '../constants/enums';

// ============================================================================
// Base Schemas
// ============================================================================

export const baseEntitySchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().optional(),
  deleted: z.boolean().default(false),
});

export const timestampedSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const softDeletableSchema = z.object({
  deleted: z.boolean().default(false),
  deletedAt: z.string().datetime().optional(),
});

export const syncedEntitySchema = z.object({
  synced: z.boolean().default(false),
  syncedAt: z.string().datetime().optional(),
  syncVersion: z.number().int().default(0),
});

// ============================================================================
// Enum Schemas
// ============================================================================

export const userRoleSchema = z.nativeEnum(UserRole);
export const productStatusSchema = z.nativeEnum(ProductStatus);
export const stockMovementTypeSchema = z.nativeEnum(StockMovementType);
export const unitTypeSchema = z.nativeEnum(UnitType);
export const paymentTypeSchema = z.nativeEnum(PaymentType);
export const saleStatusSchema = z.nativeEnum(SaleStatus);
export const purchaseStatusSchema = z.nativeEnum(PurchaseStatus);
export const expenseCategorySchema = z.nativeEnum(ExpenseCategory);
export const chequeStatusSchema = z.nativeEnum(ChequeStatus);
export const loanTypeSchema = z.nativeEnum(LoanType);
export const loanStatusSchema = z.nativeEnum(LoanStatus);
export const databaseProviderSchema = z.nativeEnum(DatabaseProvider);
export const syncStatusSchema = z.nativeEnum(SyncStatus);
export const deviceTypeSchema = z.nativeEnum(DeviceType);
export const printerTypeSchema = z.nativeEnum(PrinterType);
export const printJobStatusSchema = z.nativeEnum(PrintJobStatus);
export const themeModeSchema = z.nativeEnum(ThemeMode);
export const conflictResolutionSchema = z.nativeEnum(ConflictResolution);
export const syncDirectionSchema = z.nativeEnum(SyncDirection);
export const invoiceTypeSchema = z.nativeEnum(InvoiceType);

// ============================================================================
// Validation Helpers
// ============================================================================

const emailSchema = z.string().email().max(255);
const phoneSchema = z.string().max(20).regex(/^[\d\s\-\+\(\)]+$/);
const urlSchema = z.string().url().optional().nullable();
const positiveNumberSchema = z.number().nonnegative();
const decimalSchema = z.number().multipleOf(0.01); // 2 decimal places
const percentageSchema = z.number().min(0).max(100);
const currencySchema = z.number().multipleOf(0.01).nonnegative();

// ============================================================================
// User & Auth Schemas
// ============================================================================

export const userSchema = baseEntitySchema.extend({
  email: emailSchema,
  username: z.string().min(3).max(50).optional(),
  fullName: z.string().min(1).max(255),
  role: userRoleSchema,
  branchId: z.string().optional(),
  avatarUrl: urlSchema,
  phone: phoneSchema.optional(),
  pinHash: z.string().optional(),
  passwordHash: z.string().optional(),
  isActive: z.boolean().default(true),
  lastLoginAt: z.string().datetime().optional(),
  authProvider: z.enum(['supabase', 'local', 'azure_ad']).default('local'),
  supabaseUserId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const loginCredentialsSchema = z.object({
  email: emailSchema,
  password: z.string().min(6).max(128),
  rememberMe: z.boolean().default(false),
});

export const pinCredentialsSchema = z.object({
  email: emailSchema,
  pin: z.string().length(4).regex(/^\d{4}$/),
});

export const registerDataSchema = z.object({
  email: emailSchema,
  password: z.string().min(6).max(128),
  fullName: z.string().min(1).max(255),
  role: userRoleSchema.optional(),
  branchId: z.string().optional(),
});

// ============================================================================
// Branch Schema
// ============================================================================

export const branchSettingsSchema = z.object({
  currency: z.string().length(3).default('LKR'),
  currencySymbol: z.string().max(5).default('Rs.'),
  taxRate: z.number().multipleOf(0.01).nonnegative().default(0),
  taxInclusive: z.boolean().default(false),
  receiptHeader: z.string().max(500).default(''),
  receiptFooter: z.string().max(500).default('Thank you for your business!'),
  printerWidth: z.enum(['58mm', '80mm', 'A4']).default('80mm'),
  invoicePrefix: z.string().max(10).default('INV-'),
  timezone: z.string().default('Asia/Colombo'),
});

export const branchSchema = baseEntitySchema.extend({
  name: z.string().min(1).max(255),
  code: z.string().min(1).max(20).regex(/^[A-Z0-9_-]+$/),
  address: z.string().max(500),
  phone: phoneSchema,
  email: emailSchema,
  gstin: z.string().max(15).optional(),
  isMain: z.boolean().default(false),
  isActive: z.boolean().default(true),
  settings: branchSettingsSchema.optional(),
});

// ============================================================================
// Category Schema
// ============================================================================

export const categorySchema = baseEntitySchema.extend({
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  parentId: z.string().optional(),
  level: z.number().int().nonnegative().default(0),
  sortOrder: z.number().int().default(0),
  imageUrl: urlSchema,
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  isActive: z.boolean().default(true),
});

// ============================================================================
// Product Schemas
// ============================================================================

export const productSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  itemCode: z.string().min(1).max(50).regex(/^[A-Z0-9_-]+$/),
  sku: z.string().max(100).optional(),
  barcode: z.string().max(50).optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  categoryId: z.string().optional(),
  categoryName: z.string().optional(),
  subCategoryId: z.string().optional(),
  brandId: z.string().optional(),
  
  costPrice: currencySchema,
  sellingPrice: currencySchema,
  wholesalePrice: currencySchema.optional(),
  mrp: currencySchema.optional(),
  
  taxRate: z.number().multipleOf(0.01).nonnegative().default(0),
  taxInclusive: z.boolean().default(false),
  hsnCode: z.string().max(20).optional(),
  
  stock: z.number().default(0),
  minStock: z.number().nonnegative().default(0),
  maxStock: z.number().positive().optional(),
  reorderLevel: z.number().nonnegative().optional(),
  reorderQuantity: z.number().positive().optional(),
  unit: unitTypeSchema.default(UnitType.PCS),
  unitValue: z.number().positive().optional(),
  baseUnit: unitTypeSchema.optional(),
  
  status: productStatusSchema.default(ProductStatus.ACTIVE),
  isActive: z.boolean().default(true),
  trackInventory: z.boolean().default(true),
  allowNegativeStock: z.boolean().default(false),
  
  weight: z.number().positive().optional(),
  dimensions: z.object({
    length: z.number().positive(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).optional(),
  
  imageUrl: urlSchema,
  images: z.array(urlSchema).optional(),
  
  supplierId: z.string().optional(),
  supplierName: z.string().optional(),
  supplierSku: z.string().optional(),
  
  discountPercent: percentageSchema.default(0),
  discountAmount: currencySchema.default(0),
  
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const productVariantSchema = baseEntitySchema.extend({
  productId: z.string().min(1),
  name: z.string().min(1).max(255),
  sku: z.string().min(1).max(100),
  barcode: z.string().max(50).optional(),
  costPrice: currencySchema,
  sellingPrice: currencySchema,
  stock: z.number().default(0),
  attributes: z.record(z.string()),
  imageUrl: urlSchema,
  isActive: z.boolean().default(true),
});

export const stockMovementSchema = baseEntitySchema.extend({
  productId: z.string().min(1),
  productName: z.string().min(1).max(255),
  itemCode: z.string().min(1).max(50),
  type: stockMovementTypeSchema,
  quantity: z.number().refine((value) => value !== 0, { message: 'Quantity cannot be zero' }),
  previousStock: z.number(),
  newStock: z.number(),
  unitCost: currencySchema.optional(),
  totalCost: currencySchema.optional(),
  referenceId: z.string().optional(),
  referenceType: z.enum(['sale', 'purchase', 'adjustment', 'transfer', 'return', 'count']).optional(),
  referenceNumber: z.string().optional(),
  reason: z.string().max(500).optional(),
  performedBy: z.string().min(1),
  performedByName: z.string().min(1).max(255),
  branchId: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

// ============================================================================
// Customer Schemas
// ============================================================================

export const customerSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  name: z.string().min(1).max(255),
  phone: phoneSchema,
  email: emailSchema.optional().nullable(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  country: z.string().max(100).default('Sri Lanka'),
  gstin: z.string().max(15).optional(),
  
  creditLimit: currencySchema.default(0),
  currentBalance: z.number().default(0),
  creditDays: z.number().int().nonnegative().optional(),
  paymentTerms: z.string().max(100).optional(),
  
  loyaltyPoints: z.number().int().nonnegative().default(0),
  totalPurchases: z.number().int().nonnegative().default(0),
  totalSpent: currencySchema.default(0),
  lastPurchaseAt: z.string().datetime().optional(),
  
  customerGroup: z.string().max(50).optional(),
  tier: z.enum(['bronze', 'silver', 'gold', 'platinum']).optional(),
  
  isActive: z.boolean().default(true),
  isBlacklisted: z.boolean().default(false),
  blacklistReason: z.string().max(500).optional(),
  
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const customerLedgerSchema = baseEntitySchema.extend({
  customerId: z.string().min(1),
  type: z.enum(['sale', 'payment', 'credit_note', 'debit_note', 'adjustment']),
  referenceId: z.string().min(1),
  referenceNumber: z.string().min(1),
  debit: currencySchema.default(0),
  credit: currencySchema.default(0),
  balance: z.number().default(0),
  description: z.string().max(500).optional(),
  recordedBy: z.string().min(1),
});

// ============================================================================
// Supplier Schemas
// ============================================================================

export const supplierSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  companyName: z.string().min(1).max(255),
  contactPerson: z.string().max(255).optional(),
  phone: phoneSchema,
  email: emailSchema.optional().nullable(),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pincode: z.string().max(10).optional(),
  country: z.string().max(100).default('Sri Lanka'),
  gstin: z.string().max(15).optional(),
  pan: z.string().max(10).optional(),
  
  currentBalance: z.number().default(0),
  paymentTerms: z.string().max(100).optional(),
  creditDays: z.number().int().nonnegative().optional(),
  
  totalPurchases: z.number().int().nonnegative().default(0),
  totalAmount: currencySchema.default(0),
  lastPurchaseAt: z.string().datetime().optional(),
  rating: z.number().min(1).max(5).optional(),
  
  isActive: z.boolean().default(true),
  isPreferred: z.boolean().default(false),
  
  bankName: z.string().max(100).optional(),
  accountNumber: z.string().max(50).optional(),
  ifscCode: z.string().max(20).optional(),
  upiId: z.string().max(100).optional(),
  
  notes: z.string().max(2000).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Employee Schemas
// ============================================================================

export const employeeSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  salesCode: z.string().min(1).max(20).regex(/^[A-Z0-9_-]+$/),
  name: z.string().min(1).max(255),
  role: userRoleSchema,
  email: emailSchema.optional().nullable(),
  phone: phoneSchema.optional(),
  address: z.string().max(500).optional(),
  dateOfBirth: z.string().date().optional(),
  dateOfJoining: z.string().date().optional(),
  
  salary: currencySchema.default(0),
  salaryType: z.enum(['monthly', 'daily', 'hourly', 'commission']).default('monthly'),
  commissionRate: percentageSchema.default(0),
  commissionType: z.enum(['sales', 'profit', 'collection']).default('sales'),
  
  pinHash: z.string().optional(),
  permissions: z.array(z.string()).default([]),
  canAccessReports: z.boolean().default(false),
  canManageInventory: z.boolean().default(false),
  canManageCustomers: z.boolean().default(false),
  canProcessRefunds: z.boolean().default(false),
  maxDiscountPercent: percentageSchema.default(0),
  
  isActive: z.boolean().default(true),
  lastLoginAt: z.string().datetime().optional(),
  
  shiftId: z.string().optional(),
  branchId: z.string().optional(),
  
  notes: z.string().max(2000).optional(),
  avatarUrl: urlSchema,
  emergencyContact: z.string().max(255).optional(),
  emergencyPhone: phoneSchema.optional(),
  bankDetails: z.object({
    accountNumber: z.string().max(50),
    ifscCode: z.string().max(20),
    bankName: z.string().max(100),
  }).optional(),
});

// ============================================================================
// Sales Schemas
// ============================================================================

export const taxBreakdownSchema = z.object({
  taxName: z.string().min(1).max(100),
  rate: z.number().multipleOf(0.01).nonnegative(),
  taxableAmount: currencySchema,
  taxAmount: currencySchema,
  isInclusive: z.boolean(),
});

export const paymentDetailSchema = z.object({
  type: paymentTypeSchema,
  amount: currencySchema,
  reference: z.string().max(100).optional(),
  details: z.record(z.unknown()).optional(),
  receivedAt: z.string().datetime(),
});

export const saleItemSchema = baseEntitySchema.extend({
  saleId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().optional(),
  itemCode: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  description: z.string().max(500).optional(),
  unit: unitTypeSchema,
  
  quantity: z.number().positive(),
  freeQuantity: z.number().nonnegative().default(0),
  returnedQuantity: z.number().nonnegative().default(0),
  
  unitPrice: currencySchema,
  discountPercent: percentageSchema.default(0),
  discountAmount: currencySchema.default(0),
  taxRate: z.number().multipleOf(0.01).nonnegative().default(0),
  taxAmount: currencySchema.default(0),
  taxInclusive: z.boolean().default(false),
  costPrice: currencySchema.default(0),
  lineTotal: currencySchema,
  profit: z.number().default(0),
  
  stockBefore: z.number().default(0),
  stockAfter: z.number().default(0),
  
  serialNumbers: z.array(z.string()).optional(),
  batchNumber: z.string().max(50).optional(),
  expiryDate: z.string().date().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const saleSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  invoiceNo: z.string().min(1).max(50),
  invoiceType: invoiceTypeSchema.default(InvoiceType.SALE),
  status: saleStatusSchema.default(SaleStatus.COMPLETED),
  
  customerId: z.string().optional(),
  customerName: z.string().min(1).max(255).default('Walk-in Customer'),
  customerPhone: phoneSchema.optional(),
  customerAddress: z.string().max(500).optional(),
  customerGstin: z.string().max(15).optional(),
  
  cashierId: z.string().min(1),
  cashierName: z.string().min(1).max(255),
  cashierCode: z.string().optional(),
  
  branchId: z.string().optional(),
  branchName: z.string().optional(),
  
  subtotal: currencySchema,
  discountPercent: percentageSchema.default(0),
  discountAmount: currencySchema.default(0),
  taxableAmount: currencySchema,
  taxAmount: currencySchema.default(0),
  taxBreakdown: z.array(taxBreakdownSchema).optional(),
  grandTotal: currencySchema,
  roundingAdjustment: z.number().multipleOf(0.01).default(0),
  
  paymentType: paymentTypeSchema.default(PaymentType.CASH),
  paymentDetails: z.array(paymentDetailSchema).optional(),
  amountPaid: currencySchema.default(0),
  changeDue: currencySchema.default(0),
  balanceDue: currencySchema.default(0),
  
  itemCount: z.number().int().nonnegative().default(0),
  totalQuantity: z.number().nonnegative().default(0),
  
  note: z.string().max(1000).optional(),
  internalNote: z.string().max(1000).optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
  
  originalInvoiceNo: z.string().optional(),
  parentSaleId: z.string().optional(),
});

// ============================================================================
// Purchase Schemas
// ============================================================================

export const purchaseItemSchema = baseEntitySchema.extend({
  purchaseId: z.string().min(1),
  productId: z.string().min(1),
  variantId: z.string().optional(),
  itemCode: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  unit: unitTypeSchema,
  
  orderedQuantity: z.number().positive(),
  receivedQuantity: z.number().nonnegative().default(0),
  returnedQuantity: z.number().nonnegative().default(0),
  freeQuantity: z.number().nonnegative().default(0),
  
  unitCost: currencySchema,
  discountPercent: percentageSchema.default(0),
  discountAmount: currencySchema.default(0),
  taxRate: z.number().multipleOf(0.01).nonnegative().default(0),
  taxAmount: currencySchema.default(0),
  lineTotal: currencySchema,
  
  batchNumber: z.string().max(50).optional(),
  expiryDate: z.string().date().optional(),
  manufacturingDate: z.string().date().optional(),
  
  serialNumbers: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const purchaseSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  poNumber: z.string().min(1).max(50),
  supplierId: z.string().min(1),
  supplierName: z.string().min(1).max(255),
  status: purchaseStatusSchema.default(PurchaseStatus.ORDERED),
  
  subtotal: currencySchema,
  discountPercent: percentageSchema.default(0),
  discountAmount: currencySchema.default(0),
  taxAmount: currencySchema.default(0),
  grandTotal: currencySchema,
  paidAmount: currencySchema.default(0),
  balanceAmount: currencySchema.default(0),
  
  orderDate: z.string().date(),
  expectedDate: z.string().date().optional(),
  receivedDate: z.string().date().optional(),
  billDate: z.string().date().optional(),
  
  note: z.string().max(1000).optional(),
  internalNote: z.string().max(1000).optional(),
  terms: z.string().max(2000).optional(),
  recordedBy: z.string().min(1),
  branchId: z.string().optional(),
  
  originalPoNumber: z.string().optional(),
  parentPurchaseId: z.string().optional(),
});

// ============================================================================
// Expense Schema
// ============================================================================

export const expenseSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  category: expenseCategorySchema,
  amount: currencySchema,
  description: z.string().min(1).max(2000),
  paymentMethod: paymentTypeSchema.default(PaymentType.CASH),
  paymentReference: z.string().max(100).optional(),
  date: z.string().date(),
  
  vendorId: z.string().optional(),
  vendorName: z.string().max(255).optional(),
  branchId: z.string().optional(),
  
  approvedBy: z.string().optional(),
  approvedAt: z.string().datetime().optional(),
  isApproved: z.boolean().default(false),
  
  receiptUrl: urlSchema,
  receiptNumber: z.string().max(50).optional(),
  
  isRecurring: z.boolean().default(false),
  recurringFrequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']).optional(),
  recurringEndDate: z.string().date().optional(),
  
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Cheque Schema
// ============================================================================

export const chequeSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  chequeNo: z.string().min(1).max(50),
  bankName: z.string().min(1).max(100),
  branchName: z.string().max(100).optional(),
  amount: currencySchema,
  dueDate: z.string().date(),
  status: chequeStatusSchema.default(ChequeStatus.PENDING),
  
  type: z.enum(['received', 'issued']),
  partyId: z.string().optional(),
  partyName: z.string().min(1).max(255),
  partyType: z.enum(['customer', 'supplier']),
  
  referenceId: z.string().optional(),
  referenceType: z.enum(['sale', 'purchase', 'loan', 'expense', 'other']).optional(),
  referenceNumber: z.string().optional(),
  
  presentedDate: z.string().date().optional(),
  clearedDate: z.string().date().optional(),
  bounceReason: z.string().max(500).optional(),
  bounceCharges: currencySchema.default(0),
  
  note: z.string().max(1000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Loan Schemas
// ============================================================================

export const loanSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  personName: z.string().min(1).max(255),
  phone: phoneSchema.optional(),
  email: emailSchema.optional(),
  address: z.string().max(500).optional(),
  loanType: loanTypeSchema,
  principal: currencySchema.positive(),
  balance: currencySchema.nonnegative(),
  interestRate: z.number().multipleOf(0.01).nonnegative().optional(),
  interestType: z.enum(['simple', 'compound']).optional(),
  dueDate: z.string().date().optional(),
  status: loanStatusSchema.default(LoanStatus.ACTIVE),
  
  installmentAmount: currencySchema.optional(),
  installmentFrequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']).optional(),
  totalInstallments: z.number().int().positive().optional(),
  paidInstallments: z.number().int().nonnegative().default(0),
  nextDueDate: z.string().date().optional(),
  
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
  
  guarantorName: z.string().max(255).optional(),
  guarantorPhone: phoneSchema.optional(),
  guarantorAddress: z.string().max(500).optional(),
  
  notes: z.string().max(2000).optional(),
  purpose: z.string().max(500).optional(),
  documents: z.array(urlSchema).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const loanPaymentSchema = baseEntitySchema.extend({
  loanId: z.string().min(1),
  amount: currencySchema.positive(),
  principalPortion: currencySchema.nonnegative(),
  interestPortion: currencySchema.nonnegative(),
  paymentMethod: paymentTypeSchema,
  paymentReference: z.string().max(100).optional(),
  paymentDate: z.string().date(),
  receivedBy: z.string().min(1),
  note: z.string().max(500).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Inventory Adjustment Schema
// ============================================================================

export const inventoryAdjustmentSchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  itemCode: z.string().min(1).max(50),
  itemName: z.string().min(1).max(255),
  productId: z.string().optional(),
  changeQty: z.number().refine((value) => value !== 0, { message: 'Change quantity cannot be zero' }),
  previousStock: z.number(),
  newStock: z.number(),
  reason: z.string().min(1).max(500),
  reasonCategory: z.enum(['damage', 'expiry', 'theft', 'count', 'transfer', 'return', 'promotion', 'other']),
  userId: z.string().min(1),
  userName: z.string().min(1).max(255),
  approvedBy: z.string().optional(),
  approvedAt: z.string().datetime().optional(),
  isApproved: z.boolean().default(false),
  costImpact: currencySchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Daily Summary Schema
// ============================================================================

export const cashFlowDetailSchema = z.object({
  type: z.string().min(1).max(50),
  amount: currencySchema,
  reference: z.string().max(100).optional(),
  description: z.string().max(255).optional(),
  timestamp: z.string().datetime(),
});

export const dailySummarySchema = baseEntitySchema.merge(syncedEntitySchema).extend({
  date: z.string().date(),
  branchId: z.string().optional(),
  
  openingCash: currencySchema.default(0),
  cashSales: currencySchema.default(0),
  cardSales: currencySchema.default(0),
  upiSales: currencySchema.default(0),
  bankTransferSales: currencySchema.default(0),
  chequeSales: currencySchema.default(0),
  creditSales: currencySchema.default(0),
  totalSales: currencySchema.default(0),
  
  cashIn: currencySchema.default(0),
  cashOut: currencySchema.default(0),
  cashInDetails: z.array(cashFlowDetailSchema).optional(),
  cashOutDetails: z.array(cashFlowDetailSchema).optional(),
  
  closingCash: currencySchema.default(0),
  systemExpected: currencySchema.default(0),
  difference: z.number().multipleOf(0.01).default(0),
  differenceReason: z.string().max(500).optional(),
  
  status: z.enum(['open', 'closed', 'disputed']).default('open'),
  closedBy: z.string().optional(),
  closedAt: z.string().datetime().optional(),
  
  notes: z.string().max(2000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Settings Schema
// ============================================================================

export const settingSchema = baseEntitySchema.extend({
  key: z.string().min(1).max(100),
  value: z.unknown(),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
  category: z.enum(['general', 'printing', 'tax', 'payment', 'inventory', 'sync', 'appearance', 'advanced']),
  label: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  isPublic: z.boolean().default(false),
  isEditable: z.boolean().default(true),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.string()).optional(),
  }).optional(),
  defaultValue: z.unknown().optional(),
});

// ============================================================================
// Held Bill Schema
// ============================================================================

export const heldBillItemSchema = saleItemSchema.omit({ saleId: true, id: true, createdAt: true, updatedAt: true });

export const heldBillSchema = baseEntitySchema.extend({
  billData: z.object({
    items: z.array(heldBillItemSchema),
    customerId: z.string().optional(),
    customerName: z.string().max(255).default('Walk-in Customer'),
    discountPercent: percentageSchema.default(0),
    discountAmount: currencySchema.default(0),
    note: z.string().max(1000).optional(),
    paymentType: paymentTypeSchema.optional(),
  }),
  heldBy: z.string().min(1),
  heldByName: z.string().min(1).max(255),
  tableNumber: z.string().max(20).optional(),
  guestCount: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
});

// ============================================================================
// Device & Print Queue Schemas
// ============================================================================

export const deviceSchema = baseEntitySchema.extend({
  deviceId: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  type: deviceTypeSchema,
  branchId: z.string().optional(),
  
  canPrint: z.boolean().default(false),
  canScan: z.boolean().default(false),
  canCashDrawer: z.boolean().default(false),
  canCustomerDisplay: z.boolean().default(false),
  
  ipAddress: z.string().ip().optional(),
  macAddress: z.string().regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/).optional(),
  lastSeenAt: z.string().datetime(),
  isOnline: z.boolean().default(false),
  
  printerType: printerTypeSchema.optional(),
  printerName: z.string().max(255).optional(),
  printerWidth: z.enum(['58mm', '80mm', 'A4']).optional(),
  printerSettings: z.record(z.unknown()).optional(),
  
  userAgent: z.string().optional(),
  appVersion: z.string().optional(),
  os: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const printJobSchema = baseEntitySchema.extend({
  sourceDeviceId: z.string().min(1),
  targetDeviceId: z.string().optional(),
  invoiceNumber: z.string().min(1).max(50),
  receiptData: z.string().min(1),
  status: printJobStatusSchema.default(PrintJobStatus.QUEUED),
  copies: z.number().int().positive().default(1),
  priority: z.number().int().default(0),
  
  queuedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  failedAt: z.string().datetime().optional(),
  errorMessage: z.string().max(1000).optional(),
  
  retryCount: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().positive().default(3),
  
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// Sync & Audit Schemas
// ============================================================================

export const syncErrorSchema = z.object({
  table: z.string().min(1),
  recordId: z.string().optional(),
  error: z.string().min(1),
  operation: z.enum(['create', 'update', 'delete']),
  resolved: z.boolean().default(false),
  resolution: conflictResolutionSchema.optional(),
});

export const syncLogSchema = baseEntitySchema.extend({
  provider: databaseProviderSchema,
  direction: syncDirectionSchema,
  status: syncStatusSchema,
  tablesSynced: z.array(z.string()),
  recordsPushed: z.number().int().nonnegative().default(0),
  recordsPulled: z.number().int().nonnegative().default(0),
  conflicts: z.number().int().nonnegative().default(0),
  errors: z.array(syncErrorSchema).default([]),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  durationMs: z.number().int().nonnegative().optional(),
  triggeredBy: z.enum(['manual', 'auto', 'webhook', 'realtime']),
});

export const auditLogSchema = baseEntitySchema.extend({
  userId: z.string().min(1),
  userName: z.string().min(1).max(255),
  action: z.string().min(1).max(100),
  entityType: z.string().min(1).max(100),
  entityId: z.string().min(1),
  oldValues: z.record(z.unknown()).optional(),
  newValues: z.record(z.unknown()).optional(),
  ipAddress: z.string().ip().optional(),
  userAgent: z.string().optional(),
  branchId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================================================
// API Response Schemas
// ============================================================================

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional(),
    timestamp: z.string().datetime(),
  });

export const paginatedResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  apiResponseSchema(z.array(dataSchema)).extend({
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    }),
  });

export const queryOptionsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(500).default(50),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  filters: z.record(z.unknown()).optional(),
  search: z.string().optional(),
  fields: z.array(z.string()).optional(),
});

export const bulkOperationResultSchema = z.object({
  success: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.array(z.object({
    id: z.string(),
    error: z.string(),
  })),
});

// ============================================================================
// Real-time Event Schemas
// ============================================================================

export const realtimePayloadSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    type: z.string(),
    entity: z.string(),
    operation: z.enum(['insert', 'update', 'delete']),
    data: dataSchema,
    oldData: dataSchema.optional(),
    timestamp: z.string().datetime(),
    sourceDeviceId: z.string().optional(),
    userId: z.string().optional(),
  });

export const wsEventSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    type: z.string(),
    data: dataSchema,
    timestamp: z.string().datetime(),
    sourceDeviceId: z.string().optional(),
  });

// ============================================================================
// Configuration Schemas
// ============================================================================

export const databaseConfigSchema = z.object({
  provider: databaseProviderSchema,
  
  sqlitePath: z.string().optional(),
  
  supabaseUrl: z.string().url().optional(),
  supabaseAnonKey: z.string().optional(),
  supabaseServiceKey: z.string().optional(),
  
  tursoUrl: z.string().url().optional(),
  tursoToken: z.string().optional(),
  tursoSyncUrl: z.string().url().optional(),
  
  azureServer: z.string().optional(),
  azureDatabase: z.string().optional(),
  azureUser: z.string().optional(),
  azurePassword: z.string().optional(),
  azureEncrypt: z.boolean().default(true),
  azureTrustServerCertificate: z.boolean().default(false),
  
  poolSize: z.number().int().positive().default(10),
  connectionTimeout: z.number().int().positive().default(30000),
  queryTimeout: z.number().int().positive().default(30000),
  enableLogging: z.boolean().default(false),
});

export const serverConfigSchema = z.object({
  port: z.number().int().positive().default(3000),
  host: z.string().default('0.0.0.0'),
  corsOrigins: z.array(z.string().url()).default([]),
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('15m'),
  refreshTokenExpiresIn: z.string().default('7d'),
  rateLimitWindowMs: z.number().int().positive().default(900000), // 15 min
  rateLimitMaxRequests: z.number().int().positive().default(100),
  bodySizeLimit: z.string().default('50mb'),
  requestTimeoutMs: z.number().int().positive().default(30000),
});

export const syncConfigSchema = z.object({
  enabled: z.boolean().default(false),
  intervalMs: z.number().int().positive().default(30000),
  batchSize: z.number().int().positive().default(100),
  maxRetries: z.number().int().positive().default(3),
  retryDelayMs: z.number().int().positive().default(5000),
  conflictResolution: conflictResolutionSchema.default(ConflictResolution.LAST_WRITE_WINS),
  tables: z.array(z.string()).default([]),
  direction: syncDirectionSchema.default(SyncDirection.BIDIRECTIONAL),
});

export const appConfigSchema = z.object({
  database: databaseConfigSchema,
  server: serverConfigSchema,
  sync: syncConfigSchema,
  auth: z.object({
    localAdminEmail: emailSchema.default('admin@pos.com'),
    localAdminPassword: z.string().min(6).default('admin123'),
    supabaseEnabled: z.boolean().default(false),
    sessionTimeoutMs: z.number().int().positive().default(900000), // 15 min
    maxLoginAttempts: z.number().int().positive().default(5),
    lockoutDurationMs: z.number().int().positive().default(900000), // 15 min
  }),
  features: z.object({
    multiBranch: z.boolean().default(false),
    loyaltyProgram: z.boolean().default(false),
    creditSales: z.boolean().default(true),
    purchaseManagement: z.boolean().default(true),
    expenseTracking: z.boolean().default(true),
    chequeManagement: z.boolean().default(true),
    loanTracking: z.boolean().default(true),
    inventoryAdjustments: z.boolean().default(true),
    dailyReconciliation: z.boolean().default(true),
    heldBills: z.boolean().default(true),
    barcodeScanning: z.boolean().default(true),
    voiceCommands: z.boolean().default(false),
    qrBackup: z.boolean().default(true),
    printQueue: z.boolean().default(true),
    realtimeSync: z.boolean().default(true),
  }),
});

// ============================================================================
// Type Exports (inferred from schemas)
// ============================================================================

export type User = z.infer<typeof userSchema>;
export type Branch = z.infer<typeof branchSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Product = z.infer<typeof productSchema>;
export type ProductVariant = z.infer<typeof productVariantSchema>;
export type StockMovement = z.infer<typeof stockMovementSchema>;
export type Customer = z.infer<typeof customerSchema>;
export type CustomerLedger = z.infer<typeof customerLedgerSchema>;
export type Supplier = z.infer<typeof supplierSchema>;
export type Employee = z.infer<typeof employeeSchema>;
export type Sale = z.infer<typeof saleSchema>;
export type SaleItem = z.infer<typeof saleItemSchema>;
export type Purchase = z.infer<typeof purchaseSchema>;
export type PurchaseItem = z.infer<typeof purchaseItemSchema>;
export type Expense = z.infer<typeof expenseSchema>;
export type Cheque = z.infer<typeof chequeSchema>;
export type Loan = z.infer<typeof loanSchema>;
export type LoanPayment = z.infer<typeof loanPaymentSchema>;
export type InventoryAdjustment = z.infer<typeof inventoryAdjustmentSchema>;
export type DailySummary = z.infer<typeof dailySummarySchema>;
export type Setting = z.infer<typeof settingSchema>;
export type HeldBill = z.infer<typeof heldBillSchema>;
export type Device = z.infer<typeof deviceSchema>;
export type PrintJob = z.infer<typeof printJobSchema>;
export type SyncLog = z.infer<typeof syncLogSchema>;
export type AuditLog = z.infer<typeof auditLogSchema>;
export type DatabaseConfig = z.infer<typeof databaseConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type SyncConfig = z.infer<typeof syncConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;