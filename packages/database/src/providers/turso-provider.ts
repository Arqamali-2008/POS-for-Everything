/**
 * Turso (LibSQL) Database Provider
 * Uses @libsql/client for HTTP-based SQLite database
 */

import { createClient, Client } from '@libsql/client';
import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
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
  RealtimeSubscription,
} from './interfaces';
import type { DatabaseProviderInterface } from './interfaces';
import { eq, and, or, like, ilike, inArray, isNull, isNotNull, gte, lte, gt, lt, desc, asc, sql } from 'drizzle-orm';
import * as schema from '@pospro/core/schemas';

// ============================================================================
// Turso Provider Implementation
// ============================================================================

export class TursoProvider implements DatabaseProviderInterface {
  readonly provider = DatabaseProvider.TURSO;
  readonly name = 'Turso (LibSQL)';
  
  private client: Client | null = null;
  private drizzleDb: LibSQLDatabase<any> | null = null;
  private connected = false;
  private config: DatabaseConfig | null = null;
  private syncUrl: string | null = null;
  private subscriptions: Map<string, RealtimeSubscription> = new Map();

  // Provider features
  readonly features: ProviderFeatures = {
    realtime: false, // Turso doesn't have native realtime, but supports sync
    transactions: true,
    batchOperations: true,
    softDelete: true,
    fullTextSearch: true,
    jsonQueries: true,
    sync: true, // Native sync support
    offlineSupport: true, // Embedded replicas
    migrations: true,
  };

  async connect(config: DatabaseConfig): Promise<void> {
    this.config = config;
    
    if (!config.tursoUrl || !config.tursoToken) {
      throw new Error('Turso URL and Auth Token are required');
    }
    
    this.syncUrl = config.tursoSyncUrl || null;
    
    // Create Turso client
    this.client = createClient({
      url: config.tursoUrl,
      authToken: config.tursoToken,
      syncUrl: this.syncUrl || undefined,
    });
    
    // Create Drizzle client
    this.drizzleDb = drizzle(this.client, { schema: schema.sqliteSchema as any });
    
    // Test connection
    await this.healthCheck();
    
    this.connected = true;
    console.log(`[Turso] Connected to ${config.tursoUrl}`);
  }

  async disconnect(): Promise<void> {
    // Close all subscriptions
    for (const [key, sub] of this.subscriptions) {
      await sub.unsubscribe();
    }
    this.subscriptions.clear();
    
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    
    this.drizzleDb = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      if (!this.client) throw new Error('Not connected');
      
      await this.client.execute('SELECT 1');
      
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        version: 'LibSQL (SQLite 3.x)',
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  getClient(): Client {
    if (!this.client) throw new Error('Turso not connected');
    return this.client;
  }

  getDrizzleDb(): LibSQLDatabase<any> {
    if (!this.drizzleDb) throw new Error('Drizzle not connected');
    return this.drizzleDb;
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  async createSchema(): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    // Create all tables - similar to SQLite but using Turso's execute
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
      await this.client.execute(tableSql);
    }
    
    // Insert default settings
    const defaultSettings = [
      { key: 'shop_name', value: '"AMi POS"', type: 'string', category: 'general', label: 'Shop Name', isPublic: 1, defaultValue: '"AMi POS"' },
      { key: 'currency', value: '"LKR"', type: 'string', category: 'general', label: 'Currency', isPublic: 1, defaultValue: '"LKR"' },
      { key: 'currency_symbol', value: '"Rs."', type: 'string', category: 'general', label: 'Currency Symbol', isPublic: 1, defaultValue: '"Rs."' },
      { key: 'tax_rate', value: '0', type: 'number', category: 'tax', label: 'Tax Rate %', isPublic: 1, defaultValue: '0' },
      { key: 'tax_inclusive', value: 'false', type: 'boolean', category: 'tax', label: 'Tax Inclusive', isPublic: 1, defaultValue: 'false' },
      { key: 'printer_width', value: '"80mm"', type: 'string', category: 'printing', label: 'Printer Width', isPublic: 1, defaultValue: '"80mm"' },
      { key: 'invoice_prefix', value: '"INV-"', type: 'string', category: 'general', label: 'Invoice Prefix', isPublic: 1, defaultValue: '"INV-"' },
      { key: 'receipt_footer', value: '"Thank you for your business!"', type: 'string', category: 'printing', label: 'Receipt Footer', isPublic: 1, defaultValue: '"Thank you for your business!"' },
    ];

    for (const setting of defaultSettings) {
      await this.client.execute({
        sql: `
          INSERT OR IGNORE INTO settings (id, key, value, type, category, label, is_public, is_editable, default_value, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `,
        args: [crypto.randomUUID(), setting.key, setting.value, setting.type, setting.category, setting.label, setting.isPublic, 1, setting.defaultValue],
      });
    }
  }

  async dropSchema(): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    
    const tables = [
      'audit_logs', 'sync_logs', 'print_jobs', 'devices', 'held_bills',
      'settings', 'daily_summaries', 'inventory_adjustments', 'loan_payments',
      'loans', 'cheques', 'expenses', 'purchase_items', 'purchases',
      'sale_items', 'sales', 'employees', 'suppliers', 'customer_ledger',
      'customers', 'stock_movements', 'product_variants', 'products',
      'categories', 'branches', 'users'
    ];
    
    for (const table of tables) {
      await this.client.execute(`DROP TABLE IF EXISTS ${table}`);
    }
  }

  async migrate(): Promise<void> {
    // Migrations handled by Drizzle Kit
  }

  async getMigrationStatus(): Promise<{ applied: number; pending: number }> {
    return { applied: 0, pending: 0 };
  }

  // ============================================================================
  // Generic CRUD Operations
  // ============================================================================

  private buildWhereClause(filters: QueryFilter[] = []): { sql: string; args: unknown[] } {
    if (filters.length === 0) return { sql: '', args: [] };
    
    const conditions: string[] = [];
    const args: unknown[] = [];
    
    for (const filter of filters) {
      switch (filter.operator) {
        case 'eq':
          conditions.push(`${filter.field} = ?`);
          args.push(filter.value);
          break;
        case 'neq':
          conditions.push(`${filter.field} != ?`);
          args.push(filter.value);
          break;
        case 'gt':
          conditions.push(`${filter.field} > ?`);
          args.push(filter.value);
          break;
        case 'gte':
          conditions.push(`${filter.field} >= ?`);
          args.push(filter.value);
          break;
        case 'lt':
          conditions.push(`${filter.field} < ?`);
          args.push(filter.value);
          break;
        case 'lte':
          conditions.push(`${filter.field} <= ?`);
          args.push(filter.value);
          break;
        case 'like':
          conditions.push(`${filter.field} LIKE ?`);
          args.push(`%${filter.value}%`);
          break;
        case 'ilike':
          conditions.push(`${filter.field} LIKE ?`);
          args.push(`%${filter.value}%`);
          break;
        case 'in':
          const placeholders = (filter.value as unknown[]).map(() => '?').join(',');
          conditions.push(`${filter.field} IN (${placeholders})`);
          args.push(...(filter.value as unknown[]));
          break;
        case 'notIn':
          const notPlaceholders = (filter.value as unknown[]).map(() => '?').join(',');
          conditions.push(`${filter.field} NOT IN (${notPlaceholders})`);
          args.push(...(filter.value as unknown[]));
          break;
        case 'isNull':
          conditions.push(`${filter.field} IS NULL`);
          break;
        case 'isNotNull':
          conditions.push(`${filter.field} IS NOT NULL`);
          break;
      }
    }
    
    return { sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', args };
  }

  private buildOrderBy(sorts: SortOption[] = []): string {
    if (sorts.length === 0) return '';
    return `ORDER BY ${sorts.map(s => `${s.field} ${s.order.toUpperCase()}`).join(', ')}`;
  }

  private buildLimitOffset(limit?: number, offset?: number): string {
    let sql = '';
    if (limit) sql += ` LIMIT ${limit}`;
    if (offset) sql += ` OFFSET ${offset}`;
    return sql;
  }

  async findMany<T>(table: string, params?: QueryParams): Promise<T[]> {
    if (!this.client) throw new Error('Not connected');
    
    const fields = params?.fields?.join(', ') || '*';
    const { sql: whereSql, args: whereArgs } = this.buildWhereClause(params?.filters);
    const orderBy = this.buildOrderBy(params?.sorts);
    const limitOffset = this.buildLimitOffset(params?.limit, params?.offset);
    
    const sql = `SELECT ${fields} FROM ${table} ${whereSql} ${orderBy} ${limitOffset}`;
    const result = await this.client.execute({ sql, args: whereArgs as any });
    return result.rows as T[];
  }

  async findFirst<T = any>(table: string, params?: QueryParams): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...params, limit: 1 });
    return results[0] || null;
  }

  async findById<T>(table: string, id: string): Promise<T | null> {
    return this.findFirst<T>(table, { filters: [{ field: 'id', operator: 'eq', value: id }] });
  }

  async count(table: string, filters?: QueryFilter[]): Promise<number> {
    if (!this.client) throw new Error('Not connected');
    
    const { sql: whereSql, args } = this.buildWhereClause(filters);
    const sql = `SELECT COUNT(*) as count FROM ${table} ${whereSql}`;
    const result = await this.client.execute({ sql, args: args as any });
    return Number(result.rows[0]?.count || 0);
  }

  async create<T = any>(table: string, data: Record<string, any> & { id?: string }): Promise<T> {
    if (!this.client) throw new Error('Not connected');
    
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    
    const fields = ['id', 'created_at', 'updated_at', ...Object.keys(data).filter(k => k !== 'id')];
    const values = [id, now, now, ...Object.values(data).filter((_, i) => Object.keys(data)[i] !== 'id')];
    const placeholders = fields.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
    await this.client.execute({ sql, args: values });
    
    return this.findById<T>(table, id) as Promise<T>;
  }

  async createMany<T = any>(table: string, data: Array<Record<string, any> & { id?: string }>): Promise<T[]> {
    if (!this.client) throw new Error('Not connected');
    if (data.length === 0) return [];
    
    const now = new Date().toISOString();
    const firstItem = data[0];
    const fields = ['id', 'created_at', 'updated_at', ...Object.keys(firstItem).filter(k => k !== 'id')];
    const placeholders = fields.map(() => '?').join(', ');
    
    const sql = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`;
    
    const statements = data.map(item => ({
      sql,
      args: [item.id || crypto.randomUUID(), now, now, ...Object.values(item).filter((_, i) => Object.keys(item)[i] !== 'id')],
    }));
    
    await this.client.batch(statements);
    
    return data.map(item => ({ ...item, id: item.id || crypto.randomUUID(), created_at: now, updated_at: now } as unknown as T));
  }

  async update<T = any>(table: string, id: string, data: Record<string, any>): Promise<T> {
    if (!this.client) throw new Error('Not connected');
    
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    const fields = Object.keys(updateData);
    const values = [...Object.values(updateData), id];
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
    await this.client.execute({ sql, args: values });
    
    return this.findById<T>(table, id) as Promise<T>;
  }

  async updateMany<T = any>(table: string, filters: QueryFilter[], data: Record<string, any>): Promise<number> {
    if (!this.client) throw new Error('Not connected');
    
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    const fields = Object.keys(updateData);
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const { sql: whereSql, args: whereArgs } = this.buildWhereClause(filters);
    
    const sql = `UPDATE ${table} SET ${setClause} ${whereSql}`;
    const result = await this.client.execute({ sql, args: [...Object.values(updateData), ...whereArgs] as any });
    return result.rowsAffected;
  }

  async delete(table: string, id: string): Promise<void> {
    if (!this.client) throw new Error('Not connected');
    const sql = `DELETE FROM ${table} WHERE id = ?`;
    await this.client.execute({ sql, args: [id] });
  }

  async deleteMany(table: string, filters: QueryFilter[]): Promise<number> {
    if (!this.client) throw new Error('Not connected');
    const { sql: whereSql, args } = this.buildWhereClause(filters);
    const sql = `DELETE FROM ${table} ${whereSql}`;
    const result = await this.client.execute({ sql, args: args as any });
    return result.rowsAffected;
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
    if (!this.client) throw new Error('Not connected');
    
    return (this.client.transaction as any)(async (tx: any) => {
      const txDb = drizzle(tx, { schema: schema.sqliteSchema as any });
      return callback(txDb);
    }) as unknown as Promise<T>;
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  async batch(operations: BatchOperation[]): Promise<BatchResult[]> {
    if (!this.client) throw new Error('Not connected');
    
    const results: BatchResult[] = [];
    
    // Use transaction for batch
    await (this.client.transaction as any)(async (tx: any) => {
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
    });
    
    return results;
  }

  // ============================================================================
  // Real-time Subscriptions (Not natively supported)
  // ============================================================================

  async subscribe(table: string, callback: (payload: RealtimePayload) => void): Promise<RealtimeSubscription> {
    // Turso doesn't have native realtime
    // Would need to poll or use a separate WebSocket service
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
  // Sync (Turso Native Sync)
  // ============================================================================

  async sync(config: SyncConfig): Promise<SyncResult> {
    if (!this.client) throw new Error('Not connected');
    
    const start = Date.now();
    
    try {
      if (typeof this.client.sync === 'function') {
        await this.client.sync();
        return {
          success: true,
          pushed: 0, // Would need to track from sync result
          pulled: 0,
          conflicts: 0,
          errors: [],
          durationMs: Date.now() - start,
        };
      }
      
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        errors: [{ table: '', error: 'Sync not supported by this client version', operation: 'create', resolved: false }],
        durationMs: Date.now() - start,
      };
    } catch (error) {
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        errors: [{ table: '', error: error instanceof Error ? error.message : 'Sync failed', operation: 'create', resolved: false }],
        durationMs: Date.now() - start,
      };
    }
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return SyncStatus.CONNECTED;
  }

  async getLastSyncTime(): Promise<Date | null> {
    // Would query sync_logs table
    return null;
  }

  // ============================================================================
  // Raw Query Access
  // ============================================================================

  async rawQuery<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.execute({ sql, args: params as any });
    return result.rows as T[];
  }

  async rawExecute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: string }> {
    if (!this.client) throw new Error('Not connected');
    const result = await this.client.execute({ sql, args: params as any });
    return { affectedRows: result.rowsAffected, insertId: result.rows[0]?.id as string };
  }

  getProviderFeatures(): ProviderFeatures {
    return this.features;
  }
}