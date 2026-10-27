/**
 * Core Enums and Constants for AMi POS
 * Shared across backend, frontend, and database layers
 */

// ============================================================================
// User & Auth
// ============================================================================

export enum UserRole {
  ADMIN = 'admin',
  MANAGER = 'manager',
  CASHIER = 'cashier',
}

export enum AuthProvider {
  SUPABASE = 'supabase',
  LOCAL = 'local',
  AZURE_AD = 'azure_ad',
}

export enum LoginMethod {
  EMAIL_PASSWORD = 'email_password',
  PIN = 'pin',
  BIOMETRIC = 'biometric',
}

// ============================================================================
// Products & Inventory
// ============================================================================

export enum ProductStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  DISCONTINUED = 'discontinued',
}

export enum StockMovementType {
  SALE = 'sale',
  PURCHASE = 'purchase',
  RETURN = 'return',
  ADJUSTMENT_IN = 'adjustment_in',
  ADJUSTMENT_OUT = 'adjustment_out',
  TRANSFER_IN = 'transfer_in',
  TRANSFER_OUT = 'transfer_out',
  WASTE = 'waste',
  COUNT = 'count',
}

export enum UnitType {
  PCS = 'pcs',
  KG = 'kg',
  G = 'g',
  L = 'l',
  ML = 'ml',
  M = 'm',
  CM = 'cm',
  BOX = 'box',
  PACK = 'pack',
  DOZEN = 'dozen',
}

// ============================================================================
// Sales & Transactions
// ============================================================================

export enum PaymentType {
  CASH = 'Cash',
  CARD = 'Card',
  UPI = 'UPI',
  BANK_TRANSFER = 'Bank Transfer',
  CHEQUE = 'Cheque',
  CREDIT = 'Credit',
  MIXED = 'Mixed',
  OTHER = 'Other',
}

export enum SaleStatus {
  COMPLETED = 'Completed',
  PENDING = 'Pending',
  CANCELLED = 'Cancelled',
  REFUNDED = 'Refunded',
  PARTIAL = 'Partial',
  HELD = 'Held',
}

export enum InvoiceType {
  SALE = 'sale',
  RETURN = 'return',
  QUOTE = 'quote',
  PROFORMA = 'proforma',
}

// ============================================================================
// Purchases
// ============================================================================

export enum PurchaseStatus {
  ORDERED = 'Ordered',
  RECEIVED = 'Received',
  PARTIAL = 'Partial',
  CANCELLED = 'Cancelled',
  RETURNED = 'Returned',
}

export enum PurchaseOrderStatus {
  DRAFT = 'Draft',
  SENT = 'Sent',
  CONFIRMED = 'Confirmed',
  RECEIVED = 'Received',
  BILLED = 'Billed',
  CLOSED = 'Closed',
}

// ============================================================================
// Expenses & Finance
// ============================================================================

export enum ExpenseCategory {
  RENT = 'Rent',
  UTILITIES = 'Utilities',
  SALARIES = 'Salaries',
  MARKETING = 'Marketing',
  MAINTENANCE = 'Maintenance',
  SUPPLIES = 'Supplies',
  TRANSPORT = 'Transport',
  INSURANCE = 'Insurance',
  TAXES = 'Taxes',
  OTHER = 'Other',
}

export enum ChequeStatus {
  PENDING = 'Pending',
  CLEARED = 'Cleared',
  BOUNCED = 'Bounced',
  CANCELLED = 'Cancelled',
  POSTDATED = 'Postdated',
}

export enum LoanType {
  GIVEN = 'given',
  TAKEN = 'taken',
}

export enum LoanStatus {
  ACTIVE = 'Active',
  PAID = 'Paid',
  OVERDUE = 'Overdue',
  DEFAULTED = 'Defaulted',
  RESTRUCTURED = 'Restructured',
}

// ============================================================================
// Sync & Database
// ============================================================================

export enum DatabaseProvider {
  SQLITE = 'sqlite',
  SUPABASE = 'supabase',
  TURSO = 'turso',
  AZURE_SQL = 'azuresql',
}

export enum SyncStatus {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  SYNCING = 'syncing',
  SYNCED = 'synced',
  ERROR = 'error',
  CONFLICT = 'conflict',
}

export enum SyncDirection {
  PUSH = 'push',
  PULL = 'pull',
  BIDIRECTIONAL = 'bidirectional',
}

/**
 * Supported currencies for formatting and receipt settings.
 */
export enum CurrencyCode {
  LKR = 'LKR',
  USD = 'USD',
  EUR = 'EUR',
  GBP = 'GBP',
  INR = 'INR',
  AUD = 'AUD',
  CAD = 'CAD',
  JPY = 'JPY',
  CNY = 'CNY',
  AED = 'AED',
}

export enum ConflictResolution {
  LOCAL_WINS = 'local_wins',
  REMOTE_WINS = 'remote_wins',
  LAST_WRITE_WINS = 'last_write_wins',
  MANUAL = 'manual',
  MERGE = 'merge',
}

// ============================================================================
// Device & Printing
// ============================================================================

export enum DeviceType {
  POS_TERMINAL = 'pos_terminal',
  KITCHEN_DISPLAY = 'kitchen_display',
  CUSTOMER_DISPLAY = 'customer_display',
  MOBILE = 'mobile',
  TABLET = 'tablet',
  DESKTOP = 'desktop',
  PRINTER = 'printer',
  SCANNER = 'scanner',
}

export enum PrinterType {
  THERMAL_58MM = 'thermal_58mm',
  THERMAL_80MM = 'thermal_80mm',
  A4 = 'a4',
  LABEL = 'label',
  NETWORK = 'network',
  BLUETOOTH = 'bluetooth',
  USB = 'usb',
}

export enum PrintJobStatus {
  QUEUED = 'queued',
  PRINTING = 'printing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

// ============================================================================
// Reports & Analytics
// ============================================================================

export enum ReportType {
  SALES_SUMMARY = 'sales_summary',
  SALES_DETAIL = 'sales_detail',
  PRODUCT_SALES = 'product_sales',
  CATEGORY_SALES = 'category_sales',
  CUSTOMER_SALES = 'customer_sales',
  CASHIER_PERFORMANCE = 'cashier_performance',
  INVENTORY_VALUE = 'inventory_value',
  LOW_STOCK = 'low_stock',
  STOCK_MOVEMENT = 'stock_movement',
  PROFIT_LOSS = 'profit_loss',
  TAX_REPORT = 'tax_report',
  DAILY_SUMMARY = 'daily_summary',
  EXPENSES = 'expenses',
  PURCHASES = 'purchases',
  ACCOUNTS_RECEIVABLE = 'accounts_receivable',
  ACCOUNTS_PAYABLE = 'accounts_payable',
}

export enum ReportPeriod {
  TODAY = 'today',
  YESTERDAY = 'yesterday',
  THIS_WEEK = 'this_week',
  LAST_WEEK = 'last_week',
  THIS_MONTH = 'this_month',
  LAST_MONTH = 'last_month',
  THIS_QUARTER = 'this_quarter',
  LAST_QUARTER = 'last_quarter',
  THIS_YEAR = 'this_year',
  LAST_YEAR = 'last_year',
  CUSTOM = 'custom',
}

// ============================================================================
// Settings & Configuration
// ============================================================================

export enum SettingKey {
  SHOP_NAME = 'shop_name',
  SHOP_ADDRESS = 'shop_address',
  SHOP_PHONE = 'shop_phone',
  SHOP_EMAIL = 'shop_email',
  SHOP_GSTIN = 'shop_gstin',
  CURRENCY = 'currency',
  CURRENCY_SYMBOL = 'currency_symbol',
  TAX_RATE = 'tax_rate',
  TAX_INCLUSIVE = 'tax_inclusive',
  RECEIPT_HEADER = 'receipt_header',
  RECEIPT_FOOTER = 'receipt_footer',
  RECEIPT_TERMS = 'receipt_terms',
  PRINTER_WIDTH = 'printer_width',
  PRINTER_TYPE = 'printer_type',
  PRINTER_NAME = 'printer_name',
  INVOICE_PREFIX = 'invoice_prefix',
  INVOICE_START_NUMBER = 'invoice_start_number',
  INVOICE_RESET_PERIOD = 'invoice_reset_period',
  DEFAULT_PAYMENT_TYPE = 'default_payment_type',
  ENABLE_CREDIT_SALES = 'enable_credit_sales',
  DEFAULT_CREDIT_LIMIT = 'default_credit_limit',
  AUTO_BACKUP = 'auto_backup',
  BACKUP_INTERVAL = 'backup_interval',
  SYNC_ENABLED = 'sync_enabled',
  SYNC_INTERVAL = 'sync_interval',
  TIMEZONE = 'timezone',
  DATE_FORMAT = 'date_format',
  TIME_FORMAT = 'time_format',
  LANGUAGE = 'language',
  THEME = 'theme',
  SOUND_ENABLED = 'sound_enabled',
  VOICE_ENABLED = 'voice_enabled',
  BARCODE_SCANNER_ENABLED = 'barcode_scanner_enabled',
  CASH_DRAWER_ENABLED = 'cash_drawer_enabled',
  CUSTOMER_DISPLAY_ENABLED = 'customer_display_enabled',
  KITCHEN_DISPLAY_ENABLED = 'kitchen_display_enabled',
  MULTI_BRANCH_ENABLED = 'multi_branch_enabled',
  CURRENT_BRANCH = 'current_branch',
}

export enum ThemeMode {
  LIGHT = 'light',
  DARK = 'dark',
  SYSTEM = 'system',
}

// ============================================================================
// API & WebSocket Events
// ============================================================================

export enum WSEventType {
  // Connection
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  PING = 'PING',
  PONG = 'PONG',
  
  // Entity Updates
  PRODUCT_SAVED = 'PRODUCT_SAVED',
  PRODUCT_DELETED = 'PRODUCT_DELETED',
  PRODUCT_STOCK_UPDATED = 'PRODUCT_STOCK_UPDATED',
  
  CATEGORY_SAVED = 'CATEGORY_SAVED',
  CATEGORY_DELETED = 'CATEGORY_DELETED',
  
  CUSTOMER_SAVED = 'CUSTOMER_SAVED',
  CUSTOMER_DELETED = 'CUSTOMER_DELETED',
  
  SUPPLIER_SAVED = 'SUPPLIER_SAVED',
  SUPPLIER_DELETED = 'SUPPLIER_DELETED',
  
  EMPLOYEE_SAVED = 'EMPLOYEE_SAVED',
  EMPLOYEE_DELETED = 'EMPLOYEE_DELETED',
  
  SALE_RECORDED = 'SALE_RECORDED',
  SALE_CANCELLED = 'SALE_CANCELLED',
  SALE_REFUNDED = 'SALE_REFUNDED',
  HELD_BILL_SAVED = 'HELD_BILL_SAVED',
  HELD_BILL_RESTORED = 'HELD_BILL_RESTORED',
  
  PURCHASE_RECORDED = 'PURCHASE_RECORDED',
  PURCHASE_RECEIVED = 'PURCHASE_RECEIVED',
  
  EXPENSE_SAVED = 'EXPENSE_SAVED',
  EXPENSE_DELETED = 'EXPENSE_DELETED',
  
  CHEQUE_SAVED = 'CHEQUE_SAVED',
  CHEQUE_STATUS_CHANGED = 'CHEQUE_STATUS_CHANGED',
  
  LOAN_SAVED = 'LOAN_SAVED',
  LOAN_PAYMENT_RECEIVED = 'LOAN_PAYMENT_RECEIVED',
  
  INVENTORY_ADJUSTED = 'INVENTORY_ADJUSTED',
  STOCK_TRANSFER = 'STOCK_TRANSFER',
  
  DAILY_SUMMARY_SAVED = 'DAILY_SUMMARY_SAVED',
  DAILY_SUMMARY_CLOSED = 'DAILY_SUMMARY_CLOSED',
  
  SETTINGS_UPDATED = 'SETTINGS_UPDATED',
  USER_LOGGED_IN = 'USER_LOGGED_IN',
  USER_LOGGED_OUT = 'USER_LOGGED_OUT',
  
  // Sync
  SYNC_STARTED = 'SYNC_STARTED',
  SYNC_COMPLETED = 'SYNC_COMPLETED',
  SYNC_FAILED = 'SYNC_FAILED',
  SYNC_CONFLICT = 'SYNC_CONFLICT',
  
  // Print Queue
  PRINT_JOB_QUEUED = 'PRINT_JOB_QUEUED',
  PRINT_JOB_STARTED = 'PRINT_JOB_STARTED',
  PRINT_JOB_COMPLETED = 'PRINT_JOB_COMPLETED',
  PRINT_JOB_FAILED = 'PRINT_JOB_FAILED',
  
  // Notifications
  NOTIFICATION = 'NOTIFICATION',
  ALERT = 'ALERT',
  
  // Device
  DEVICE_ONLINE = 'DEVICE_ONLINE',
  DEVICE_OFFLINE = 'DEVICE_OFFLINE',
  DEVICE_STATUS_CHANGED = 'DEVICE_STATUS_CHANGED',
}

// ============================================================================
// Default Values
// ============================================================================

export const DEFAULTS = {
  CURRENCY: 'LKR',
  CURRENCY_SYMBOL: 'Rs.',
  TAX_RATE: 0,
  TAX_INCLUSIVE: false,
  PRINTER_WIDTH: '80mm',
  INVOICE_PREFIX: 'INV-',
  INVOICE_START_NUMBER: 1,
  INVOICE_RESET_PERIOD: 'daily',
  DEFAULT_PAYMENT_TYPE: PaymentType.CASH,
  ENABLE_CREDIT_SALES: true,
  DEFAULT_CREDIT_LIMIT: 10000,
  AUTO_BACKUP: true,
  BACKUP_INTERVAL: 24, // hours
  SYNC_ENABLED: false,
  SYNC_INTERVAL: 30000, // ms
  TIMEZONE: 'Asia/Colombo',
  DATE_FORMAT: 'DD/MM/YYYY',
  TIME_FORMAT: 'HH:mm',
  LANGUAGE: 'en',
  THEME: ThemeMode.SYSTEM,
  SOUND_ENABLED: true,
  VOICE_ENABLED: false,
  BARCODE_SCANNER_ENABLED: true,
  CASH_DRAWER_ENABLED: false,
  CUSTOMER_DISPLAY_ENABLED: false,
  KITCHEN_DISPLAY_ENABLED: false,
  MULTI_BRANCH_ENABLED: false,
} as const;

// ============================================================================
// Validation Constants
// ============================================================================

export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 6,
  MAX_PASSWORD_LENGTH: 128,
  MIN_PIN_LENGTH: 4,
  MAX_PIN_LENGTH: 6,
  MAX_NAME_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 2000,
  MAX_NOTES_LENGTH: 5000,
  MAX_PHONE_LENGTH: 20,
  MAX_EMAIL_LENGTH: 255,
  MAX_ADDRESS_LENGTH: 500,
  MAX_BARCODE_LENGTH: 50,
  MAX_ITEM_CODE_LENGTH: 50,
  MAX_SKU_LENGTH: 100,
  DECIMAL_PRECISION: 2,
  MAX_STOCK: 999999,
  MAX_PRICE: 9999999.99,
  MAX_QUANTITY: 999999,
} as const;

// ============================================================================
// Pagination & Limits
// ============================================================================

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 50,
  MAX_LIMIT: 500,
  SALES_DEFAULT_LIMIT: 100,
  PRODUCTS_DEFAULT_LIMIT: 200,
} as const;