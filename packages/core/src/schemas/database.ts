/**
 * Drizzle ORM Schemas for AMi POS
 * Database-agnostic schema definitions that work with SQLite, PostgreSQL, and SQL Server
 */

import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  boolean,
  decimal,
  jsonb,
  pgEnum,
  index as pgIndex,
  uniqueIndex as pgUniqueIndex,
  primaryKey as pgPrimaryKey,
  foreignKey,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// ============================================================================
// Enums (PostgreSQL)
// ============================================================================

export const userRoleEnum = pgEnum('user_role', ['admin', 'manager', 'cashier']);
export const productStatusEnum = pgEnum('product_status', ['active', 'inactive', 'discontinued']);
export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'sale', 'purchase', 'return', 'adjustment_in', 'adjustment_out',
  'transfer_in', 'transfer_out', 'waste', 'count'
]);
export const unitTypeEnum = pgEnum('unit_type', [
  'pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen'
]);
export const paymentTypeEnum = pgEnum('payment_type', [
  'Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Credit', 'Mixed', 'Other'
]);
export const saleStatusEnum = pgEnum('sale_status', [
  'Completed', 'Pending', 'Cancelled', 'Refunded', 'Partial', 'Held'
]);
export const purchaseStatusEnum = pgEnum('purchase_status', [
  'Ordered', 'Received', 'Partial', 'Cancelled', 'Returned'
]);
export const expenseCategoryEnum = pgEnum('expense_category', [
  'Rent', 'Utilities', 'Salaries', 'Marketing', 'Maintenance',
  'Supplies', 'Transport', 'Insurance', 'Taxes', 'Other'
]);
export const chequeStatusEnum = pgEnum('cheque_status', [
  'Pending', 'Cleared', 'Bounced', 'Cancelled', 'Postdated'
]);
export const loanTypeEnum = pgEnum('loan_type', ['given', 'taken']);
export const loanStatusEnum = pgEnum('loan_status', [
  'Active', 'Paid', 'Overdue', 'Defaulted', 'Restructured'
]);
export const deviceTypeEnum = pgEnum('device_type', [
  'pos_terminal', 'kitchen_display', 'customer_display', 'mobile', 'tablet', 'desktop', 'printer', 'scanner'
]);
export const printerTypeEnum = pgEnum('printer_type', [
  'thermal_58mm', 'thermal_80mm', 'a4', 'label', 'network', 'bluetooth', 'usb'
]);
export const printJobStatusEnum = pgEnum('print_job_status', [
  'queued', 'printing', 'completed', 'failed', 'cancelled'
]);
export const syncStatusEnum = pgEnum('sync_status', [
  'disconnected', 'connecting', 'connected', 'syncing', 'synced', 'error', 'conflict'
]);
export const themeModeEnum = pgEnum('theme_mode', ['light', 'dark', 'system']);
export const invoiceTypeEnum = pgEnum('invoice_type', ['sale', 'return', 'quote', 'proforma']);

// ============================================================================
// SQLite Schemas (Local Development)
// ============================================================================

// Users
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').unique(),
  fullName: text('full_name').notNull(),
  role: text('role', { enum: ['admin', 'manager', 'cashier'] }).notNull().default('cashier'),
  branchId: text('branch_id'),
  avatarUrl: text('avatar_url'),
  phone: text('phone'),
  pinHash: text('pin_hash'),
  passwordHash: text('password_hash'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: text('last_login_at'),
  authProvider: text('auth_provider', { enum: ['supabase', 'local', 'azure_ad'] }).notNull().default('local'),
  supabaseUserId: text('supabase_user_id'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  emailIdx: uniqueIndex('users_email_idx').on(table.email),
  branchIdx: index('users_branch_idx').on(table.branchId),
}));

// Branches
export const branches = sqliteTable('branches', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  code: text('code').notNull().unique(),
  address: text('address').notNull(),
  phone: text('phone').notNull(),
  email: text('email').notNull(),
  gstin: text('gstin'),
  isMain: integer('is_main', { mode: 'boolean' }).notNull().default(false),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  settings: text('settings', { mode: 'json' }),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
});

// Categories
export const categories = sqliteTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  parentId: text('parent_id'),
  level: integer('level').notNull().default(0),
  sortOrder: integer('sort_order').notNull().default(0),
  imageUrl: text('image_url'),
  color: text('color'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  parentIdx: index('categories_parent_idx').on(table.parentId),
}));

// Products
export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  itemCode: text('item_code').notNull().unique(),
  sku: text('sku').unique(),
  barcode: text('barcode').unique(),
  name: text('name').notNull(),
  description: text('description'),
  categoryId: text('category_id'),
  categoryName: text('category_name'),
  subCategoryId: text('sub_category_id'),
  brandId: text('brand_id'),
  
  costPrice: real('cost_price').notNull().default(0),
  sellingPrice: real('selling_price').notNull(),
  wholesalePrice: real('wholesale_price'),
  mrp: real('mrp'),
  
  taxRate: real('tax_rate').notNull().default(0),
  taxInclusive: integer('tax_inclusive', { mode: 'boolean' }).notNull().default(false),
  hsnCode: text('hsn_code'),
  
  stock: real('stock').notNull().default(0),
  minStock: real('min_stock').notNull().default(0),
  maxStock: real('max_stock'),
  reorderLevel: real('reorder_level'),
  reorderQuantity: real('reorder_quantity'),
  unit: text('unit', { enum: ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen'] }).notNull().default('pcs'),
  unitValue: real('unit_value'),
  baseUnit: text('base_unit', { enum: ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen'] }),
  
  status: text('status', { enum: ['active', 'inactive', 'discontinued'] }).notNull().default('active'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  trackInventory: integer('track_inventory', { mode: 'boolean' }).notNull().default(true),
  allowNegativeStock: integer('allow_negative_stock', { mode: 'boolean' }).notNull().default(false),
  
  weight: real('weight'),
  dimensions: text('dimensions', { mode: 'json' }),
  
  imageUrl: text('image_url'),
  images: text('images', { mode: 'json' }),
  
  supplierId: text('supplier_id'),
  supplierName: text('supplier_name'),
  supplierSku: text('supplier_sku'),
  
  discountPercent: real('discount_percent').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  
  tags: text('tags', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  itemCodeIdx: uniqueIndex('products_item_code_idx').on(table.itemCode),
  barcodeIdx: uniqueIndex('products_barcode_idx').on(table.barcode),
  categoryIdx: index('products_category_idx').on(table.categoryId),
  skuIdx: uniqueIndex('products_sku_idx').on(table.sku),
}));

// Product Variants
export const productVariants = sqliteTable('product_variants', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sku: text('sku').notNull().unique(),
  barcode: text('barcode').unique(),
  costPrice: real('cost_price').notNull(),
  sellingPrice: real('selling_price').notNull(),
  stock: real('stock').notNull().default(0),
  attributes: text('attributes', { mode: 'json' }).notNull(),
  imageUrl: text('image_url'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  productIdx: index('product_variants_product_idx').on(table.productId),
  skuIdx: uniqueIndex('product_variants_sku_idx').on(table.sku),
}));

// Stock Movements
export const stockMovements = sqliteTable('stock_movements', {
  id: text('id').primaryKey(),
  productId: text('product_id').notNull().references(() => products.id),
  productName: text('product_name').notNull(),
  itemCode: text('item_code').notNull(),
  type: text('type', { enum: ['sale', 'purchase', 'return', 'adjustment_in', 'adjustment_out', 'transfer_in', 'transfer_out', 'waste', 'count'] }).notNull(),
  quantity: real('quantity').notNull(),
  previousStock: real('previous_stock').notNull(),
  newStock: real('new_stock').notNull(),
  unitCost: real('unit_cost'),
  totalCost: real('total_cost'),
  referenceId: text('reference_id'),
  referenceType: text('reference_type', { enum: ['sale', 'purchase', 'adjustment', 'transfer', 'return', 'count'] }),
  referenceNumber: text('reference_number'),
  reason: text('reason'),
  performedBy: text('performed_by').notNull(),
  performedByName: text('performed_by_name').notNull(),
  branchId: text('branch_id'),
  notes: text('notes'),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  productIdx: index('stock_movements_product_idx').on(table.productId),
  referenceIdx: index('stock_movements_reference_idx').on(table.referenceId, table.referenceType),
  dateIdx: index('stock_movements_date_idx').on(table.createdAt),
}));

// Customers
export const customers = sqliteTable('customers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  pincode: text('pincode'),
  country: text('country').notNull().default('Sri Lanka'),
  gstin: text('gstin'),
  
  creditLimit: real('credit_limit').notNull().default(0),
  currentBalance: real('current_balance').notNull().default(0),
  creditDays: integer('credit_days'),
  paymentTerms: text('payment_terms'),
  
  loyaltyPoints: integer('loyalty_points').notNull().default(0),
  totalPurchases: integer('total_purchases').notNull().default(0),
  totalSpent: real('total_spent').notNull().default(0),
  lastPurchaseAt: text('last_purchase_at'),
  
  customerGroup: text('customer_group'),
  tier: text('tier', { enum: ['bronze', 'silver', 'gold', 'platinum'] }),
  
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  isBlacklisted: integer('is_blacklisted', { mode: 'boolean' }).notNull().default(false),
  blacklistReason: text('blacklist_reason'),
  
  notes: text('notes'),
  tags: text('tags', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  phoneIdx: index('customers_phone_idx').on(table.phone),
  emailIdx: index('customers_email_idx').on(table.email),
  gstinIdx: index('customers_gstin_idx').on(table.gstin),
}));

// Customer Ledger
export const customerLedger = sqliteTable('customer_ledger', {
  id: text('id').primaryKey(),
  customerId: text('customer_id').notNull().references(() => customers.id, { onDelete: 'cascade' }),
  type: text('type', { enum: ['sale', 'payment', 'credit_note', 'debit_note', 'adjustment'] }).notNull(),
  referenceId: text('reference_id').notNull(),
  referenceNumber: text('reference_number').notNull(),
  debit: real('debit').notNull().default(0),
  credit: real('credit').notNull().default(0),
  balance: real('balance').notNull().default(0),
  description: text('description'),
  recordedBy: text('recorded_by').notNull(),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  customerIdx: index('customer_ledger_customer_idx').on(table.customerId),
  referenceIdx: index('customer_ledger_reference_idx').on(table.referenceId),
}));

// Suppliers
export const suppliers = sqliteTable('suppliers', {
  id: text('id').primaryKey(),
  companyName: text('company_name').notNull(),
  contactPerson: text('contact_person'),
  phone: text('phone').notNull(),
  email: text('email'),
  address: text('address'),
  city: text('city'),
  state: text('state'),
  pincode: text('pincode'),
  country: text('country').notNull().default('Sri Lanka'),
  gstin: text('gstin'),
  pan: text('pan'),
  
  currentBalance: real('current_balance').notNull().default(0),
  paymentTerms: text('payment_terms'),
  creditDays: integer('credit_days'),
  
  totalPurchases: integer('total_purchases').notNull().default(0),
  totalAmount: real('total_amount').notNull().default(0),
  lastPurchaseAt: text('last_purchase_at'),
  rating: real('rating'),
  
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  isPreferred: integer('is_preferred', { mode: 'boolean' }).notNull().default(false),
  
  bankName: text('bank_name'),
  accountNumber: text('account_number'),
  ifscCode: text('ifsc_code'),
  upiId: text('upi_id'),
  
  notes: text('notes'),
  tags: text('tags', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  phoneIdx: index('suppliers_phone_idx').on(table.phone),
  gstinIdx: index('suppliers_gstin_idx').on(table.gstin),
}));

// Employees
export const employees = sqliteTable('employees', {
  id: text('id').primaryKey(),
  salesCode: text('sales_code').notNull().unique(),
  name: text('name').notNull(),
  role: text('role', { enum: ['admin', 'manager', 'cashier'] }).notNull(),
  email: text('email'),
  phone: text('phone'),
  address: text('address'),
  dateOfBirth: text('date_of_birth'),
  dateOfJoining: text('date_of_joining'),
  
  salary: real('salary').notNull().default(0),
  salaryType: text('salary_type', { enum: ['monthly', 'daily', 'hourly', 'commission'] }).notNull().default('monthly'),
  commissionRate: real('commission_rate').notNull().default(0),
  commissionType: text('commission_type', { enum: ['sales', 'profit', 'collection'] }).notNull().default('sales'),
  
  pinHash: text('pin_hash'),
  permissions: text('permissions', { mode: 'json' }).notNull().default('[]'),
  canAccessReports: integer('can_access_reports', { mode: 'boolean' }).notNull().default(false),
  canManageInventory: integer('can_manage_inventory', { mode: 'boolean' }).notNull().default(false),
  canManageCustomers: integer('can_manage_customers', { mode: 'boolean' }).notNull().default(false),
  canProcessRefunds: integer('can_process_refunds', { mode: 'boolean' }).notNull().default(false),
  maxDiscountPercent: real('max_discount_percent').notNull().default(0),
  
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  lastLoginAt: text('last_login_at'),
  
  shiftId: text('shift_id'),
  branchId: text('branch_id'),
  
  notes: text('notes'),
  avatarUrl: text('avatar_url'),
  emergencyContact: text('emergency_contact'),
  emergencyPhone: text('emergency_phone'),
  bankDetails: text('bank_details', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  salesCodeIdx: uniqueIndex('employees_sales_code_idx').on(table.salesCode),
  branchIdx: index('employees_branch_idx').on(table.branchId),
}));

// Sales
export const sales = sqliteTable('sales', {
  id: text('id').primaryKey(),
  invoiceNo: text('invoice_no').notNull().unique(),
  invoiceType: text('invoice_type', { enum: ['sale', 'return', 'quote', 'proforma'] }).notNull().default('sale'),
  status: text('status', { enum: ['Completed', 'Pending', 'Cancelled', 'Refunded', 'Partial', 'Held'] }).notNull().default('Completed'),
  
  customerId: text('customer_id').references(() => customers.id),
  customerName: text('customer_name').notNull().default('Walk-in Customer'),
  customerPhone: text('customer_phone'),
  customerAddress: text('customer_address'),
  customerGstin: text('customer_gstin'),
  
  cashierId: text('cashier_id').notNull().references(() => employees.id),
  cashierName: text('cashier_name').notNull(),
  cashierCode: text('cashier_code'),
  
  branchId: text('branch_id'),
  branchName: text('branch_name'),
  
  subtotal: real('subtotal').notNull(),
  discountPercent: real('discount_percent').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  taxableAmount: real('taxable_amount').notNull(),
  taxAmount: real('tax_amount').notNull().default(0),
  taxBreakdown: text('tax_breakdown', { mode: 'json' }),
  grandTotal: real('grand_total').notNull(),
  roundingAdjustment: real('rounding_adjustment').notNull().default(0),
  
  paymentType: text('payment_type', { enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Credit', 'Mixed', 'Other'] }).notNull().default('Cash'),
  paymentDetails: text('payment_details', { mode: 'json' }),
  amountPaid: real('amount_paid').notNull().default(0),
  changeDue: real('change_due').notNull().default(0),
  balanceDue: real('balance_due').notNull().default(0),
  
  itemCount: integer('item_count').notNull().default(0),
  totalQuantity: real('total_quantity').notNull().default(0),
  
  note: text('note'),
  internalNote: text('internal_note'),
  tags: text('tags', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  originalInvoiceNo: text('original_invoice_no'),
  parentSaleId: text('parent_sale_id'),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  invoiceIdx: uniqueIndex('sales_invoice_idx').on(table.invoiceNo),
  customerIdx: index('sales_customer_idx').on(table.customerId),
  cashierIdx: index('sales_cashier_idx').on(table.cashierId),
  dateIdx: index('sales_date_idx').on(table.createdAt),
  statusIdx: index('sales_status_idx').on(table.status),
}));

// Sale Items
export const saleItems = sqliteTable('sale_items', {
  id: text('id').primaryKey(),
  saleId: text('sale_id').notNull().references(() => sales.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id),
  variantId: text('variant_id').references(() => productVariants.id),
  itemCode: text('item_code').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  unit: text('unit', { enum: ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen'] }).notNull(),
  
  quantity: real('quantity').notNull(),
  freeQuantity: real('free_quantity').notNull().default(0),
  returnedQuantity: real('returned_quantity').notNull().default(0),
  
  unitPrice: real('unit_price').notNull(),
  discountPercent: real('discount_percent').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  taxRate: real('tax_rate').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  taxInclusive: integer('tax_inclusive', { mode: 'boolean' }).notNull().default(false),
  costPrice: real('cost_price').notNull().default(0),
  lineTotal: real('line_total').notNull(),
  profit: real('profit').notNull().default(0),
  
  stockBefore: real('stock_before').notNull().default(0),
  stockAfter: real('stock_after').notNull().default(0),
  
  serialNumbers: text('serial_numbers', { mode: 'json' }),
  batchNumber: text('batch_number'),
  expiryDate: text('expiry_date'),
  metadata: text('metadata', { mode: 'json' }),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  saleIdx: index('sale_items_sale_idx').on(table.saleId),
  productIdx: index('sale_items_product_idx').on(table.productId),
}));

// Purchases
export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(),
  poNumber: text('po_number').notNull().unique(),
  supplierId: text('supplier_id').notNull().references(() => suppliers.id),
  supplierName: text('supplier_name').notNull(),
  status: text('status', { enum: ['Ordered', 'Received', 'Partial', 'Cancelled', 'Returned'] }).notNull().default('Ordered'),
  
  subtotal: real('subtotal').notNull(),
  discountPercent: real('discount_percent').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  grandTotal: real('grand_total').notNull(),
  paidAmount: real('paid_amount').notNull().default(0),
  balanceAmount: real('balance_amount').notNull().default(0),
  
  orderDate: text('order_date').notNull(),
  expectedDate: text('expected_date'),
  receivedDate: text('received_date'),
  billDate: text('bill_date'),
  
  note: text('note'),
  internalNote: text('internal_note'),
  terms: text('terms'),
  recordedBy: text('recorded_by').notNull(),
  branchId: text('branch_id'),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  originalPoNumber: text('original_po_number'),
  parentPurchaseId: text('parent_purchase_id'),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  poIdx: uniqueIndex('purchases_po_idx').on(table.poNumber),
  supplierIdx: index('purchases_supplier_idx').on(table.supplierId),
  dateIdx: index('purchases_date_idx').on(table.orderDate),
}));

// Purchase Items
export const purchaseItems = sqliteTable('purchase_items', {
  id: text('id').primaryKey(),
  purchaseId: text('purchase_id').notNull().references(() => purchases.id, { onDelete: 'cascade' }),
  productId: text('product_id').notNull().references(() => products.id),
  variantId: text('variant_id').references(() => productVariants.id),
  itemCode: text('item_code').notNull(),
  name: text('name').notNull(),
  unit: text('unit', { enum: ['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen'] }).notNull(),
  
  orderedQuantity: real('ordered_quantity').notNull(),
  receivedQuantity: real('received_quantity').notNull().default(0),
  returnedQuantity: real('returned_quantity').notNull().default(0),
  freeQuantity: real('free_quantity').notNull().default(0),
  
  unitCost: real('unit_cost').notNull(),
  discountPercent: real('discount_percent').notNull().default(0),
  discountAmount: real('discount_amount').notNull().default(0),
  taxRate: real('tax_rate').notNull().default(0),
  taxAmount: real('tax_amount').notNull().default(0),
  lineTotal: real('line_total').notNull(),
  
  batchNumber: text('batch_number'),
  expiryDate: text('expiry_date'),
  manufacturingDate: text('manufacturing_date'),
  
  serialNumbers: text('serial_numbers', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  purchaseIdx: index('purchase_items_purchase_idx').on(table.purchaseId),
  productIdx: index('purchase_items_product_idx').on(table.productId),
}));

// Expenses
export const expenses = sqliteTable('expenses', {
  id: text('id').primaryKey(),
  category: text('category', { enum: ['Rent', 'Utilities', 'Salaries', 'Marketing', 'Maintenance', 'Supplies', 'Transport', 'Insurance', 'Taxes', 'Other'] }).notNull(),
  amount: real('amount').notNull(),
  description: text('description').notNull(),
  paymentMethod: text('payment_method', { enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Credit', 'Mixed', 'Other'] }).notNull().default('Cash'),
  paymentReference: text('payment_reference'),
  date: text('date').notNull(),
  
  vendorId: text('vendor_id'),
  vendorName: text('vendor_name'),
  branchId: text('branch_id'),
  
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
  isApproved: integer('is_approved', { mode: 'boolean' }).notNull().default(false),
  
  receiptUrl: text('receipt_url'),
  receiptNumber: text('receipt_number'),
  
  isRecurring: integer('is_recurring', { mode: 'boolean' }).notNull().default(false),
  recurringFrequency: text('recurring_frequency', { enum: ['daily', 'weekly', 'monthly', 'yearly'] }),
  recurringEndDate: text('recurring_end_date'),
  
  tags: text('tags', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  dateIdx: index('expenses_date_idx').on(table.date),
  categoryIdx: index('expenses_category_idx').on(table.category),
  branchIdx: index('expenses_branch_idx').on(table.branchId),
}));

// Cheques
export const cheques = sqliteTable('cheques', {
  id: text('id').primaryKey(),
  chequeNo: text('cheque_no').notNull(),
  bankName: text('bank_name').notNull(),
  branchName: text('branch_name'),
  amount: real('amount').notNull(),
  dueDate: text('due_date').notNull(),
  status: text('status', { enum: ['Pending', 'Cleared', 'Bounced', 'Cancelled', 'Postdated'] }).notNull().default('Pending'),
  
  type: text('type', { enum: ['received', 'issued'] }).notNull(),
  partyId: text('party_id'),
  partyName: text('party_name').notNull(),
  partyType: text('party_type', { enum: ['customer', 'supplier'] }).notNull(),
  
  referenceId: text('reference_id'),
  referenceType: text('reference_type', { enum: ['sale', 'purchase', 'loan', 'expense', 'other'] }),
  referenceNumber: text('reference_number'),
  
  presentedDate: text('presented_date'),
  clearedDate: text('cleared_date'),
  bounceReason: text('bounce_reason'),
  bounceCharges: real('bounce_charges').notNull().default(0),
  
  note: text('note'),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  dueDateIdx: index('cheques_due_date_idx').on(table.dueDate),
  partyIdx: index('cheques_party_idx').on(table.partyId, table.partyType),
  statusIdx: index('cheques_status_idx').on(table.status),
}));

// Loans
export const loans = sqliteTable('loans', {
  id: text('id').primaryKey(),
  personName: text('person_name').notNull(),
  phone: text('phone'),
  email: text('email'),
  address: text('address'),
  loanType: text('loan_type', { enum: ['given', 'taken'] }).notNull(),
  principal: real('principal').notNull(),
  balance: real('balance').notNull(),
  interestRate: real('interest_rate'),
  interestType: text('interest_type', { enum: ['simple', 'compound'] }),
  dueDate: text('due_date'),
  status: text('status', { enum: ['Active', 'Paid', 'Overdue', 'Defaulted', 'Restructured'] }).notNull().default('Active'),
  
  installmentAmount: real('installment_amount'),
  installmentFrequency: text('installment_frequency', { enum: ['weekly', 'biweekly', 'monthly', 'quarterly'] }),
  totalInstallments: integer('total_installments'),
  paidInstallments: integer('paid_installments').notNull().default(0),
  nextDueDate: text('next_due_date'),
  
  referenceId: text('reference_id'),
  referenceType: text('reference_type'),
  
  guarantorName: text('guarantor_name'),
  guarantorPhone: text('guarantor_phone'),
  guarantorAddress: text('guarantor_address'),
  
  notes: text('notes'),
  purpose: text('purpose'),
  documents: text('documents', { mode: 'json' }),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  personIdx: index('loans_person_idx').on(table.personName, table.phone),
  statusIdx: index('loans_status_idx').on(table.status),
  dueDateIdx: index('loans_due_date_idx').on(table.dueDate),
}));

// Loan Payments
export const loanPayments = sqliteTable('loan_payments', {
  id: text('id').primaryKey(),
  loanId: text('loan_id').notNull().references(() => loans.id, { onDelete: 'cascade' }),
  amount: real('amount').notNull(),
  principalPortion: real('principal_portion').notNull(),
  interestPortion: real('interest_portion').notNull(),
  paymentMethod: text('payment_method', { enum: ['Cash', 'Card', 'UPI', 'Bank Transfer', 'Cheque', 'Credit', 'Mixed', 'Other'] }).notNull(),
  paymentReference: text('payment_reference'),
  paymentDate: text('payment_date').notNull(),
  receivedBy: text('received_by').notNull(),
  note: text('note'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  loanIdx: index('loan_payments_loan_idx').on(table.loanId),
  dateIdx: index('loan_payments_date_idx').on(table.paymentDate),
}));

// Inventory Adjustments
export const inventoryAdjustments = sqliteTable('inventory_adjustments', {
  id: text('id').primaryKey(),
  itemCode: text('item_code').notNull(),
  itemName: text('item_name').notNull(),
  productId: text('product_id').references(() => products.id),
  changeQty: real('change_qty').notNull(),
  previousStock: real('previous_stock').notNull(),
  newStock: real('new_stock').notNull(),
  reason: text('reason').notNull(),
  reasonCategory: text('reason_category', { enum: ['damage', 'expiry', 'theft', 'count', 'transfer', 'return', 'promotion', 'other'] }).notNull(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  approvedBy: text('approved_by'),
  approvedAt: text('approved_at'),
  isApproved: integer('is_approved', { mode: 'boolean' }).notNull().default(false),
  costImpact: real('cost_impact'),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  productIdx: index('inventory_adjustments_product_idx').on(table.productId),
  userIdx: index('inventory_adjustments_user_idx').on(table.userId),
  dateIdx: index('inventory_adjustments_date_idx').on(table.createdAt),
}));

// Daily Summaries
export const dailySummaries = sqliteTable('daily_summaries', {
  id: text('id').primaryKey(),
  date: text('date').notNull().unique(),
  branchId: text('branch_id'),
  
  openingCash: real('opening_cash').notNull().default(0),
  cashSales: real('cash_sales').notNull().default(0),
  cardSales: real('card_sales').notNull().default(0),
  upiSales: real('upi_sales').notNull().default(0),
  bankTransferSales: real('bank_transfer_sales').notNull().default(0),
  chequeSales: real('cheque_sales').notNull().default(0),
  creditSales: real('credit_sales').notNull().default(0),
  totalSales: real('total_sales').notNull().default(0),
  
  cashIn: real('cash_in').notNull().default(0),
  cashOut: real('cash_out').notNull().default(0),
  cashInDetails: text('cash_in_details', { mode: 'json' }),
  cashOutDetails: text('cash_out_details', { mode: 'json' }),
  
  closingCash: real('closing_cash').notNull().default(0),
  systemExpected: real('system_expected').notNull().default(0),
  difference: real('difference').notNull().default(0),
  differenceReason: text('difference_reason'),
  
  status: text('status', { enum: ['open', 'closed', 'disputed'] }).notNull().default('open'),
  closedBy: text('closed_by'),
  closedAt: text('closed_at'),
  
  notes: text('notes'),
  metadata: text('metadata', { mode: 'json' }),
  
  synced: integer('synced', { mode: 'boolean' }).notNull().default(false),
  syncedAt: text('synced_at'),
  syncVersion: integer('sync_version').notNull().default(0),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  dateIdx: uniqueIndex('daily_summaries_date_idx').on(table.date),
  branchIdx: index('daily_summaries_branch_idx').on(table.branchId),
}));

// Settings
export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  key: text('key').notNull().unique(),
  value: text('value', { mode: 'json' }).notNull(),
  type: text('type', { enum: ['string', 'number', 'boolean', 'object', 'array'] }).notNull(),
  category: text('category', { enum: ['general', 'printing', 'tax', 'payment', 'inventory', 'sync', 'appearance', 'advanced'] }).notNull(),
  label: text('label').notNull(),
  description: text('description'),
  isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
  isEditable: integer('is_editable', { mode: 'boolean' }).notNull().default(true),
  validation: text('validation', { mode: 'json' }),
  defaultValue: text('default_value', { mode: 'json' }),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
});

// Held Bills
export const heldBills = sqliteTable('held_bills', {
  id: text('id').primaryKey(),
  billData: text('bill_data', { mode: 'json' }).notNull(),
  heldBy: text('held_by').notNull(),
  heldByName: text('held_by_name').notNull(),
  tableNumber: text('table_number'),
  guestCount: integer('guest_count'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  heldByIdx: index('held_bills_held_by_idx').on(table.heldBy),
  expiresIdx: index('held_bills_expires_idx').on(table.expiresAt),
}));

// Devices
export const devices = sqliteTable('devices', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull().unique(),
  name: text('name').notNull(),
  type: text('type', { enum: ['pos_terminal', 'kitchen_display', 'customer_display', 'mobile', 'tablet', 'desktop', 'printer', 'scanner'] }).notNull(),
  branchId: text('branch_id'),
  
  canPrint: integer('can_print', { mode: 'boolean' }).notNull().default(false),
  canScan: integer('can_scan', { mode: 'boolean' }).notNull().default(false),
  canCashDrawer: integer('can_cash_drawer', { mode: 'boolean' }).notNull().default(false),
  canCustomerDisplay: integer('can_customer_display', { mode: 'boolean' }).notNull().default(false),
  
  ipAddress: text('ip_address'),
  macAddress: text('mac_address'),
  lastSeenAt: text('last_seen_at').notNull(),
  isOnline: integer('is_online', { mode: 'boolean' }).notNull().default(false),
  
  printerType: text('printer_type', { enum: ['thermal_58mm', 'thermal_80mm', 'a4', 'label', 'network', 'bluetooth', 'usb'] }),
  printerName: text('printer_name'),
  printerWidth: text('printer_width', { enum: ['58mm', '80mm', 'A4'] }),
  printerSettings: text('printer_settings', { mode: 'json' }),
  
  userAgent: text('user_agent'),
  appVersion: text('app_version'),
  os: text('os'),
  metadata: text('metadata', { mode: 'json' }),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
  deletedAt: text('deleted_at'),
  deleted: integer('deleted', { mode: 'boolean' }).notNull().default(false),
}, (table) => ({
  deviceIdIdx: uniqueIndex('devices_device_id_idx').on(table.deviceId),
  branchIdx: index('devices_branch_idx').on(table.branchId),
  onlineIdx: index('devices_online_idx').on(table.isOnline),
}));

// Print Jobs
export const printJobs = sqliteTable('print_jobs', {
  id: text('id').primaryKey(),
  sourceDeviceId: text('source_device_id').notNull().references(() => devices.id),
  targetDeviceId: text('target_device_id').references(() => devices.id),
  invoiceNumber: text('invoice_number').notNull(),
  receiptData: text('receipt_data').notNull(),
  status: text('status', { enum: ['queued', 'printing', 'completed', 'failed', 'cancelled'] }).notNull().default('queued'),
  copies: integer('copies').notNull().default(1),
  priority: integer('priority').notNull().default(0),
  
  queuedAt: text('queued_at').notNull(),
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  failedAt: text('failed_at'),
  errorMessage: text('error_message'),
  
  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  
  metadata: text('metadata', { mode: 'json' }),
  
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
  updatedAt: text('updated_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  sourceIdx: index('print_jobs_source_idx').on(table.sourceDeviceId),
  targetIdx: index('print_jobs_target_idx').on(table.targetDeviceId),
  statusIdx: index('print_jobs_status_idx').on(table.status),
  invoiceIdx: index('print_jobs_invoice_idx').on(table.invoiceNumber),
}));

// Sync Logs
export const syncLogs = sqliteTable('sync_logs', {
  id: text('id').primaryKey(),
  provider: text('provider', { enum: ['sqlite', 'supabase', 'turso', 'azuresql'] }).notNull(),
  direction: text('direction', { enum: ['push', 'pull', 'bidirectional'] }).notNull(),
  status: text('status', { enum: ['disconnected', 'connecting', 'connected', 'syncing', 'synced', 'error', 'conflict'] }).notNull(),
  tablesSynced: text('tables_synced', { mode: 'json' }).notNull().default('[]'),
  recordsPushed: integer('records_pushed').notNull().default(0),
  recordsPulled: integer('records_pulled').notNull().default(0),
  conflicts: integer('conflicts').notNull().default(0),
  errors: text('errors', { mode: 'json' }).notNull().default('[]'),
  startedAt: text('started_at').notNull(),
  completedAt: text('completed_at'),
  durationMs: integer('duration_ms'),
  triggeredBy: text('triggered_by', { enum: ['manual', 'auto', 'webhook', 'realtime'] }).notNull(),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  providerIdx: index('sync_logs_provider_idx').on(table.provider),
  statusIdx: index('sync_logs_status_idx').on(table.status),
  dateIdx: index('sync_logs_date_idx').on(table.startedAt),
}));

// Audit Logs
export const auditLogs = sqliteTable('audit_logs', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  action: text('action').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  oldValues: text('old_values', { mode: 'json' }),
  newValues: text('new_values', { mode: 'json' }),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  branchId: text('branch_id'),
  metadata: text('metadata', { mode: 'json' }),
  createdAt: text('created_at').notNull().default('CURRENT_TIMESTAMP'),
}, (table) => ({
  userIdx: index('audit_logs_user_idx').on(table.userId),
  entityIdx: index('audit_logs_entity_idx').on(table.entityType, table.entityId),
  dateIdx: index('audit_logs_date_idx').on(table.createdAt),
}));

// ============================================================================
// Relations
// ============================================================================

export const usersRelations = relations(users, ({ one, many }) => ({
  branch: one(branches, { fields: [users.branchId], references: [branches.id] }),
  sales: many(sales),
  stockMovements: many(stockMovements),
  inventoryAdjustments: many(inventoryAdjustments),
  heldBills: many(heldBills),
  devices: many(devices),
}));

export const branchesRelations = relations(branches, ({ many }) => ({
  users: many(users),
  products: many(products),
  sales: many(sales),
  purchases: many(purchases),
  expenses: many(expenses),
  dailySummaries: many(dailySummaries),
  devices: many(devices),
  employees: many(employees),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
  parent: one(categories, { fields: [categories.parentId], references: [categories.id] }),
  children: many(categories),
  products: many(products),
}));

export const productsRelations = relations(products, ({ one, many }) => ({
  category: one(categories, { fields: [products.categoryId], references: [categories.id] }),
  subCategory: one(categories, { fields: [products.subCategoryId], references: [categories.id] }),
  brand: one(categories, { fields: [products.brandId], references: [categories.id] }),
  supplier: one(suppliers, { fields: [products.supplierId], references: [suppliers.id] }),
  variants: many(productVariants),
  saleItems: many(saleItems),
  purchaseItems: many(purchaseItems),
  stockMovements: many(stockMovements),
  inventoryAdjustments: many(inventoryAdjustments),
}));

export const productVariantsRelations = relations(productVariants, ({ one, many }) => ({
  product: one(products, { fields: [productVariants.productId], references: [products.id] }),
  saleItems: many(saleItems),
  purchaseItems: many(purchaseItems),
}));

export const stockMovementsRelations = relations(stockMovements, ({ one }) => ({
  product: one(products, { fields: [stockMovements.productId], references: [products.id] }),
  performedByUser: one(users, { fields: [stockMovements.performedBy], references: [users.id] }),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  sales: many(sales),
  ledger: many(customerLedger),
  cheques: many(cheques),
}));

export const customerLedgerRelations = relations(customerLedger, ({ one }) => ({
  customer: one(customers, { fields: [customerLedger.customerId], references: [customers.id] }),
}));

export const suppliersRelations = relations(suppliers, ({ many }) => ({
  products: many(products),
  purchases: many(purchases),
  cheques: many(cheques),
}));

export const employeesRelations = relations(employees, ({ one, many }) => ({
  branch: one(branches, { fields: [employees.branchId], references: [branches.id] }),
  sales: many(sales),
  receivedLoanPayments: many(loanPayments),
}));

export const salesRelations = relations(sales, ({ one, many }) => ({
  customer: one(customers, { fields: [sales.customerId], references: [customers.id] }),
  cashier: one(employees, { fields: [sales.cashierId], references: [employees.id] }),
  branch: one(branches, { fields: [sales.branchId], references: [branches.id] }),
  items: many(saleItems),
  originalSale: one(sales, { fields: [sales.parentSaleId], references: [sales.id] }),
  returnSales: many(sales, { relationName: 'returns' }),
  cheques: many(cheques),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
  product: one(products, { fields: [saleItems.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [saleItems.variantId], references: [productVariants.id] }),
}));

export const purchasesRelations = relations(purchases, ({ one, many }) => ({
  supplier: one(suppliers, { fields: [purchases.supplierId], references: [suppliers.id] }),
  branch: one(branches, { fields: [purchases.branchId], references: [branches.id] }),
  items: many(purchaseItems),
  originalPurchase: one(purchases, { fields: [purchases.parentPurchaseId], references: [purchases.id] }),
  returnPurchases: many(purchases, { relationName: 'purchaseReturns' }),
  cheques: many(cheques),
}));

export const purchaseItemsRelations = relations(purchaseItems, ({ one }) => ({
  purchase: one(purchases, { fields: [purchaseItems.purchaseId], references: [purchases.id] }),
  product: one(products, { fields: [purchaseItems.productId], references: [products.id] }),
  variant: one(productVariants, { fields: [purchaseItems.variantId], references: [productVariants.id] }),
}));

export const expensesRelations = relations(expenses, ({ one }) => ({
  branch: one(branches, { fields: [expenses.branchId], references: [branches.id] }),
}));

export const chequesRelations = relations(cheques, ({ one }) => ({
  sale: one(sales, { fields: [cheques.referenceId], references: [sales.id] }),
  purchase: one(purchases, { fields: [cheques.referenceId], references: [purchases.id] }),
  customer: one(customers, { fields: [cheques.partyId], references: [customers.id] }),
  supplier: one(suppliers, { fields: [cheques.partyId], references: [suppliers.id] }),
}));

export const loansRelations = relations(loans, ({ many }) => ({
  payments: many(loanPayments),
}));

export const loanPaymentsRelations = relations(loanPayments, ({ one }) => ({
  loan: one(loans, { fields: [loanPayments.loanId], references: [loans.id] }),
  receivedByUser: one(users, { fields: [loanPayments.receivedBy], references: [users.id] }),
}));

export const inventoryAdjustmentsRelations = relations(inventoryAdjustments, ({ one }) => ({
  product: one(products, { fields: [inventoryAdjustments.productId], references: [products.id] }),
  user: one(users, { fields: [inventoryAdjustments.userId], references: [users.id] }),
  approver: one(users, { fields: [inventoryAdjustments.approvedBy], references: [users.id] }),
}));

export const dailySummariesRelations = relations(dailySummaries, ({ one }) => ({
  branch: one(branches, { fields: [dailySummaries.branchId], references: [branches.id] }),
}));

export const devicesRelations = relations(devices, ({ one, many }) => ({
  branch: one(branches, { fields: [devices.branchId], references: [branches.id] }),
  printJobsSent: many(printJobs, { relationName: 'sentJobs' }),
  printJobsReceived: many(printJobs, { relationName: 'receivedJobs' }),
}));

export const printJobsRelations = relations(printJobs, ({ one }) => ({
  sourceDevice: one(devices, { fields: [printJobs.sourceDeviceId], references: [devices.id], relationName: 'sentJobs' }),
  targetDevice: one(devices, { fields: [printJobs.targetDeviceId], references: [devices.id], relationName: 'receivedJobs' }),
}));

// ============================================================================
// Schema Collections for Easy Access
// ============================================================================

export const sqliteSchema = {
  users,
  branches,
  categories,
  products,
  productVariants,
  stockMovements,
  customers,
  customerLedger,
  suppliers,
  employees,
  sales,
  saleItems,
  purchases,
  purchaseItems,
  expenses,
  cheques,
  loans,
  loanPayments,
  inventoryAdjustments,
  dailySummaries,
  settings,
  heldBills,
  devices,
  printJobs,
  syncLogs,
  auditLogs,
};

export type SqliteSchema = typeof sqliteSchema;

// ============================================================================
// PostgreSQL Schemas (Supabase)
// ============================================================================

// Using the same structure but with PostgreSQL types
// These would be in a separate file for production, but included here for reference

export const pgSchema = {
  // Users with Supabase Auth integration
  users: pgTable('users', {
    id: uuid('id').primaryKey().defaultRandom(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    username: varchar('username', { length: 50 }).unique(),
    fullName: varchar('full_name', { length: 255 }).notNull(),
    role: userRoleEnum('role').notNull().default('cashier'),
    branchId: uuid('branch_id'),
    avatarUrl: varchar('avatar_url', { length: 500 }),
    phone: varchar('phone', { length: 20 }),
    pinHash: varchar('pin_hash', { length: 255 }),
    passwordHash: varchar('password_hash', { length: 255 }),
    isActive: boolean('is_active').notNull().default(true),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    authProvider: varchar('auth_provider', { length: 20 }).notNull().default('local'),
    supabaseUserId: uuid('supabase_user_id').unique(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deleted: boolean('deleted').notNull().default(false),
  }, (table) => ({
    emailIdx: pgUniqueIndex('users_email_idx').on(table.email),
    branchIdx: pgIndex('users_branch_idx').on(table.branchId),
    supabaseIdx: pgUniqueIndex('users_supabase_idx').on(table.supabaseUserId),
  })),
  
  // ... other tables would follow similar pattern
  // For brevity, only showing users table here
  // Full implementation would include all tables with proper PostgreSQL types
};

// ============================================================================
// Type Exports
// ============================================================================

export type User = typeof sqliteSchema.users.$inferSelect;
export type NewUser = typeof sqliteSchema.users.$inferInsert;
export type Branch = typeof sqliteSchema.branches.$inferSelect;
export type NewBranch = typeof sqliteSchema.branches.$inferInsert;
export type Category = typeof sqliteSchema.categories.$inferSelect;
export type NewCategory = typeof sqliteSchema.categories.$inferInsert;
export type Product = typeof sqliteSchema.products.$inferSelect;
export type NewProduct = typeof sqliteSchema.products.$inferInsert;
export type ProductVariant = typeof sqliteSchema.productVariants.$inferSelect;
export type NewProductVariant = typeof sqliteSchema.productVariants.$inferInsert;
export type StockMovement = typeof sqliteSchema.stockMovements.$inferSelect;
export type NewStockMovement = typeof sqliteSchema.stockMovements.$inferInsert;
export type Customer = typeof sqliteSchema.customers.$inferSelect;
export type NewCustomer = typeof sqliteSchema.customers.$inferInsert;
export type CustomerLedger = typeof sqliteSchema.customerLedger.$inferSelect;
export type NewCustomerLedger = typeof sqliteSchema.customerLedger.$inferInsert;
export type Supplier = typeof sqliteSchema.suppliers.$inferSelect;
export type NewSupplier = typeof sqliteSchema.suppliers.$inferInsert;
export type Employee = typeof sqliteSchema.employees.$inferSelect;
export type NewEmployee = typeof sqliteSchema.employees.$inferInsert;
export type Sale = typeof sqliteSchema.sales.$inferSelect;
export type NewSale = typeof sqliteSchema.sales.$inferInsert;
export type SaleItem = typeof sqliteSchema.saleItems.$inferSelect;
export type NewSaleItem = typeof sqliteSchema.saleItems.$inferInsert;
export type Purchase = typeof sqliteSchema.purchases.$inferSelect;
export type NewPurchase = typeof sqliteSchema.purchases.$inferInsert;
export type PurchaseItem = typeof sqliteSchema.purchaseItems.$inferSelect;
export type NewPurchaseItem = typeof sqliteSchema.purchaseItems.$inferInsert;
export type Expense = typeof sqliteSchema.expenses.$inferSelect;
export type NewExpense = typeof sqliteSchema.expenses.$inferInsert;
export type Cheque = typeof sqliteSchema.cheques.$inferSelect;
export type NewCheque = typeof sqliteSchema.cheques.$inferInsert;
export type Loan = typeof sqliteSchema.loans.$inferSelect;
export type NewLoan = typeof sqliteSchema.loans.$inferInsert;
export type LoanPayment = typeof sqliteSchema.loanPayments.$inferSelect;
export type NewLoanPayment = typeof sqliteSchema.loanPayments.$inferInsert;
export type InventoryAdjustment = typeof sqliteSchema.inventoryAdjustments.$inferSelect;
export type NewInventoryAdjustment = typeof sqliteSchema.inventoryAdjustments.$inferInsert;
export type DailySummary = typeof sqliteSchema.dailySummaries.$inferSelect;
export type NewDailySummary = typeof sqliteSchema.dailySummaries.$inferInsert;
export type Setting = typeof sqliteSchema.settings.$inferSelect;
export type NewSetting = typeof sqliteSchema.settings.$inferInsert;
export type HeldBill = typeof sqliteSchema.heldBills.$inferSelect;
export type NewHeldBill = typeof sqliteSchema.heldBills.$inferInsert;
export type Device = typeof sqliteSchema.devices.$inferSelect;
export type NewDevice = typeof sqliteSchema.devices.$inferInsert;
export type PrintJob = typeof sqliteSchema.printJobs.$inferSelect;
export type NewPrintJob = typeof sqliteSchema.printJobs.$inferInsert;
export type SyncLog = typeof sqliteSchema.syncLogs.$inferSelect;
export type NewSyncLog = typeof sqliteSchema.syncLogs.$inferInsert;
export type AuditLog = typeof sqliteSchema.auditLogs.$inferSelect;
export type NewAuditLog = typeof sqliteSchema.auditLogs.$inferInsert;