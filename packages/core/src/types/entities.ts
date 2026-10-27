/**
 * Core Entity Types for AMi POS
 * These are the TypeScript interfaces shared across the entire application
 */

import {
  UserRole,
  AuthProvider,
  ProductStatus,
  StockMovementType,
  UnitType,
  PaymentType,
  SaleStatus,
  InvoiceType,
  PurchaseStatus,
  ExpenseCategory,
  ChequeStatus,
  LoanType,
  LoanStatus,
  DatabaseProvider,
  ConflictResolution,
  SyncDirection,
  SyncStatus,
  DeviceType,
  PrinterType,
  PrintJobStatus,
  ThemeMode,
} from '../constants/enums';

// ============================================================================
// Base Types
// ============================================================================

export interface BaseEntity {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  deletedAt?: string; // ISO 8601 (soft delete)
  deleted?: boolean;
}

export interface TimestampedEntity {
  createdAt: string;
  updatedAt: string;
}

export interface SoftDeletableEntity {
  deleted: boolean;
  deletedAt?: string;
}

export interface SyncedEntity {
  synced?: boolean;
  syncedAt?: string;
  syncVersion?: number;
}

// ============================================================================
// User & Authentication
// ============================================================================

export interface User extends BaseEntity {
  email: string;
  username?: string;
  fullName: string;
  role: UserRole;
  branchId?: string;
  avatarUrl?: string;
  phone?: string;
  pinHash?: string; // For PIN login
  passwordHash?: string; // For local auth
  isActive: boolean;
  lastLoginAt?: string;
  authProvider: 'supabase' | 'local' | 'azure_ad';
  supabaseUserId?: string; // Link to Supabase Auth
  metadata?: Record<string, unknown>;
}

export interface Session {
  user: User;
  accessToken: string;
  refreshToken?: string;
  expiresAt: string;
  provider: 'supabase' | 'local';
}

export interface LoginCredentials {
  email: string;
  password: string;
  rememberMe?: boolean;
}

export interface PinCredentials {
  email: string;
  pin: string;
}

export interface RegisterData {
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
  branchId?: string;
}

// ============================================================================
// Branch / Store
// ============================================================================

export interface Branch extends BaseEntity {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  gstin?: string;
  isMain: boolean;
  isActive: boolean;
  settings?: BranchSettings;
}

export interface BranchSettings {
  currency: string;
  currencySymbol: string;
  taxRate: number;
  taxInclusive: boolean;
  receiptHeader: string;
  receiptFooter: string;
  printerWidth: string;
  invoicePrefix: string;
  timezone: string;
}

// ============================================================================
// Categories
// ============================================================================

export interface Category extends BaseEntity {
  name: string;
  description?: string;
  parentId?: string; // For hierarchical categories
  level: number;
  sortOrder: number;
  imageUrl?: string;
  color?: string;
  isActive: boolean;
}

// ============================================================================
// Products
// ============================================================================

export interface Product extends BaseEntity, SyncedEntity {
  itemCode: string; // Unique human-readable code
  sku?: string; // Internal SKU
  barcode?: string;
  name: string;
  description?: string;
  categoryId?: string;
  categoryName?: string; // Denormalized for quick display
  subCategoryId?: string;
  brandId?: string;
  
  // Pricing
  costPrice: number;
  sellingPrice: number;
  wholesalePrice?: number;
  mrp?: number; // Maximum Retail Price
  
  // Tax
  taxRate: number;
  taxInclusive: boolean;
  hsnCode?: string; // Harmonized System Nomenclature
  
  // Inventory
  stock: number;
  minStock: number;
  maxStock?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  unit: UnitType;
  unitValue?: number; // e.g., 1 box = 12 pcs
  baseUnit?: UnitType; // Base unit for conversions
  
  // Status
  status: ProductStatus;
  isActive: boolean;
  trackInventory: boolean;
  allowNegativeStock: boolean;
  
  // Physical
  weight?: number; // in kg
  dimensions?: { length: number; width: number; height: number }; // in cm
  
  // Images
  imageUrl?: string;
  images?: string[];
  
  // Supplier
  supplierId?: string;
  supplierName?: string;
  supplierSku?: string;
  
  // Discounts
  discountPercent?: number;
  discountAmount?: number;
  
  // Metadata
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ProductVariant extends BaseEntity {
  productId: string;
  name: string;
  sku: string;
  barcode?: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  attributes: Record<string, string>; // e.g., { color: 'Red', size: 'L' }
  imageUrl?: string;
  isActive: boolean;
}

export interface StockMovement extends BaseEntity {
  productId: string;
  productName: string;
  itemCode: string;
  type: StockMovementType;
  quantity: number; // Positive for in, negative for out
  previousStock: number;
  newStock: number;
  unitCost?: number;
  totalCost?: number;
  referenceId?: string; // Sale ID, Purchase ID, etc.
  referenceType?: 'sale' | 'purchase' | 'adjustment' | 'transfer' | 'return' | 'count';
  referenceNumber?: string; // Invoice number, PO number
  reason?: string;
  performedBy: string; // User ID
  performedByName: string;
  branchId?: string;
  notes?: string;
}

// ============================================================================
// Customers
// ============================================================================

export interface Customer extends BaseEntity, SyncedEntity {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
  
  // Credit
  creditLimit: number;
  currentBalance: number;
  creditDays?: number;
  paymentTerms?: string;
  
  // Loyalty
  loyaltyPoints: number;
  totalPurchases: number;
  totalSpent: number;
  lastPurchaseAt?: string;
  
  // Classification
  customerGroup?: string; // 'retail', 'wholesale', 'vip', etc.
  tier?: 'bronze' | 'silver' | 'gold' | 'platinum';
  
  // Status
  isActive: boolean;
  isBlacklisted: boolean;
  blacklistReason?: string;
  
  // Metadata
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface CustomerLedger extends BaseEntity {
  customerId: string;
  type: 'sale' | 'payment' | 'credit_note' | 'debit_note' | 'adjustment';
  referenceId: string;
  referenceNumber: string;
  debit: number;
  credit: number;
  balance: number;
  description?: string;
  recordedBy: string;
}

// ============================================================================
// Suppliers
// ============================================================================

export interface Supplier extends BaseEntity, SyncedEntity {
  companyName: string;
  contactPerson?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  country?: string;
  gstin?: string;
  pan?: string;
  
  // Payment
  currentBalance: number;
  paymentTerms?: string;
  creditDays?: number;
  
  // Performance
  totalPurchases: number;
  totalAmount: number;
  lastPurchaseAt?: string;
  rating?: number; // 1-5
  
  // Status
  isActive: boolean;
  isPreferred: boolean;
  
  // Bank Details
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  upiId?: string;
  
  // Metadata
  notes?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Employees / Cashiers
// ============================================================================

export interface Employee extends BaseEntity, SyncedEntity {
  salesCode: string; // Unique code for quick login
  name: string;
  role: UserRole;
  email?: string;
  phone?: string;
  address?: string;
  dateOfBirth?: string;
  dateOfJoining?: string;
  
  // Compensation
  salary: number;
  salaryType: 'monthly' | 'daily' | 'hourly' | 'commission';
  commissionRate: number; // Percentage
  commissionType: 'sales' | 'profit' | 'collection';
  
  // Access
  pinHash?: string;
  permissions: string[]; // Granular permissions
  canAccessReports: boolean;
  canManageInventory: boolean;
  canManageCustomers: boolean;
  canProcessRefunds: boolean;
  maxDiscountPercent: number;
  
  // Status
  isActive: boolean;
  lastLoginAt?: string;
  
  // Shift
  shiftId?: string;
  branchId?: string;
  
  // Metadata
  notes?: string;
  avatarUrl?: string;
  emergencyContact?: string;
  emergencyPhone?: string;
  bankDetails?: {
    accountNumber: string;
    ifscCode: string;
    bankName: string;
  };
}

// ============================================================================
// Sales
// ============================================================================

export interface Sale extends BaseEntity, SyncedEntity {
  invoiceNo: string;
  invoiceType: InvoiceType;
  status: SaleStatus;
  
  // Customer
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  customerAddress?: string;
  customerGstin?: string;
  
  // Cashier
  cashierId: string;
  cashierName: string;
  cashierCode?: string;
  
  // Branch
  branchId?: string;
  branchName?: string;
  
  // Amounts
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxableAmount: number;
  taxAmount: number;
  taxBreakdown?: TaxBreakdown[];
  grandTotal: number;
  roundingAdjustment: number;
  
  // Payment
  paymentType: PaymentType;
  paymentDetails?: PaymentDetail[];
  amountPaid: number;
  changeDue: number;
  balanceDue: number; // For credit sales
  
  // Items
  itemCount: number;
  totalQuantity: number;
  
  // Metadata
  note?: string;
  internalNote?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
  
  // Sync
  originalInvoiceNo?: string; // For returns/refunds
  parentSaleId?: string; // For partial returns
}

export interface SaleItem extends BaseEntity {
  saleId: string;
  productId: string;
  variantId?: string;
  itemCode: string;
  name: string;
  description?: string;
  unit: UnitType;
  
  // Quantities
  quantity: number;
  freeQuantity: number;
  returnedQuantity: number;
  
  // Pricing
  unitPrice: number; // Base price before discount
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  taxInclusive: boolean;
  costPrice: number;
  lineTotal: number; // Final amount after discount + tax
  profit: number;
  
  // Inventory
  stockBefore: number;
  stockAfter: number;
  
  // Metadata
  serialNumbers?: string[]; // For serialized items
  batchNumber?: string;
  expiryDate?: string;
  metadata?: Record<string, unknown>;
}

export interface TaxBreakdown {
  taxName: string;
  rate: number;
  taxableAmount: number;
  taxAmount: number;
  isInclusive: boolean;
}

export interface PaymentDetail {
  type: PaymentType;
  amount: number;
  reference?: string; // Transaction ID, cheque number, card last 4 digits
  details?: Record<string, unknown>; // UPI ID, bank name, etc.
  receivedAt: string;
}

// ============================================================================
// Purchases
// ============================================================================

export interface Purchase extends BaseEntity, SyncedEntity {
  poNumber: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseStatus;
  
  // Amounts
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxAmount: number;
  grandTotal: number;
  paidAmount: number;
  balanceAmount: number;
  
  // Dates
  orderDate: string;
  expectedDate?: string;
  receivedDate?: string;
  billDate?: string;
  
  // Metadata
  note?: string;
  internalNote?: string;
  terms?: string;
  recordedBy: string;
  branchId?: string;
  
  // Sync
  originalPoNumber?: string; // For returns
  parentPurchaseId?: string;
}

export interface PurchaseItem extends BaseEntity {
  purchaseId: string;
  productId: string;
  variantId?: string;
  itemCode: string;
  name: string;
  unit: UnitType;
  
  // Quantities
  orderedQuantity: number;
  receivedQuantity: number;
  returnedQuantity: number;
  freeQuantity: number;
  
  // Pricing
  unitCost: number;
  discountPercent: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  
  // Inventory
  batchNumber?: string;
  expiryDate?: string;
  manufacturingDate?: string;
  
  // Metadata
  serialNumbers?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Expenses
// ============================================================================

export interface Expense extends BaseEntity, SyncedEntity {
  category: ExpenseCategory;
  amount: number;
  description: string;
  paymentMethod: PaymentType;
  paymentReference?: string;
  date: string;
  
  // Vendor
  vendorId?: string;
  vendorName?: string;
  
  // Branch
  branchId?: string;
  
  // Approval
  approvedBy?: string;
  approvedAt?: string;
  isApproved: boolean;
  
  // Receipt
  receiptUrl?: string;
  receiptNumber?: string;
  
  // Recurring
  isRecurring: boolean;
  recurringFrequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  recurringEndDate?: string;
  
  // Tags
  tags?: string[];
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Cheques
// ============================================================================

export interface Cheque extends BaseEntity, SyncedEntity {
  chequeNo: string;
  bankName: string;
  branchName?: string;
  amount: number;
  dueDate: string;
  status: ChequeStatus;
  
  // Party
  type: 'received' | 'issued'; // Received from customer / Issued to supplier
  partyId?: string; // Customer or Supplier ID
  partyName: string;
  partyType: 'customer' | 'supplier';
  
  // Reference
  referenceId?: string; // Sale ID, Purchase ID
  referenceType?: 'sale' | 'purchase' | 'loan' | 'expense' | 'other';
  referenceNumber?: string;
  
  // Clearing
  presentedDate?: string;
  clearedDate?: string;
  bounceReason?: string;
  bounceCharges?: number;
  
  // Metadata
  note?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Loans
// ============================================================================

export interface Loan extends BaseEntity, SyncedEntity {
  personName: string;
  phone?: string;
  email?: string;
  address?: string;
  loanType: LoanType; // given (we lent) / taken (we borrowed)
  principal: number;
  balance: number;
  interestRate?: number; // Annual percentage
  interestType?: 'simple' | 'compound';
  dueDate?: string;
  status: LoanStatus;
  
  // Schedule
  installmentAmount?: number;
  installmentFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
  totalInstallments?: number;
  paidInstallments: number;
  nextDueDate?: string;
  
  // Reference
  referenceId?: string; // Sale, Purchase
  referenceType?: string;
  
  // Guarantor
  guarantorName?: string;
  guarantorPhone?: string;
  guarantorAddress?: string;
  
  // Metadata
  notes?: string;
  purpose?: string;
  documents?: string[]; // URLs
  metadata?: Record<string, unknown>;
}

export interface LoanPayment extends BaseEntity {
  loanId: string;
  amount: number;
  principalPortion: number;
  interestPortion: number;
  paymentMethod: PaymentType;
  paymentReference?: string;
  paymentDate: string;
  receivedBy: string;
  note?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Inventory Adjustments
// ============================================================================

export interface InventoryAdjustment extends BaseEntity, SyncedEntity {
  itemCode: string;
  itemName: string;
  productId?: string;
  changeQty: number; // Positive or negative
  previousStock: number;
  newStock: number;
  reason: string;
  reasonCategory: 'damage' | 'expiry' | 'theft' | 'count' | 'transfer' | 'return' | 'promotion' | 'other';
  userId: string;
  userName: string;
  approvedBy?: string;
  approvedAt?: string;
  isApproved: boolean;
  costImpact?: number;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Daily Summary / Cash Reconciliation
// ============================================================================

export interface DailySummary extends BaseEntity, SyncedEntity {
  date: string; // YYYY-MM-DD
  branchId?: string;
  
  // Cash
  openingCash: number;
  cashSales: number;
  cardSales: number;
  upiSales: number;
  bankTransferSales: number;
  chequeSales: number;
  creditSales: number;
  totalSales: number;
  
  // Cash In/Out
  cashIn: number; // Loans received, capital introduced, etc.
  cashOut: number; // Expenses paid, loans given, drawings, etc.
  cashInDetails?: CashFlowDetail[];
  cashOutDetails?: CashFlowDetail[];
  
  // Reconciliation
  closingCash: number;
  systemExpected: number;
  difference: number;
  differenceReason?: string;
  
  // Status
  status: 'open' | 'closed' | 'disputed';
  closedBy?: string;
  closedAt?: string;
  
  // Metadata
  notes?: string;
  metadata?: Record<string, unknown>;
}

export interface CashFlowDetail {
  type: string;
  amount: number;
  reference?: string;
  description?: string;
  timestamp: string;
}

// ============================================================================
// Settings
// ============================================================================

export interface Setting extends BaseEntity {
  key: string;
  value: unknown; // JSON value
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  category: 'general' | 'printing' | 'tax' | 'payment' | 'inventory' | 'sync' | 'appearance' | 'advanced';
  label: string;
  description?: string;
  isPublic: boolean; // Can be read by frontend without auth
  isEditable: boolean;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
    enum?: string[];
  };
  defaultValue?: unknown;
}

// ============================================================================
// Held Bills (Parking)
// ============================================================================

export interface HeldBill extends BaseEntity {
  billData: {
    items: SaleItem[];
    customerId?: string;
    customerName: string;
    discountPercent: number;
    discountAmount: number;
    note?: string;
    paymentType?: PaymentType;
  };
  heldBy: string;
  heldByName: string;
  tableNumber?: string; // For restaurant
  guestCount?: number;
  expiresAt?: string;
}

// ============================================================================
// Devices & Print Queue
// ============================================================================

export interface Device extends BaseEntity {
  deviceId: string; // Unique device identifier
  name: string;
  type: DeviceType;
  branchId?: string;
  
  // Capabilities
  canPrint: boolean;
  canScan: boolean;
  canCashDrawer: boolean;
  canCustomerDisplay: boolean;
  
  // Network
  ipAddress?: string;
  macAddress?: string;
  lastSeenAt: string;
  isOnline: boolean;
  
  // Printing
  printerType?: PrinterType;
  printerName?: string;
  printerWidth?: string;
  printerSettings?: Record<string, unknown>;
  
  // Metadata
  userAgent?: string;
  appVersion?: string;
  os?: string;
  metadata?: Record<string, unknown>;
}

export interface PrintJob extends BaseEntity {
  sourceDeviceId: string;
  targetDeviceId?: string; // Null = any available printer
  invoiceNumber: string;
  receiptData: string; // ESC/POS or HTML
  status: PrintJobStatus;
  copies: number;
  priority: number;
  
  // Timing
  queuedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  errorMessage?: string;
  
  // Retry
  retryCount: number;
  maxRetries: number;
  
  // Metadata
  metadata?: Record<string, unknown>;
}

// ============================================================================
// Sync & Audit
// ============================================================================

export interface SyncLog extends BaseEntity {
  provider: DatabaseProvider;
  direction: 'push' | 'pull' | 'bidirectional';
  status: SyncStatus;
  tablesSynced: string[];
  recordsPushed: number;
  recordsPulled: number;
  conflicts: number;
  errors: SyncError[];
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  triggeredBy: 'manual' | 'auto' | 'webhook' | 'realtime';
}

export interface SyncError {
  table: string;
  recordId?: string;
  error: string;
  operation: 'create' | 'update' | 'delete';
  resolved: boolean;
  resolution?: ConflictResolution;
}

export interface AuditLog extends BaseEntity {
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  branchId?: string;
  metadata?: Record<string, unknown>;
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface QueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  filters?: Record<string, unknown>;
  search?: string;
  fields?: string[];
}

/**
 * Outcome of a sync run between the local device and a cloud provider.
 */
export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: SyncError[];
  durationMs: number;
}

/**
 * Low level query primitives shared by every database provider.
 */
export interface QueryFilter {
  field: string;
  operator:
    | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'like'
    | 'ilike'
    | 'in'
    | 'notIn'
    | 'isNull'
    | 'isNotNull';
  value: unknown;
}

export interface SortOption {
  field: string;
  order: 'asc' | 'desc';
}

export interface QueryParams {
  filters?: QueryFilter[];
  sorts?: SortOption[];
  limit?: number;
  offset?: number;
  fields?: string[];
}

/**
 * Decoded JWT payload used by the backend auth middleware.
 */
export interface TokenPayload {
  userId: string;
  email: string;
  role: UserRole;
  provider: AuthProvider;
  sessionId: string;
  branchId?: string;
  deviceId?: string;
  iat?: number;
  exp?: number;
}

export interface BulkOperationResult {
  success: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}

// ============================================================================
// Real-time Event Payloads
// ============================================================================

export interface RealtimePayload<T = unknown> {
  type: string;
  entity: string;
  operation: 'insert' | 'update' | 'delete';
  data: T;
  oldData?: T;
  timestamp: string;
  sourceDeviceId?: string;
  userId?: string;
}

export interface WSEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: string;
  sourceDeviceId?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface DatabaseConfig {
  provider: DatabaseProvider;
  
  // SQLite
  sqlitePath?: string;
  
  // Supabase
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  supabaseServiceKey?: string;
  
  // Turso
  tursoUrl?: string;
  tursoToken?: string;
  tursoSyncUrl?: string;
  
  // Azure SQL
  azureServer?: string;
  azureDatabase?: string;
  azureUser?: string;
  azurePassword?: string;
  azureEncrypt?: boolean;
  azureTrustServerCertificate?: boolean;
  
  // Common
  poolSize?: number;
  connectionTimeout?: number;
  queryTimeout?: number;
  enableLogging?: boolean;
}

export interface ServerConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresIn: string;
  refreshTokenExpiresIn: string;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  bodySizeLimit: string;
  requestTimeoutMs: number;
}

export interface SyncConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  conflictResolution: ConflictResolution;
  tables: string[];
  direction: SyncDirection;
}

export interface AppConfig {
  database: DatabaseConfig;
  server: ServerConfig;
  sync: SyncConfig;
  auth: {
    localAdminEmail: string;
    localAdminPassword: string;
    supabaseEnabled: boolean;
    sessionTimeoutMs: number;
    maxLoginAttempts: number;
    lockoutDurationMs: number;
  };
  features: {
    multiBranch: boolean;
    loyaltyProgram: boolean;
    creditSales: boolean;
    purchaseManagement: boolean;
    expenseTracking: boolean;
    chequeManagement: boolean;
    loanTracking: boolean;
    inventoryAdjustments: boolean;
    dailyReconciliation: boolean;
    heldBills: boolean;
    barcodeScanning: boolean;
    voiceCommands: boolean;
    qrBackup: boolean;
    printQueue: boolean;
    realtimeSync: boolean;
  };
}