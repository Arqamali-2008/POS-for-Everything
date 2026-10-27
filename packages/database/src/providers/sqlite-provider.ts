/**
 * SQLite Database Provider
 * Uses Node's built-in `node:sqlite` driver (no native npm add-on required).
 */

import { NodeSqliteDatabase } from './node-sqlite';
import { DatabaseProvider, SyncStatus } from '@pospro/core';
import type {
  DatabaseConfig,
  QueryParams,
  QueryFilter,
  SortOption,
  RealtimePayload,
  HealthCheckResult,
  SyncConfig,
  SyncResult,
  SyncError,
  ProviderFeatures,
  BatchOperation,
  BatchResult,
  Migration,
  MigrationRecord,
} from './interfaces';
import type { DatabaseProviderInterface, ConnectionPool, DatabaseConnection, Migrator } from './interfaces';
import { eq, and, or, like, ilike, inArray, isNull, isNotNull, gte, lte, gt, lt, desc, asc, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Key casing helper (DB snake_case -> API camelCase)
// ============================================================================

const CAMEL_CACHE = new Map<string, string>();

function camelizeKey(key: string): string {
  let cached = CAMEL_CACHE.get(key);
  if (cached === undefined) {
    cached = key.replace(/_+([a-zA-Z0-9])/g, (_m: string, c: string) => c.toUpperCase());
    CAMEL_CACHE.set(key, cached);
  }
  return cached;
}

function camelizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => camelizeValue(item));
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[camelizeKey(key)] = camelizeValue(val);
    }
    return out;
  }
  return value;
}

function camelizeRows<T>(rows: T[]): T[] {
  return rows.map((row) => camelizeValue(row) as T);
}

// ============================================================================
// SQLite Connection Pool
// ============================================================================

class SQLiteConnection implements DatabaseConnection {
  private db: NodeSqliteDatabase;
  private inTransaction = false;

  constructor(db: NodeSqliteDatabase) {
    this.db = db;
  }

  query<T>(sql: string, params?: unknown[]): Promise<T[]> {
    try {
      const stmt = this.db.prepare(sql);
      const rows = params ? stmt.all(...params) : stmt.all();
      return Promise.resolve(rows as T[]);
    } catch (error) {
      return Promise.reject(error);
    }
  }

  execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: string }> {
    try {
      const stmt = this.db.prepare(sql);
      const result = params ? stmt.run(...params) : stmt.run();
      return Promise.resolve({
        affectedRows: result.changes,
        insertId: String(result.lastInsertRowid),
      });
    } catch (error) {
      return Promise.reject(error);
    }
  }

  beginTransaction(): Promise<void> {
    if (this.inTransaction) {
      return Promise.reject(new Error('Transaction already in progress'));
    }
    this.db.exec('BEGIN TRANSACTION');
    this.inTransaction = true;
    return Promise.resolve();
  }

  commit(): Promise<void> {
    if (!this.inTransaction) {
      return Promise.reject(new Error('No transaction in progress'));
    }
    this.db.exec('COMMIT');
    this.inTransaction = false;
    return Promise.resolve();
  }

  rollback(): Promise<void> {
    if (!this.inTransaction) {
      return Promise.reject(new Error('No transaction in progress'));
    }
    this.db.exec('ROLLBACK');
    this.inTransaction = false;
    return Promise.resolve();
  }

  release(): Promise<void> {
    if (this.inTransaction) {
      this.rollback();
    }
    return Promise.resolve();
  }
}

class SQLiteConnectionPool implements ConnectionPool {
  private db: NodeSqliteDatabase;
  private stats: { total: number; used: number } = { total: 1, used: 0 };

  constructor(dbPath: string) {
    // Ensure directory exists (works for local, mapped drive and UNC paths)
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new NodeSqliteDatabase(dbPath);

    // Enable WAL mode for better concurrency. Pragmas are applied defensively:
    // on network shares (SMB/UNC) WAL may be unavailable — degrade gracefully
    // to the default journal mode instead of failing the connection.
    const pragmas = [
      'journal_mode = WAL',
      'foreign_keys = ON',
      'synchronous = NORMAL',
      'cache_size = -32768',
      'temp_store = MEMORY',
      'mmap_size = 268435456',
    ];
    for (const pragma of pragmas) {
      try {
        this.db.pragma(pragma);
      } catch (error) {
        console.warn(`[SQLite] PRAGMA "${pragma}" not applied:`, error instanceof Error ? error.message : error);
      }
    }
  }

  acquire(): Promise<DatabaseConnection> {
    this.stats.used++;
    return Promise.resolve(new SQLiteConnection(this.db));
  }

  release(connection: DatabaseConnection): Promise<void> {
    this.stats.used = Math.max(0, this.stats.used - 1);
    return connection.release();
  }

  drain(): Promise<void> {
    this.db.close();
    return Promise.resolve();
  }

  getStats() {
    return {
      total: this.stats.total,
      idle: this.stats.total - this.stats.used,
      waiting: 0,
      used: this.stats.used,
    };
  }

  getDatabase(): NodeSqliteDatabase {
    return this.db;
  }
}

// ============================================================================
// SQLite Provider Implementation
// ============================================================================

export class SQLiteProvider implements DatabaseProviderInterface {
  readonly provider = DatabaseProvider.SQLITE;
  readonly name = 'SQLite (Local)';
  
  private pool: SQLiteConnectionPool | null = null;
  private connected = false;
  private config: DatabaseConfig | null = null;

  // Cached real-column metadata per table (used to map camelCase <-> snake_case)
  private columnCache: Map<string, { columns: Set<string>; camelToCol: Map<string, string> }> = new Map();

  // Provider features
  readonly features: ProviderFeatures = {
    realtime: false,
    transactions: true,
    batchOperations: true,
    softDelete: true,
    fullTextSearch: true,
    jsonQueries: true,
    sync: false,
    offlineSupport: true,
    migrations: true,
  };

  async connect(config: DatabaseConfig): Promise<void> {
    this.config = config;
    const dbPath = config.sqlitePath || './data/pos.db';
    
    this.pool = new SQLiteConnectionPool(dbPath);

    // Initialize schema
    await this.createSchema();
    
    this.connected = true;
    console.log(`[SQLite] Connected to ${dbPath}`);
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.drain();
      this.pool = null;
      this.connected = false;
    }
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      if (!this.pool) throw new Error('Not connected');
      
      const conn = await this.pool.acquire();
      await conn.query('SELECT 1');
      await this.pool.release(conn);
      
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        version: 'SQLite 3.x',
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  getDb(): NodeSqliteDatabase {
    if (!this.pool) throw new Error('Database not connected');
    return this.pool.getDatabase();
  }

  // ============================================================================
  // Column Mapping (camelCase <-> snake_case)
  // ============================================================================

  private getColumns(table: string): { columns: Set<string>; camelToCol: Map<string, string> } | null {
    if (!this.pool) return null;
    let entry = this.columnCache.get(table);
    if (!entry) {
      try {
        const rows = this.pool.getDatabase().prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        const columns = new Set(rows.map((r) => r.name));
        const camelToCol = new Map<string, string>();
        for (const column of columns) {
          const camel = column.replace(/_+([a-zA-Z0-9])/g, (_m: string, ch: string) => ch.toUpperCase());
          if (camel !== column && !camelToCol.has(camel)) {
            camelToCol.set(camel, column);
          }
        }
        entry = { columns, camelToCol };
        this.columnCache.set(table, entry);
      } catch {
        return null;
      }
    }
    return entry;
  }

  /** Resolve an incoming key/field to a real column name (null = unknown column). */
  private toColumn(table: string, field: string): string | null {
    const cols = this.getColumns(table);
    if (!cols) return field;
    if (cols.columns.has(field)) return field;
    return cols.camelToCol.get(field) ?? null;
  }

  /** Like toColumn but keeps the original field when no column matches (queries/filters). */
  private toColumnOrKeep(table: string, field: string): string {
    return this.toColumn(table, field) ?? field;
  }

  /** Map payload keys onto real table columns; unknown keys are dropped. */
  private mapForWrite(table: string, data: Record<string, any>): Record<string, any> {
    const mapped: Record<string, any> = {};
    for (const [key, value] of Object.entries(data)) {
      const column = this.toColumn(table, key);
      if (column) mapped[column] = value;
    }
    return mapped;
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  async createSchema(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    
    const db = this.pool.getDatabase();
    
    // Create all tables using raw SQL for full control
    const tables = [
      // Users
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'cashier',
        branch_id TEXT,
        avatar_url TEXT,
        phone TEXT,
        pin_hash TEXT,
        password_hash TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        auth_provider TEXT NOT NULL DEFAULT 'local',
        supabase_user_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
      `CREATE INDEX IF NOT EXISTS idx_users_branch ON users(branch_id)`,
      
      // Branches
      `CREATE TABLE IF NOT EXISTS branches (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        address TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        gstin TEXT,
        is_main INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        settings TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      
      // Categories
      `CREATE TABLE IF NOT EXISTS categories (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        description TEXT,
        parent_id TEXT,
        level INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        color TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories(parent_id)`,
      
      // Products
      `CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        item_code TEXT UNIQUE NOT NULL,
        sku TEXT UNIQUE,
        barcode TEXT UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        category_id TEXT,
        category_name TEXT,
        sub_category_id TEXT,
        brand_id TEXT,
        cost_price REAL NOT NULL DEFAULT 0,
        selling_price REAL NOT NULL,
        wholesale_price REAL,
        mrp REAL,
        tax_rate REAL NOT NULL DEFAULT 0,
        tax_inclusive INTEGER NOT NULL DEFAULT 0,
        hsn_code TEXT,
        stock REAL NOT NULL DEFAULT 0,
        min_stock REAL NOT NULL DEFAULT 0,
        max_stock REAL,
        reorder_level REAL,
        reorder_quantity REAL,
        unit TEXT NOT NULL DEFAULT 'pcs',
        unit_value REAL,
        base_unit TEXT,
        status TEXT NOT NULL DEFAULT 'active',
        is_active INTEGER NOT NULL DEFAULT 1,
        track_inventory INTEGER NOT NULL DEFAULT 1,
        allow_negative_stock INTEGER NOT NULL DEFAULT 0,
        weight REAL,
        dimensions TEXT,
        image_url TEXT,
        images TEXT,
        supplier_id TEXT,
        supplier_name TEXT,
        supplier_sku TEXT,
        discount_percent REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        tags TEXT,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_products_item_code ON products(item_code)`,
      `CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)`,
      `CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)`,
      `CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)`,
      `CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active, deleted)`,
      
      // Product Variants
      `CREATE TABLE IF NOT EXISTS product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sku TEXT UNIQUE NOT NULL,
        barcode TEXT UNIQUE,
        cost_price REAL NOT NULL,
        selling_price REAL NOT NULL,
        stock REAL NOT NULL DEFAULT 0,
        attributes TEXT NOT NULL,
        image_url TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_product_variants_product ON product_variants(product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_product_variants_sku ON product_variants(sku)`,
      
      // Stock Movements
      `CREATE TABLE IF NOT EXISTS stock_movements (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        product_name TEXT NOT NULL,
        item_code TEXT NOT NULL,
        type TEXT NOT NULL,
        quantity REAL NOT NULL,
        previous_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        unit_cost REAL,
        total_cost REAL,
        reference_id TEXT,
        reference_type TEXT,
        reference_number TEXT,
        reason TEXT,
        performed_by TEXT NOT NULL,
        performed_by_name TEXT NOT NULL,
        branch_id TEXT,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_stock_movements_reference ON stock_movements(reference_id, reference_type)`,
      `CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at)`,
      
      // Customers
      `CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT NOT NULL,
        email TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        country TEXT NOT NULL DEFAULT 'Sri Lanka',
        gstin TEXT,
        credit_limit REAL NOT NULL DEFAULT 0,
        current_balance REAL NOT NULL DEFAULT 0,
        credit_days INTEGER,
        payment_terms TEXT,
        loyalty_points INTEGER NOT NULL DEFAULT 0,
        total_purchases INTEGER NOT NULL DEFAULT 0,
        total_spent REAL NOT NULL DEFAULT 0,
        last_purchase_at TEXT,
        customer_group TEXT,
        tier TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_blacklisted INTEGER NOT NULL DEFAULT 0,
        blacklist_reason TEXT,
        notes TEXT,
        tags TEXT,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone)`,
      `CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(email)`,
      `CREATE INDEX IF NOT EXISTS idx_customers_gstin ON customers(gstin)`,
      
      // Customer Ledger
      `CREATE TABLE IF NOT EXISTS customer_ledger (
        id TEXT PRIMARY KEY,
        customer_id TEXT NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        reference_id TEXT NOT NULL,
        reference_number TEXT NOT NULL,
        debit REAL NOT NULL DEFAULT 0,
        credit REAL NOT NULL DEFAULT 0,
        balance REAL NOT NULL DEFAULT 0,
        description TEXT,
        recorded_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_customer_ledger_customer ON customer_ledger(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_customer_ledger_reference ON customer_ledger(reference_id)`,
      
      // Suppliers
      `CREATE TABLE IF NOT EXISTS suppliers (
        id TEXT PRIMARY KEY,
        company_name TEXT NOT NULL,
        contact_person TEXT,
        phone TEXT NOT NULL,
        email TEXT,
        address TEXT,
        city TEXT,
        state TEXT,
        pincode TEXT,
        country TEXT NOT NULL DEFAULT 'Sri Lanka',
        gstin TEXT,
        pan TEXT,
        current_balance REAL NOT NULL DEFAULT 0,
        payment_terms TEXT,
        credit_days INTEGER,
        total_purchases INTEGER NOT NULL DEFAULT 0,
        total_amount REAL NOT NULL DEFAULT 0,
        last_purchase_at TEXT,
        rating REAL,
        is_active INTEGER NOT NULL DEFAULT 1,
        is_preferred INTEGER NOT NULL DEFAULT 0,
        bank_name TEXT,
        account_number TEXT,
        ifsc_code TEXT,
        upi_id TEXT,
        notes TEXT,
        tags TEXT,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_suppliers_phone ON suppliers(phone)`,
      `CREATE INDEX IF NOT EXISTS idx_suppliers_gstin ON suppliers(gstin)`,
      
      // Employees
      `CREATE TABLE IF NOT EXISTS employees (
        id TEXT PRIMARY KEY,
        sales_code TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        date_of_birth TEXT,
        date_of_joining TEXT,
        salary REAL NOT NULL DEFAULT 0,
        salary_type TEXT NOT NULL DEFAULT 'monthly',
        commission_rate REAL NOT NULL DEFAULT 0,
        commission_type TEXT NOT NULL DEFAULT 'sales',
        pin_hash TEXT,
        permissions TEXT NOT NULL DEFAULT '[]',
        can_access_reports INTEGER NOT NULL DEFAULT 0,
        can_manage_inventory INTEGER NOT NULL DEFAULT 0,
        can_manage_customers INTEGER NOT NULL DEFAULT 0,
        can_process_refunds INTEGER NOT NULL DEFAULT 0,
        max_discount_percent REAL NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_login_at TEXT,
        shift_id TEXT,
        branch_id TEXT,
        notes TEXT,
        avatar_url TEXT,
        emergency_contact TEXT,
        emergency_phone TEXT,
        bank_details TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_employees_sales_code ON employees(sales_code)`,
      `CREATE INDEX IF NOT EXISTS idx_employees_branch ON employees(branch_id)`,
      
      // Sales
      `CREATE TABLE IF NOT EXISTS sales (
        id TEXT PRIMARY KEY,
        invoice_no TEXT UNIQUE NOT NULL,
        invoice_type TEXT NOT NULL DEFAULT 'sale',
        status TEXT NOT NULL DEFAULT 'Completed',
        customer_id TEXT REFERENCES customers(id),
        customer_name TEXT NOT NULL DEFAULT 'Walk-in Customer',
        customer_phone TEXT,
        customer_address TEXT,
        customer_gstin TEXT,
        cashier_id TEXT NOT NULL REFERENCES employees(id),
        cashier_name TEXT NOT NULL,
        cashier_code TEXT,
        branch_id TEXT,
        branch_name TEXT,
        subtotal REAL NOT NULL,
        discount_percent REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        taxable_amount REAL NOT NULL,
        tax_amount REAL NOT NULL DEFAULT 0,
        tax_breakdown TEXT,
        grand_total REAL NOT NULL,
        rounding_adjustment REAL NOT NULL DEFAULT 0,
        payment_type TEXT NOT NULL DEFAULT 'Cash',
        payment_details TEXT,
        amount_paid REAL NOT NULL DEFAULT 0,
        change_due REAL NOT NULL DEFAULT 0,
        balance_due REAL NOT NULL DEFAULT 0,
        refund_amount REAL NOT NULL DEFAULT 0,
        item_count INTEGER NOT NULL DEFAULT 0,
        total_quantity REAL NOT NULL DEFAULT 0,
        note TEXT,
        internal_note TEXT,
        tags TEXT,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        original_invoice_no TEXT,
        parent_sale_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_cashier ON sales(cashier_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at)`,
      `CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status)`,
      
      // Sale Items
      `CREATE TABLE IF NOT EXISTS sale_items (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id),
        variant_id TEXT REFERENCES product_variants(id),
        item_code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        unit TEXT NOT NULL,
        quantity REAL NOT NULL,
        free_quantity REAL NOT NULL DEFAULT 0,
        returned_quantity REAL NOT NULL DEFAULT 0,
        unit_price REAL NOT NULL,
        discount_percent REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        tax_inclusive INTEGER NOT NULL DEFAULT 0,
        cost_price REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL,
        profit REAL NOT NULL DEFAULT 0,
        stock_before REAL NOT NULL DEFAULT 0,
        stock_after REAL NOT NULL DEFAULT 0,
        serial_numbers TEXT,
        batch_number TEXT,
        expiry_date TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id)`,
      
      // Purchases
      `CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        po_number TEXT UNIQUE NOT NULL,
        supplier_id TEXT NOT NULL REFERENCES suppliers(id),
        supplier_name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Ordered',
        subtotal REAL NOT NULL,
        discount_percent REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        grand_total REAL NOT NULL,
        paid_amount REAL NOT NULL DEFAULT 0,
        balance_amount REAL NOT NULL DEFAULT 0,
        order_date TEXT NOT NULL,
        expected_date TEXT,
        received_date TEXT,
        bill_date TEXT,
        note TEXT,
        internal_note TEXT,
        terms TEXT,
        recorded_by TEXT NOT NULL,
        branch_id TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        original_po_number TEXT,
        parent_purchase_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_purchases_po ON purchases(po_number)`,
      `CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON purchases(supplier_id)`,
      `CREATE INDEX IF NOT EXISTS idx_purchases_date ON purchases(order_date)`,
      
      // Purchase Items
      `CREATE TABLE IF NOT EXISTS purchase_items (
        id TEXT PRIMARY KEY,
        purchase_id TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES products(id),
        variant_id TEXT REFERENCES product_variants(id),
        item_code TEXT NOT NULL,
        name TEXT NOT NULL,
        unit TEXT NOT NULL,
        ordered_quantity REAL NOT NULL,
        received_quantity REAL NOT NULL DEFAULT 0,
        returned_quantity REAL NOT NULL DEFAULT 0,
        free_quantity REAL NOT NULL DEFAULT 0,
        unit_cost REAL NOT NULL,
        discount_percent REAL NOT NULL DEFAULT 0,
        discount_amount REAL NOT NULL DEFAULT 0,
        tax_rate REAL NOT NULL DEFAULT 0,
        tax_amount REAL NOT NULL DEFAULT 0,
        line_total REAL NOT NULL,
        batch_number TEXT,
        expiry_date TEXT,
        manufacturing_date TEXT,
        serial_numbers TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_purchase ON purchase_items(purchase_id)`,
      `CREATE INDEX IF NOT EXISTS idx_purchase_items_product ON purchase_items(product_id)`,
      
      // Expenses
      `CREATE TABLE IF NOT EXISTS expenses (
        id TEXT PRIMARY KEY,
        category TEXT NOT NULL,
        amount REAL NOT NULL,
        description TEXT NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'Cash',
        payment_reference TEXT,
        date TEXT NOT NULL,
        vendor_id TEXT,
        vendor_name TEXT,
        branch_id TEXT,
        approved_by TEXT,
        approved_at TEXT,
        is_approved INTEGER NOT NULL DEFAULT 0,
        receipt_url TEXT,
        receipt_number TEXT,
        is_recurring INTEGER NOT NULL DEFAULT 0,
        recurring_frequency TEXT,
        recurring_end_date TEXT,
        tags TEXT,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date)`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category)`,
      `CREATE INDEX IF NOT EXISTS idx_expenses_branch ON expenses(branch_id)`,
      
      // Cheques
      `CREATE TABLE IF NOT EXISTS cheques (
        id TEXT PRIMARY KEY,
        cheque_no TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        branch_name TEXT,
        amount REAL NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pending',
        type TEXT NOT NULL,
        party_id TEXT,
        party_name TEXT NOT NULL,
        party_type TEXT NOT NULL,
        reference_id TEXT,
        reference_type TEXT,
        reference_number TEXT,
        presented_date TEXT,
        cleared_date TEXT,
        bounce_reason TEXT,
        bounce_charges REAL NOT NULL DEFAULT 0,
        note TEXT,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_cheques_due_date ON cheques(due_date)`,
      `CREATE INDEX IF NOT EXISTS idx_cheques_party ON cheques(party_id, party_type)`,
      `CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status)`,
      
      // Loans
      `CREATE TABLE IF NOT EXISTS loans (
        id TEXT PRIMARY KEY,
        person_name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        address TEXT,
        loan_type TEXT NOT NULL,
        principal REAL NOT NULL,
        balance REAL NOT NULL,
        interest_rate REAL,
        interest_type TEXT,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'Active',
        installment_amount REAL,
        installment_frequency TEXT,
        total_installments INTEGER,
        paid_installments INTEGER NOT NULL DEFAULT 0,
        next_due_date TEXT,
        reference_id TEXT,
        reference_type TEXT,
        guarantor_name TEXT,
        guarantor_phone TEXT,
        guarantor_address TEXT,
        notes TEXT,
        purpose TEXT,
        documents TEXT,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_loans_person ON loans(person_name, phone)`,
      `CREATE INDEX IF NOT EXISTS idx_loans_status ON loans(status)`,
      `CREATE INDEX IF NOT EXISTS idx_loans_due_date ON loans(due_date)`,
      
      // Loan Payments
      `CREATE TABLE IF NOT EXISTS loan_payments (
        id TEXT PRIMARY KEY,
        loan_id TEXT NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
        amount REAL NOT NULL,
        principal_portion REAL NOT NULL,
        interest_portion REAL NOT NULL,
        payment_method TEXT NOT NULL,
        payment_reference TEXT,
        payment_date TEXT NOT NULL,
        received_by TEXT NOT NULL,
        note TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_loan_payments_loan ON loan_payments(loan_id)`,
      `CREATE INDEX IF NOT EXISTS idx_loan_payments_date ON loan_payments(payment_date)`,
      
      // Inventory Adjustments
      `CREATE TABLE IF NOT EXISTS inventory_adjustments (
        id TEXT PRIMARY KEY,
        item_code TEXT NOT NULL,
        item_name TEXT NOT NULL,
        product_id TEXT REFERENCES products(id),
        change_qty REAL NOT NULL,
        previous_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        reason TEXT NOT NULL,
        reason_category TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        approved_by TEXT,
        approved_at TEXT,
        is_approved INTEGER NOT NULL DEFAULT 0,
        cost_impact REAL,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_product ON inventory_adjustments(product_id)`,
      `CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_user ON inventory_adjustments(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_date ON inventory_adjustments(created_at)`,
      
      // Daily Summaries
      `CREATE TABLE IF NOT EXISTS daily_summaries (
        id TEXT PRIMARY KEY,
        date TEXT UNIQUE NOT NULL,
        branch_id TEXT,
        opening_cash REAL NOT NULL DEFAULT 0,
        cash_sales REAL NOT NULL DEFAULT 0,
        card_sales REAL NOT NULL DEFAULT 0,
        upi_sales REAL NOT NULL DEFAULT 0,
        bank_transfer_sales REAL NOT NULL DEFAULT 0,
        cheque_sales REAL NOT NULL DEFAULT 0,
        credit_sales REAL NOT NULL DEFAULT 0,
        total_sales REAL NOT NULL DEFAULT 0,
        cash_in REAL NOT NULL DEFAULT 0,
        cash_out REAL NOT NULL DEFAULT 0,
        cash_in_details TEXT,
        cash_out_details TEXT,
        closing_cash REAL NOT NULL DEFAULT 0,
        system_expected REAL NOT NULL DEFAULT 0,
        difference REAL NOT NULL DEFAULT 0,
        difference_reason TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        closed_by TEXT,
        closed_at TEXT,
        notes TEXT,
        metadata TEXT,
        synced INTEGER NOT NULL DEFAULT 0,
        synced_at TEXT,
        sync_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date)`,
      `CREATE INDEX IF NOT EXISTS idx_daily_summaries_branch ON daily_summaries(branch_id)`,
      
      // Settings
      `CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        type TEXT NOT NULL,
        category TEXT NOT NULL,
        label TEXT NOT NULL,
        description TEXT,
        is_public INTEGER NOT NULL DEFAULT 0,
        is_editable INTEGER NOT NULL DEFAULT 1,
        validation TEXT,
        default_value TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      
      // Held Bills
      `CREATE TABLE IF NOT EXISTS held_bills (
        id TEXT PRIMARY KEY,
        bill_data TEXT NOT NULL,
        held_by TEXT NOT NULL,
        held_by_name TEXT NOT NULL,
        table_number TEXT,
        guest_count INTEGER,
        expires_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_held_bills_held_by ON held_bills(held_by)`,
      `CREATE INDEX IF NOT EXISTS idx_held_bills_expires ON held_bills(expires_at)`,
      
      // Devices
      `CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        device_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        branch_id TEXT,
        can_print INTEGER NOT NULL DEFAULT 0,
        can_scan INTEGER NOT NULL DEFAULT 0,
        can_cash_drawer INTEGER NOT NULL DEFAULT 0,
        can_customer_display INTEGER NOT NULL DEFAULT 0,
        ip_address TEXT,
        mac_address TEXT,
        last_seen_at TEXT NOT NULL,
        is_online INTEGER NOT NULL DEFAULT 0,
        printer_type TEXT,
        printer_name TEXT,
        printer_width TEXT,
        printer_settings TEXT,
        user_agent TEXT,
        app_version TEXT,
        os TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        deleted_at TEXT,
        deleted INTEGER NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id)`,
      `CREATE INDEX IF NOT EXISTS idx_devices_branch ON devices(branch_id)`,
      `CREATE INDEX IF NOT EXISTS idx_devices_online ON devices(is_online)`,
      
      // Print Jobs
      `CREATE TABLE IF NOT EXISTS print_jobs (
        id TEXT PRIMARY KEY,
        source_device_id TEXT NOT NULL REFERENCES devices(id),
        target_device_id TEXT REFERENCES devices(id),
        invoice_number TEXT NOT NULL,
        receipt_data TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'queued',
        copies INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 0,
        queued_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        failed_at TEXT,
        error_message TEXT,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_print_jobs_source ON print_jobs(source_device_id)`,
      `CREATE INDEX IF NOT EXISTS idx_print_jobs_target ON print_jobs(target_device_id)`,
      `CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON print_jobs(status)`,
      `CREATE INDEX IF NOT EXISTS idx_print_jobs_invoice ON print_jobs(invoice_number)`,
      
      // Sync Logs
      `CREATE TABLE IF NOT EXISTS sync_logs (
        id TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        direction TEXT NOT NULL,
        status TEXT NOT NULL,
        tables_synced TEXT NOT NULL DEFAULT '[]',
        records_pushed INTEGER NOT NULL DEFAULT 0,
        records_pulled INTEGER NOT NULL DEFAULT 0,
        conflicts INTEGER NOT NULL DEFAULT 0,
        errors TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL,
        completed_at TEXT,
        duration_ms INTEGER,
        triggered_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sync_logs_provider ON sync_logs(provider)`,
      `CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status)`,
      `CREATE INDEX IF NOT EXISTS idx_sync_logs_date ON sync_logs(started_at)`,
      
      // Audit Logs
      `CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        old_values TEXT,
        new_values TEXT,
        ip_address TEXT,
        user_agent TEXT,
        branch_id TEXT,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_logs_date ON audit_logs(created_at)`,
    ];

    for (const tableSql of tables) {
      db.exec(tableSql);
    }

    // Lightweight column migrations for existing databases
    const columnMigrations: Array<{ table: string; sql: string }> = [
      { table: 'sales', sql: 'ALTER TABLE sales ADD COLUMN refund_amount REAL NOT NULL DEFAULT 0' },
    ];
    for (const migration of columnMigrations) {
      try {
        db.exec(migration.sql);
      } catch {
        // Column already exists
      }
    }

    // Insert default settings
    const defaultSettings = [
      { key: 'shopName', value: '"POS for Everything"', type: 'string', category: 'general', label: 'Shop Name', isPublic: 1, defaultValue: '"POS for Everything"' },
      { key: 'currency', value: '"LKR"', type: 'string', category: 'general', label: 'Currency', isPublic: 1, defaultValue: '"LKR"' },
      { key: 'currencySymbol', value: '"Rs."', type: 'string', category: 'general', label: 'Currency Symbol', isPublic: 1, defaultValue: '"Rs."' },
      { key: 'taxRate', value: '0', type: 'number', category: 'tax', label: 'Tax Rate %', isPublic: 1, defaultValue: '0' },
      { key: 'taxInclusive', value: 'false', type: 'boolean', category: 'tax', label: 'Tax Inclusive', isPublic: 1, defaultValue: 'false' },
      { key: 'printerWidth', value: '"80mm"', type: 'string', category: 'printing', label: 'Printer Width', isPublic: 1, defaultValue: '"80mm"' },
      { key: 'invoicePrefix', value: '"INV-"', type: 'string', category: 'general', label: 'Invoice Prefix', isPublic: 1, defaultValue: '"INV-"' },
      { key: 'receiptFooter', value: '"Thank you for your business!"', type: 'string', category: 'printing', label: 'Receipt Footer', isPublic: 1, defaultValue: '"Thank you for your business!"' },
    ];

    for (const setting of defaultSettings) {
      db.prepare(`
        INSERT OR IGNORE INTO settings (id, key, value, type, category, label, is_public, is_editable, default_value, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `).run(uuidv4(), setting.key, setting.value, setting.type, setting.category, setting.label, setting.isPublic, 1, setting.defaultValue);
    }
  }

  async dropSchema(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    const db = this.pool.getDatabase();
    
    const tables = [
      'audit_logs', 'sync_logs', 'print_jobs', 'devices', 'held_bills',
      'settings', 'daily_summaries', 'inventory_adjustments', 'loan_payments',
      'loans', 'cheques', 'expenses', 'purchase_items', 'purchases',
      'sale_items', 'sales', 'employees', 'suppliers', 'customer_ledger',
      'customers', 'stock_movements', 'product_variants', 'products',
      'categories', 'branches', 'users'
    ];
    
    for (const table of tables) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
  }

  async migrate(): Promise<void> {
    // Migrations handled by Drizzle Kit
    // This would run pending migrations
  }

  async getMigrationStatus(): Promise<{ applied: number; pending: number }> {
    // Would check Drizzle migration table
    return { applied: 0, pending: 0 };
  }

  // ============================================================================
  // Generic CRUD Operations
  // ============================================================================

  private buildWhereClause(filters: QueryFilter[] = [], table?: string): { sql: string; params: unknown[] } {
    if (filters.length === 0) return { sql: '', params: [] };
    
    const conditions: string[] = [];
    const params: unknown[] = [];
    
    for (const filter of filters) {
      const field = table ? this.toColumnOrKeep(table, filter.field) : filter.field;
      switch (filter.operator) {
        case 'eq':
          conditions.push(`${field} = ?`);
          params.push(filter.value);
          break;
        case 'neq':
          conditions.push(`${field} != ?`);
          params.push(filter.value);
          break;
        case 'gt':
          conditions.push(`${field} > ?`);
          params.push(filter.value);
          break;
        case 'gte':
          conditions.push(`${field} >= ?`);
          params.push(filter.value);
          break;
        case 'lt':
          conditions.push(`${field} < ?`);
          params.push(filter.value);
          break;
        case 'lte':
          conditions.push(`${field} <= ?`);
          params.push(filter.value);
          break;
        case 'like':
          conditions.push(`${field} LIKE ?`);
          params.push(`%${filter.value}%`);
          break;
        case 'ilike':
          conditions.push(`${field} LIKE ?`);
          params.push(`%${filter.value}%`);
          break;
        case 'in':
          const placeholders = (filter.value as unknown[]).map(() => '?').join(',');
          conditions.push(`${field} IN (${placeholders})`);
          params.push(...(filter.value as unknown[]));
          break;
        case 'notIn':
          const notPlaceholders = (filter.value as unknown[]).map(() => '?').join(',');
          conditions.push(`${field} NOT IN (${notPlaceholders})`);
          params.push(...(filter.value as unknown[]));
          break;
        case 'isNull':
          conditions.push(`${field} IS NULL`);
          break;
        case 'isNotNull':
          conditions.push(`${field} IS NOT NULL`);
          break;
      }
    }
    
    return { sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }

  private buildOrderBy(sorts: SortOption[] = [], table?: string): string {
    if (sorts.length === 0) return '';
    const parts: string[] = [];
    for (const s of sorts) {
      if (!s || typeof s.field !== 'string' || !s.field.trim()) continue;
      // Order-by fields are interpolated into SQL, so only real table columns
      // (identifier-shaped) may pass — rejects injection via ?sortBy=.
      const column = table ? this.toColumn(table, s.field) : s.field;
      if (!column || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) continue;
      parts.push(`${column} ${s.order === 'desc' ? 'DESC' : 'ASC'}`);
    }
    return parts.length > 0 ? `ORDER BY ${parts.join(', ')}` : '';
  }

  private buildLimitOffset(limit?: number, offset?: number): string {
    let sql = '';
    if (limit) sql += ` LIMIT ${limit}`;
    if (offset) sql += ` OFFSET ${offset}`;
    return sql;
  }

  async findMany<T>(table: string, params?: QueryParams): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected');
    
    const fields = params?.fields?.join(', ') || '*';
    const { sql: whereSql, params: whereParams } = this.buildWhereClause(params?.filters, table);
    const orderBy = this.buildOrderBy(params?.sorts, table);
    const limitOffset = this.buildLimitOffset(params?.limit, params?.offset);
    
    const sql = `SELECT ${fields} FROM ${table} ${whereSql} ${orderBy} ${limitOffset}`;
    return this.pool.acquire().then(conn => conn.query<T>(sql, whereParams)).then(rows => camelizeRows(rows));
  }

  async findFirst<T = any>(table: string, params?: QueryParams): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...params, limit: 1 });
    return results[0] || null;
  }

  async findById<T>(table: string, id: string): Promise<T | null> {
    if (!this.pool) throw new Error('Not connected');
    return this.runFindById(await this.pool.acquire(), table, id);
  }

  private async runFindById<T>(conn: DatabaseConnection, table: string, id: string): Promise<T | null> {
    const results = await conn.query<T>(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    return results.length > 0 ? camelizeRows(results)[0] : null;
  }

  private async runFindMany<T>(conn: DatabaseConnection, table: string, params?: QueryParams): Promise<T[]> {
    const fields = params?.fields?.join(', ') || '*';
    const { sql: whereSql, params: whereParams } = this.buildWhereClause(params?.filters, table);
    const orderBy = this.buildOrderBy(params?.sorts, table);
    const limitOffset = this.buildLimitOffset(params?.limit, params?.offset);
    const sql = `SELECT ${fields} FROM ${table} ${whereSql} ${orderBy} ${limitOffset}`;
    return camelizeRows(await conn.query<T>(sql, whereParams));
  }

  async count(table: string, filters?: QueryFilter[]): Promise<number> {
    if (!this.pool) throw new Error('Not connected');
    
    const { sql: whereSql, params } = this.buildWhereClause(filters, table);
    const sql = `SELECT COUNT(*) as count FROM ${table} ${whereSql}`;
    const result = await this.pool.acquire().then(conn => conn.query<{ count: number }>(sql, params));
    return result[0]?.count || 0;
  }

  async create<T = any>(table: string, data: Record<string, any> & { id?: string }): Promise<T> {
    if (!this.pool) throw new Error('Not connected');
    return this.runCreate(await this.pool.acquire(), table, data);
  }

  private async runCreate<T = any>(conn: DatabaseConnection, table: string, data: Record<string, any> & { id?: string }): Promise<T> {
    const id = data.id || uuidv4();
    const now = new Date().toISOString();

    const mapped = this.mapForWrite(table, data);
    delete mapped.id;
    const providedCreatedAt = mapped.created_at;
    const providedUpdatedAt = mapped.updated_at;
    delete mapped.created_at;
    delete mapped.updated_at;

    const columns = this.getColumns(table);
    const hasColumn = (name: string): boolean => (columns ? columns.columns.has(name) : true);

    const fields = ['id'];
    const values: unknown[] = [id];
    if (hasColumn('created_at')) {
      fields.push('created_at');
      values.push(providedCreatedAt !== undefined ? providedCreatedAt : now);
    }
    if (hasColumn('updated_at')) {
      fields.push('updated_at');
      values.push(providedUpdatedAt !== undefined ? providedUpdatedAt : now);
    }
    for (const [key, value] of Object.entries(mapped)) {
      fields.push(key);
      values.push(value);
    }
    const placeholders = fields.map(() => '?').join(', ');

    const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
    await conn.execute(sql, values);

    return this.runFindById<T>(conn, table, id) as Promise<T>;
  }

  async createMany<T = any>(table: string, data: Array<Record<string, any> & { id?: string }>): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected');
    if (data.length === 0) return [];
    
    const now = new Date().toISOString();
    const db = this.pool.getDatabase();
    const results: T[] = [];
    
    db.transaction(() => {
      let prepared: { fields: string[]; stmt: ReturnType<NodeSqliteDatabase['prepare']> } | null = null;
      data.forEach((item, index) => {
        const id = item.id || uuidv4();
        const mapped = this.mapForWrite(table, item);
        delete mapped.id;
        const providedCreatedAt = mapped.created_at;
        const providedUpdatedAt = mapped.updated_at;
        delete mapped.created_at;
        delete mapped.updated_at;

        const columns = this.getColumns(table);
        const hasColumn = (name: string): boolean => (columns ? columns.columns.has(name) : true);

        const createdAtValue = providedCreatedAt !== undefined ? providedCreatedAt : now;
        const updatedAtValue = providedUpdatedAt !== undefined ? providedUpdatedAt : now;
        const includeCreatedAt = hasColumn('created_at');
        const includeUpdatedAt = hasColumn('updated_at');

        const fieldNames = Object.keys(mapped);
        const fields = ['id', ...(includeCreatedAt ? ['created_at'] : []), ...(includeUpdatedAt ? ['updated_at'] : []), ...fieldNames];
        const values = [id, ...(includeCreatedAt ? [createdAtValue] : []), ...(includeUpdatedAt ? [updatedAtValue] : []), ...Object.values(mapped)];
        
        if (!prepared || prepared.fields.join(',') !== fields.join(',')) {
          const placeholders = fields.map(() => '?').join(', ');
          prepared = { fields, stmt: db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`) };
        }
        prepared.stmt.run(...values);
        
        results.push({ ...item, id, created_at: includeCreatedAt ? createdAtValue : undefined, updated_at: includeUpdatedAt ? updatedAtValue : undefined } as unknown as T);
      });
    });
    
    return results;
  }

  async update<T = any>(table: string, id: string, data: Record<string, any>): Promise<T> {
    if (!this.pool) throw new Error('Not connected');
    return this.runUpdate(await this.pool.acquire(), table, id, data);
  }

  private async runUpdate<T = any>(conn: DatabaseConnection, table: string, id: string, data: Record<string, any>): Promise<T> {
    const now = new Date().toISOString();
    const mapped = this.mapForWrite(table, data);
    if (this.getColumns(table)?.columns.has('updated_at') ?? true) {
      mapped.updated_at = now;
    }
    const fields = Object.keys(mapped);
    const values = [...Object.values(mapped), id];

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    await conn.execute(sql, values);

    return this.runFindById<T>(conn, table, id) as Promise<T>;
  }

  async updateMany<T = any>(table: string, filters: QueryFilter[], data: Record<string, any>): Promise<number> {
    if (!this.pool) throw new Error('Not connected');
    
    const now = new Date().toISOString();
    const mapped = this.mapForWrite(table, data);
    if (this.getColumns(table)?.columns.has('updated_at') ?? true) {
      mapped.updated_at = now;
    }
    const fields = Object.keys(mapped);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const { sql: whereSql, params: whereParams } = this.buildWhereClause(filters, table);
    
    const sql = `UPDATE ${table} SET ${setClause} ${whereSql}`;
    const result = await this.pool.acquire().then(conn => conn.execute(sql, [...Object.values(mapped), ...whereParams]));
    return result.affectedRows;
  }

  async delete(table: string, id: string): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    const sql = `DELETE FROM ${table} WHERE id = ?`;
    await this.pool.acquire().then(conn => conn.execute(sql, [id]));
  }

  async deleteMany(table: string, filters: QueryFilter[]): Promise<number> {
    if (!this.pool) throw new Error('Not connected');
    const { sql: whereSql, params } = this.buildWhereClause(filters);
    const sql = `DELETE FROM ${table} ${whereSql}`;
    const result = await this.pool.acquire().then(conn => conn.execute(sql, params));
    return result.affectedRows;
  }

  async softDelete(table: string, id: string): Promise<void> {
    return this.update(table, id, { deleted: true, deleted_at: new Date().toISOString() } as any);
  }

  async restore(table: string, id: string): Promise<void> {
    return this.update(table, id, { deleted: false, deleted_at: null } as any);
  }

  // ============================================================================
  // Transactions
  // ============================================================================

  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('Not connected');
    
    const conn = await this.pool.acquire();
    try {
      await conn.beginTransaction();
      // Provide provider-level CRUD helpers scoped to the open transaction
      const tx = Object.assign(Object.create(null), {
        query: conn.query.bind(conn),
        execute: conn.execute.bind(conn),
        findMany: (table: string, params?: QueryParams) => this.runFindMany(conn, table, params),
        findFirst: (table: string, params?: QueryParams) => this.runFindMany(conn, table, { ...params, limit: 1 }).then(r => r[0] ?? null),
        findById: (table: string, id: string) => this.runFindById(conn, table, id),
        create: <A>(table: string, data: Record<string, any>) => this.runCreate<A>(conn, table, data),
        update: <A>(table: string, id: string, data: Record<string, any>) => this.runUpdate<A>(conn, table, id, data),
        delete: (table: string, id: string) => conn.execute(`DELETE FROM ${table} WHERE id = ?`, [id]).then(() => undefined),
        softDelete: (table: string, id: string) => this.runUpdate(conn, table, id, { deleted: 1, deleted_at: new Date().toISOString() } as any).then(() => undefined),
        restore: (table: string, id: string) => this.runUpdate(conn, table, id, { deleted: 0, deleted_at: null } as any).then(() => undefined),
      }) as any;
      const result = await callback(tx);
      await conn.commit();
      return result;
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      await this.pool.release(conn);
    }
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  async batch(operations: BatchOperation[]): Promise<BatchResult[]> {
    if (!this.pool) throw new Error('Not connected');
    
    const results: BatchResult[] = [];
    
    const tx = await this.pool.acquire();
    try {
      await tx.beginTransaction();
      
      for (const op of operations) {
        try {
          let result: unknown;
          
          switch (op.type) {
            case 'create':
              result = await this.create(op.table, op.data as any);
              break;
            case 'update':
              if (!op.id) throw new Error('ID required for update');
              result = await this.update(op.table, op.id, op.data as any);
              break;
            case 'delete':
              if (!op.id) throw new Error('ID required for delete');
              await this.delete(op.table, op.id);
              result = { success: true };
              break;
            case 'softDelete':
              if (!op.id) throw new Error('ID required for softDelete');
              await this.softDelete(op.table, op.id);
              result = { success: true };
              break;
            case 'restore':
              if (!op.id) throw new Error('ID required for restore');
              await this.restore(op.table, op.id);
              result = { success: true };
              break;
          }
          
          results.push({ success: true, operation: op, result });
        } catch (error) {
          results.push({ 
            success: false, 
            operation: op, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await this.pool.release(tx);
    }
    
    return results;
  }

  // ============================================================================
  // Real-time Subscriptions (Not supported in SQLite)
  // ============================================================================

  async subscribe(table: string, callback: (payload: RealtimePayload) => void): Promise<{ unsubscribe: () => Promise<void>; table: string; callback: (payload: RealtimePayload) => void }> {
    // SQLite doesn't support real-time natively
    // This would be handled by the WebSocket layer
    return {
      table,
      callback,
      unsubscribe: async () => {},
    };
  }

  async unsubscribe(subscription: { unsubscribe: () => Promise<void> }): Promise<void> {
    await subscription.unsubscribe();
  }

  // ============================================================================
  // Sync (Not applicable for local SQLite)
  // ============================================================================

  async sync(config: SyncConfig): Promise<SyncResult> {
    return {
      success: true,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
      durationMs: 0,
    };
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return SyncStatus.DISCONNECTED;
  }

  async getLastSyncTime(): Promise<Date | null> {
    return null;
  }

  // ============================================================================
  // Raw Query Access
  // ============================================================================

  async rawQuery<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected');
    return this.pool.acquire().then(conn => conn.query<T>(sql, params));
  }

  async rawExecute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: string }> {
    if (!this.pool) throw new Error('Not connected');
    return this.pool.acquire().then(conn => conn.execute(sql, params));
  }

  getProviderFeatures(): ProviderFeatures {
    return this.features;
  }
}