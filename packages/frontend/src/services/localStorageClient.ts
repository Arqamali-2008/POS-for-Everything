/**
 * Local-storage data client.
 *
 * This client is the default when no cloud/API configuration is present. Every
 * business record is persisted in the browser under the `ami-pos:data:*` keys,
 * so the application works without Node.js, SQLite, Supabase, Turso or Azure.
 */

import type { User } from '@pospro/core';
import type { ApiResponse, Pagination } from './apiTypes';

type Collection =
  | 'products'
  | 'categories'
  | 'customers'
  | 'suppliers'
  | 'sales'
  | 'purchases'
  | 'expenses'
  | 'cheques'
  | 'loans'
  | 'inventoryAdjustments'
  | 'stockMovements'
  | 'employees';

interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deleted?: boolean;
}

type AnyRecord = BaseRecord & Record<string, any>;

const STORAGE_PREFIX = 'ami-pos:data:';
const SESSION_KEY = 'ami-pos:local-session';
const LOCAL_USERS_KEY = 'ami-pos:local-users';
const ADMIN_PASSWORD_KEY = 'ami-pos:local-admin-password';
const SETTINGS_KEY = 'ami-pos:data:settings';

const DEFAULT_ADMIN = {
  id: 'local-admin-1',
  email: 'admin@pos.com',
  password: 'admin123',
  fullName: 'Store Administrator',
  role: 'admin' as const,
};

const DEFAULT_CATEGORIES = [
  { id: 'cat-general', name: 'General', description: 'General merchandise', color: '#64748b' },
  { id: 'cat-beverages', name: 'Beverages', description: 'Drinks and refreshments', color: '#2563eb' },
  { id: 'cat-food', name: 'Food', description: 'Prepared food', color: '#16a34a' },
  { id: 'cat-snacks', name: 'Snacks', description: 'Packaged snacks', color: '#f59e0b' },
];

const DEFAULT_SETTINGS: Record<string, any> = {
  shopName: 'POS for Everything',
  shopAddress: '',
  shopPhone: '',
  shopEmail: '',
  taxId: '',
  currency: 'LKR',
  currencySymbol: 'Rs.',
  taxRate: 0,
  taxInclusive: false,
  printerWidth: '80mm',
  printerName: '',
  invoicePrefix: 'INV-',
  invoiceCounter: 0,
  receiptHeader: 'Welcome to our shop',
  receiptFooter: 'Thank you for your business! Come again.',
  timezone: 'Asia/Colombo',
  language: 'en',
  theme: 'system',
  paymentMethods: {
    Cash: true,
    Card: true,
    UPI: true,
    Credit: true,
  },
  autoSync: false,
  syncInterval: 60000,
};

const COLLECTIONS: Collection[] = [
  'products',
  'categories',
  'customers',
  'suppliers',
  'sales',
  'purchases',
  'expenses',
  'cheques',
  'loans',
  'inventoryAdjustments',
  'stockMovements',
  'employees',
];

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function createId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function now(): string {
  return new Date().toISOString();
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function keyFor(collection: Collection): string {
  return `${STORAGE_PREFIX}${collection}`;
}

function readCollection<T extends AnyRecord>(collection: Collection): T[] {
  const store = storage();
  if (!store) return [];

  const raw = store.getItem(keyFor(collection));
  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  if (collection === 'categories') {
    const seeded = DEFAULT_CATEGORIES.map((category) => ({
      ...category,
      isActive: true,
      createdAt: now(),
      updatedAt: now(),
    })) as unknown as T[];
    writeCollection(collection, seeded);
    return seeded;
  }

  writeCollection(collection, []);
  return [];
}

function writeCollection<T extends AnyRecord>(collection: Collection, records: T[]): void {
  storage()?.setItem(keyFor(collection), JSON.stringify(records));
}

function liveRecords<T extends AnyRecord>(collection: Collection): T[] {
  return readCollection<T>(collection).filter((record) => !record.deleted);
}

function readSettings(): Record<string, any> {
  const store = storage();
  const raw = store?.getItem(SETTINGS_KEY);
  if (!raw) {
    const defaults = { ...DEFAULT_SETTINGS };
    store?.setItem(SETTINGS_KEY, JSON.stringify(defaults));
    return defaults;
  }
  try {
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function writeSettings(settings: Record<string, any>): void {
  storage()?.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, ...settings }));
}

function nextInvoiceNo(prefixOverride?: string): string {
  const settings = readSettings();
  const prefix = prefixOverride || settings.invoicePrefix || 'INV-';
  let counter = Number(settings.invoiceCounter || 0) + 1;
  const existing = new Set(
    liveRecords<AnyRecord>('sales')
      .map((sale) => String(sale.invoiceNo || ''))
      .filter(Boolean),
  );
  while (existing.has(`${prefix}${String(counter).padStart(5, '0')}`)) {
    counter += 1;
  }
  writeSettings({ ...settings, invoiceCounter: counter });
  return `${prefix}${String(counter).padStart(5, '0')}`;
}

function success<T>(data: T, pagination?: Pagination): ApiResponse<T> {
  return { success: true, data, pagination };
}

function failure(message: string, code = 'LOCAL_ERROR'): never {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  throw error;
}

function paginationFor(total: number, params: Record<string, any> = {}): Pagination {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(2000, Math.max(1, Number(params.limit) || 50));
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

function includesText(record: AnyRecord, search: string): boolean {
  return Object.values(record).some(
    (value) => typeof value === 'string' && value.toLowerCase().includes(search.toLowerCase()),
  );
}

function matchesFilters(record: AnyRecord, params: Record<string, any> = {}): boolean {
  const { search, categoryId, category, isActive, status, paymentType, dateFrom, dateTo, customerId, productId, lowStock } = params;

  if (search && !includesText(record, String(search))) return false;
  if (categoryId && record.categoryId !== categoryId) return false;
  if (category && record.category !== category) return false;
  if (customerId && record.customerId !== customerId) return false;
  if (productId && record.productId !== productId) return false;
  if (isActive !== undefined && record.isActive !== undefined && Boolean(record.isActive) !== Boolean(isActive)) return false;
  if (status) {
    const recordStatus = record.status ?? (record.isActive === false ? 'inactive' : 'active');
    if (recordStatus !== status) return false;
  }
  if (paymentType && record.paymentType !== paymentType) return false;

  if (lowStock && !(Number(record.stock || 0) <= Number(record.minStock || 0))) return false;

  const createdAt = new Date(record.createdAt || record.date || 0).getTime();
  if (dateFrom) {
    const from = new Date(dateFrom);
    from.setHours(0, 0, 0, 0);
    if (createdAt < from.getTime()) return false;
  }
  if (dateTo) {
    const to = new Date(dateTo);
    to.setHours(23, 59, 59, 999);
    if (createdAt > to.getTime()) return false;
  }

  return true;
}

function customerBalance(customer: AnyRecord): number {
  const sales = liveRecords<AnyRecord>('sales').filter(
    (sale) => sale.customerId === customer.id && sale.status !== 'Cancelled',
  );
  const credit = sales.reduce((sum, sale) => sum + Math.max(0, Number(sale.balanceDue || 0)), 0);
  const payments = (customer.payments ?? []).reduce(
    (sum: number, payment: AnyRecord) => sum + Number(payment.amount || 0),
    0,
  );
  return round2(Number(customer.openingBalance || 0) + credit - payments);
}

function decorate(collection: Collection, record: AnyRecord): AnyRecord {
  const copy = { ...record };

  if (collection === 'products') {
    copy.status = copy.status ?? (copy.isActive === false ? 'inactive' : 'active');
    if (!copy.categoryName && copy.categoryId) {
      copy.categoryName = liveRecords<AnyRecord>('categories').find((c) => c.id === copy.categoryId)?.name;
    }
    copy.stockValue = round2(Number(copy.stock || 0) * Number(copy.costPrice || 0));
    copy.lowStock = Number(copy.stock || 0) <= Number(copy.minStock || 0);
  }

  if (collection === 'customers') {
    const sales = liveRecords<AnyRecord>('sales').filter(
      (sale) => sale.customerId === copy.id && sale.status !== 'Cancelled',
    );
    copy.totalSpent = round2(
      sales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0) - Number(sale.refundAmount || 0), 0),
    );
    copy.currentBalance = customerBalance(record);
    copy.totalPurchases = sales.length;
    copy.lastPurchaseAt = sales.length
      ? sales.reduce((latest, sale) => (sale.createdAt > latest ? sale.createdAt : latest), sales[0].createdAt)
      : undefined;
    copy.status = copy.status ?? (copy.isActive === false ? 'inactive' : 'active');
  }

  if (collection === 'sales') {
    copy.itemCount = copy.itemCount ?? copy.items?.length ?? 0;
    copy.totalQuantity =
      copy.totalQuantity ??
      (copy.items ?? []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0);
  }

  if (collection === 'purchases') {
    copy.itemCount = copy.itemCount ?? copy.items?.length ?? 0;
    if (!copy.supplierName && copy.supplierId) {
      copy.supplierName = liveRecords<AnyRecord>('suppliers').find((s) => s.id === copy.supplierId)?.name;
    }
  }

  if (collection === 'loans') {
    const payments = (copy.payments ?? []).reduce(
      (sum: number, payment: AnyRecord) => sum + Number(payment.amount || 0),
      0,
    );
    copy.paidAmount = round2(payments);
    copy.balance = Number(copy.balance ?? Math.max(0, Number(copy.principal || 0) + Number(copy.interestAmount || 0) - payments));
  }

  return copy;
}

function listRecords(collection: Collection, params: Record<string, any> = {}): ApiResponse<AnyRecord[]> {
  const filtered = liveRecords<AnyRecord>(collection)
    .filter((record) => matchesFilters(record, params))
    .map((record) => decorate(collection, record));

  const sortBy = params.sortBy;
  if (sortBy) {
    const direction = params.sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const left = a[sortBy];
      const right = b[sortBy];
      if (left === right) return 0;
      return (left > right ? 1 : -1) * direction;
    });
  } else {
    filtered.sort(
      (a, b) =>
        new Date(b.createdAt || b.date || 0).getTime() - new Date(a.createdAt || a.date || 0).getTime(),
    );
  }

  const pagination = paginationFor(filtered.length, params);
  const offset = (pagination.page - 1) * pagination.limit;
  return success(filtered.slice(offset, offset + pagination.limit), pagination);
}

function getRecord(collection: Collection, id: string): ApiResponse<AnyRecord> {
  const record = liveRecords<AnyRecord>(collection).find((item) => item.id === id);
  if (!record) failure('Record not found', 'NOT_FOUND');
  return success(decorate(collection, record));
}

function createRecord(collection: Collection, data: Record<string, any>): ApiResponse<AnyRecord> {
  const record: AnyRecord = {
    ...data,
    id: data.id ?? createId(),
    createdAt: data.createdAt ?? now(),
    updatedAt: now(),
    deleted: false,
  };

  if (collection === 'products') {
    record.status = record.status ?? (record.isActive === false ? 'inactive' : 'active');
  }

  const records = readCollection<AnyRecord>(collection);
  records.push(record);
  writeCollection(collection, records);
  return success(decorate(collection, record));
}

function updateRecord(collection: Collection, id: string, data: Record<string, any>): ApiResponse<AnyRecord> {
  const records = readCollection<AnyRecord>(collection);
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) failure('Record not found', 'NOT_FOUND');

  records[index] = { ...records[index], ...data, id, updatedAt: now() };
  writeCollection(collection, records);
  return success(decorate(collection, records[index]));
}

function deleteRecord(collection: Collection, id: string): ApiResponse<null> {
  const records = readCollection<AnyRecord>(collection);
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) failure('Record not found', 'NOT_FOUND');

  records[index] = { ...records[index], deleted: true, updatedAt: now() };
  writeCollection(collection, records);
  return success(null);
}

function restoreRecord(collection: Collection, id: string): ApiResponse<AnyRecord> {
  const records = readCollection<AnyRecord>(collection);
  const index = records.findIndex((record) => record.id === id);
  if (index < 0) failure('Record not found', 'NOT_FOUND');

  records[index] = { ...records[index], deleted: false, updatedAt: now() };
  writeCollection(collection, records);
  return success(decorate(collection, records[index]));
}

function localUsers(): Array<Record<string, any>> {
  const store = storage();
  const raw = store?.getItem(LOCAL_USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function adminPassword(): string {
  return storage()?.getItem(ADMIN_PASSWORD_KEY) || DEFAULT_ADMIN.password;
}

function localSession(): { user: User; accessToken: string; refreshToken: string } | null {
  const raw = storage()?.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function createSession(user: User): { user: User; accessToken: string; refreshToken: string } {
  const session = {
    user,
    accessToken: `local-access-${createId()}`,
    refreshToken: `local-refresh-${createId()}`,
  };
  storage()?.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function localAuthClient() {
  return {
    login: async (credentials: {
      email: string;
      password: string;
      rememberMe?: boolean;
    }): Promise<ApiResponse<any>> => {
      const email = credentials.email.trim().toLowerCase();
      const isDefaultAdmin =
        email === DEFAULT_ADMIN.email && credentials.password === adminPassword();
      const registered = localUsers().find(
        (user) => user.email === email && user.password === credentials.password,
      );

      if (!isDefaultAdmin && !registered) {
        failure('Invalid email or password', 'LOGIN_FAILED');
      }

      const source = registered ?? {
        id: DEFAULT_ADMIN.id,
        email: DEFAULT_ADMIN.email,
        fullName: DEFAULT_ADMIN.fullName,
        role: DEFAULT_ADMIN.role,
        createdAt: now(),
      };

      const user: User = {
        id: source.id,
        email: source.email,
        fullName: source.fullName,
        role: (source.role ?? 'cashier') as User['role'],
        isActive: true,
        authProvider: 'local',
        createdAt: source.createdAt,
        updatedAt: now(),
      };

      return success(createSession(user));
    },

    register: async (data: {
      email: string;
      password: string;
      fullName: string;
      role?: string;
    }): Promise<ApiResponse<any>> => {
      const email = data.email.trim().toLowerCase();
      if (email === DEFAULT_ADMIN.email || localUsers().some((user) => user.email === email)) {
        failure('An account with this email already exists', 'REGISTRATION_FAILED');
      }

      const user = {
        id: createId(),
        email,
        password: data.password,
        fullName: data.fullName,
        role: data.role ?? 'cashier',
        createdAt: now(),
      };
      const users = localUsers();
      users.push(user);
      storage()?.setItem(LOCAL_USERS_KEY, JSON.stringify(users));

      const sessionUser: User = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role as User['role'],
        isActive: true,
        authProvider: 'local',
        createdAt: user.createdAt,
        updatedAt: now(),
      };
      return success(createSession(sessionUser));
    },

    refresh: async (refreshToken: string): Promise<ApiResponse<any>> => {
      const session = localSession();
      if (!session || session.refreshToken !== refreshToken) {
        failure('Invalid refresh token', 'REFRESH_FAILED');
      }
      const next = createSession(session.user);
      return success({ accessToken: next.accessToken, refreshToken: next.refreshToken });
    },

    logout: async (): Promise<ApiResponse<null>> => {
      storage()?.removeItem(SESSION_KEY);
      return success(null);
    },

    me: async (): Promise<ApiResponse<User>> => {
      const session = localSession();
      if (!session) failure('Not authenticated', 'UNAUTHORIZED');
      return success(session.user);
    },

    changePassword: async (data: {
      currentPassword: string;
      newPassword: string;
    }): Promise<ApiResponse<null>> => {
      const session = localSession();
      if (!session) failure('Not authenticated', 'UNAUTHORIZED');

      if (session.user.email === DEFAULT_ADMIN.email) {
        if (data.currentPassword !== adminPassword()) {
          failure('Current password is incorrect', 'PASSWORD_CHANGE_FAILED');
        }
        storage()?.setItem(ADMIN_PASSWORD_KEY, data.newPassword);
        return success(null);
      }

      const users = localUsers();
      const index = users.findIndex((user) => user.id === session.user.id);
      if (index < 0) failure('User not found', 'NOT_FOUND');
      if (users[index].password !== data.currentPassword) {
        failure('Current password is incorrect', 'PASSWORD_CHANGE_FAILED');
      }
      users[index] = { ...users[index], password: data.newPassword };
      storage()?.setItem(LOCAL_USERS_KEY, JSON.stringify(users));
      return success(null);
    },

    resetPassword: async (): Promise<ApiResponse<null>> => success(null),
  };
}

function normalizeSaleItems(items: Array<Record<string, any>>): Array<Record<string, any>> {
  return items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitPrice = Number(item.unitPrice || 0);
    const costPrice = Number(item.costPrice || 0);
    const discountPercent = Number(item.discountPercent || 0);
    const gross = unitPrice * quantity;
    const discountAmount =
      item.discountAmount !== undefined && item.discountAmount !== null
        ? Number(item.discountAmount || 0)
        : round2(gross * (discountPercent / 100));
    const taxable = round2(gross - discountAmount);
    const taxRate = Number(item.taxRate || 0);
    const taxInclusive = Boolean(item.taxInclusive);
    const taxAmount = taxInclusive
      ? round2(taxable - taxable / (1 + taxRate / 100))
      : round2(taxable * (taxRate / 100));
    const lineTotal = taxInclusive ? taxable : round2(taxable + taxAmount);

    return {
      ...item,
      quantity,
      unitPrice,
      costPrice,
      discountPercent,
      discountAmount,
      taxRate,
      taxInclusive,
      taxAmount,
      lineTotal,
      profit: round2((unitPrice - costPrice) * quantity - discountAmount),
    };
  });
}

function recalculateSale(data: Record<string, any>, items: Array<Record<string, any>>) {
  const subtotal = round2(
    items.reduce((sum, item) => sum + Number(item.unitPrice || 0) * Number(item.quantity || 0), 0),
  );
  const itemDiscount = round2(items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0));
  const discountPercent = Number(data.discountPercent || 0);
  const discountAmount =
    discountPercent > 0
      ? round2((subtotal - itemDiscount) * (discountPercent / 100))
      : round2(Number(data.discountAmount || 0));
  const taxAmount = round2(
    items.reduce(
      (sum, item) => sum + (item.taxInclusive ? 0 : Number(item.taxAmount || 0)),
      0,
    ),
  );
  const taxableAmount = round2(subtotal - itemDiscount - discountAmount);
  const grandTotal = round2(taxableAmount + taxAmount);

  return {
    subtotal,
    itemDiscount,
    discountPercent,
    discountAmount,
    taxableAmount,
    taxAmount,
    grandTotal,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  };
}

function addStockMovement(data: Record<string, any>): void {
  createRecord('stockMovements', {
    ...data,
    type: data.type ?? 'adjustment',
    quantity: Number(data.quantity || 0),
  });
}

function applyStockDelta(
  productId: string,
  quantity: number,
  type: string,
  reference: Record<string, any> = {},
): void {
  if (!productId || !quantity) return;
  const products = readCollection<AnyRecord>('products');
  const product = products.find((candidate) => candidate.id === productId);
  if (!product) failure(`Product not found: ${productId}`, 'PRODUCT_NOT_FOUND');
  if (!product.trackInventory) return;

  const previousStock = Number(product.stock || 0);
  const newStock = round2(previousStock + quantity);
  updateRecord('products', productId, { stock: newStock });
  addStockMovement({
    productId,
    productName: product.name,
    itemCode: product.itemCode,
    type,
    quantity,
    previousStock,
    newStock,
    referenceId: reference.id,
    referenceType: reference.type,
    referenceNumber: reference.number,
    reason: reference.reason ?? `${type} (${quantity > 0 ? '+' : ''}${quantity})`,
    unitCost: product.costPrice,
  });
}

function localProductsClient() {
  return {
    list: async (params?: Record<string, unknown>) => listRecords('products', params),
    get: async (id: string) => getRecord('products', id),
    getByBarcode: async (barcode: string): Promise<ApiResponse<AnyRecord>> => {
      const product = liveRecords<AnyRecord>('products').find(
        (item) => item.barcode === barcode || item.itemCode === barcode || item.sku === barcode,
      );
      if (!product) failure('Product not found', 'NOT_FOUND');
      return success(decorate('products', product));
    },
    create: async (data: Record<string, unknown>) => createRecord('products', data),
    update: async (id: string, data: Record<string, unknown>) => updateRecord('products', id, data),
    delete: async (id: string) => deleteRecord('products', id),
    restore: async (id: string) => restoreRecord('products', id),
    bulk: async (data: { products: Array<Record<string, any>> }): Promise<ApiResponse<any>> => {
      const results = data.products.map((product) =>
        product.id
          ? updateRecord('products', product.id, product).data
          : createRecord('products', product).data,
      );
      return success({ successful: results.length, failed: 0, results });
    },
  };
}

function validateSaleStock(items: Array<Record<string, any>>, status: string): void {
  if (status !== 'Completed') return;
  const products = readCollection<AnyRecord>('products');
  const remaining = new Map<string, number>();

  for (const item of items) {
    if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0) {
      failure('Item quantities must be greater than zero', 'INVALID_INPUT');
    }
    const product = products.find((candidate) => candidate.id === item.productId);
    if (!product) failure(`Product not found: ${item.productId}`, 'PRODUCT_NOT_FOUND');
    if (!product.trackInventory || product.allowNegativeStock) continue;

    const available = remaining.get(item.productId) ?? Number(product.stock || 0);
    if (Number(item.quantity) > available) {
      failure(`Insufficient stock for ${product.name}`, 'INSUFFICIENT_STOCK');
    }
    remaining.set(item.productId, available - Number(item.quantity));
  }
}

function completeSaleRecord(id: string, payment?: Record<string, any>): AnyRecord {
  const sale = getRecord('sales', id).data as AnyRecord;
  if (sale.status !== 'Held') return sale;

  validateSaleStock(sale.items ?? [], 'Completed');

  for (const item of sale.items ?? []) {
    applyStockDelta(item.productId, -Number(item.quantity || 0), 'sale', {
      id: sale.id,
      type: 'sale',
      number: sale.invoiceNo,
      reason: `Sale ${sale.invoiceNo}`,
    });
  }

  if (sale.customerId) {
    const customer = liveRecords<AnyRecord>('customers').find((c) => c.id === sale.customerId);
    if (customer) {
      updateRecord('customers', customer.id, {
        lastPurchaseAt: now(),
      });
    }
  }

  const amountPaid = Number(payment?.amountPaid ?? sale.grandTotal ?? 0);
  const paymentType = payment?.paymentType ?? sale.paymentType ?? 'Cash';

  return updateRecord('sales', id, {
    status: 'Completed',
    completedAt: now(),
    paymentType,
    amountPaid: round2(amountPaid),
    changeDue: round2(Math.max(0, amountPaid - Number(sale.grandTotal || 0))),
    balanceDue: round2(Math.max(0, Number(sale.grandTotal || 0) - amountPaid)),
    paymentDetails:
      payment?.paymentDetails ??
      [{ type: paymentType, amount: round2(amountPaid), receivedAt: now() }],
  }).data as AnyRecord;
}

function localSalesClient() {
  return {
    list: async (params?: Record<string, unknown>) => listRecords('sales', params),
    get: async (id: string) => getRecord('sales', id),

    create: async (data: Record<string, any>): Promise<ApiResponse<AnyRecord>> => {
      const items = normalizeSaleItems(Array.isArray(data.items) ? data.items : []);
      if (items.length === 0) failure('A sale must contain at least one item', 'INVALID_INPUT');
      if (items.some((item) => !Number.isFinite(item.quantity) || item.quantity <= 0)) {
        failure('Item quantities must be greater than zero', 'INVALID_INPUT');
      }

      const status = data.status ?? 'Completed';
      const totals = recalculateSale(data, items);

      if (data.paymentType === 'Credit' && !data.customerId) {
        failure('A customer is required for credit sales', 'INVALID_INPUT');
      }

      validateSaleStock(items, status);

      const invoiceNo = data.invoiceNo || nextInvoiceNo();
      const amountPaid =
        data.paymentType === 'Credit'
          ? Number(data.amountPaid || 0)
          : Number(data.amountPaid ?? totals.grandTotal);
      const balanceDue = round2(Math.max(0, totals.grandTotal - amountPaid));

      const sale = createRecord('sales', {
        ...data,
        ...totals,
        items,
        invoiceNo,
        status,
        itemCount: items.length,
        amountPaid,
        changeDue: round2(Math.max(0, amountPaid - totals.grandTotal)),
        balanceDue:
          data.balanceDue ??
          (data.paymentType === 'Credit' || status === 'Held' ? balanceDue : 0),
        paymentDetails:
          data.paymentDetails ??
          [{ type: data.paymentType ?? 'Cash', amount: amountPaid, receivedAt: now() }],
      }).data as AnyRecord;

      if (status === 'Completed') {
        for (const item of items) {
          applyStockDelta(item.productId, -Number(item.quantity), 'sale', {
            id: sale.id,
            type: 'sale',
            number: invoiceNo,
            reason: `Sale ${invoiceNo}`,
          });
        }

        if (data.customerId) {
          const customer = liveRecords<AnyRecord>('customers').find((c) => c.id === data.customerId);
          if (customer) {
            updateRecord('customers', customer.id, { lastPurchaseAt: now() });
          }
        }
      }

      return success(decorate('sales', sale));
    },

    update: async (id: string, data: Record<string, unknown>) => updateRecord('sales', id, data),

    complete: async (id: string, data?: Record<string, any>): Promise<ApiResponse<AnyRecord>> =>
      success(completeSaleRecord(id, data)),

    cancel: async (id: string): Promise<ApiResponse<null>> => {
      const sale = getRecord('sales', id).data as AnyRecord;
      if (sale.status === 'Cancelled') return success(null);

      if (sale.status === 'Completed' || sale.status === 'Partially Refunded') {
        const saleQtyByProduct = new Map<string, number>();
        for (const item of sale.items ?? []) {
          saleQtyByProduct.set(
            item.productId,
            (saleQtyByProduct.get(item.productId) ?? 0) + Number(item.quantity || 0),
          );
        }
        const refundedByProduct = new Map<string, number>();
        for (const refunded of sale.refundedItems ?? []) {
          refundedByProduct.set(
            refunded.productId,
            (refundedByProduct.get(refunded.productId) ?? 0) + Number(refunded.quantity || 0),
          );
        }
        for (const [productId, saleQty] of saleQtyByProduct) {
          const remaining = saleQty - (refundedByProduct.get(productId) ?? 0);
          if (remaining > 0) {
            applyStockDelta(productId, remaining, 'sale_cancel', {
              id: sale.id,
              type: 'sale',
              number: sale.invoiceNo,
              reason: `Cancelled ${sale.invoiceNo}`,
            });
          }
        }
      }

      updateRecord('sales', id, { status: 'Cancelled', cancelledAt: now(), balanceDue: 0 });
      return success(null);
    },

    refund: async (id: string, data: Record<string, any>): Promise<ApiResponse<AnyRecord>> => {
      const sale = getRecord('sales', id).data as AnyRecord;
      if (!['Completed', 'Partially Refunded'].includes(sale.status)) {
        failure('Only completed sales can be refunded', 'INVALID_STATE');
      }

      const saleQtyByProduct = new Map<string, number>();
      for (const item of sale.items ?? []) {
        saleQtyByProduct.set(
          item.productId,
          (saleQtyByProduct.get(item.productId) ?? 0) + Number(item.quantity || 0),
        );
      }

      const requestedByProduct = new Map<string, number>();
      const requestedItems = Array.isArray(data.items) && data.items.length
        ? data.items
        : (sale.items ?? []);
      for (const item of requestedItems) {
        requestedByProduct.set(
          item.productId,
          (requestedByProduct.get(item.productId) ?? 0) + Number(item.quantity || 0),
        );
      }

      const previousRefunded: Array<AnyRecord> = sale.refundedItems ?? [];
      const alreadyRefundedByProduct = new Map<string, number>();
      for (const refunded of previousRefunded) {
        alreadyRefundedByProduct.set(
          refunded.productId,
          (alreadyRefundedByProduct.get(refunded.productId) ?? 0) + Number(refunded.quantity || 0),
        );
      }

      const mergedRefunded: Array<AnyRecord> = [...previousRefunded];
      const actualRefundedByProduct = new Map<string, number>();
      for (const [productId, requested] of requestedByProduct) {
        const available =
          (saleQtyByProduct.get(productId) ?? 0) - (alreadyRefundedByProduct.get(productId) ?? 0);
        const quantity = Math.min(Math.max(0, available), Math.max(0, requested));
        actualRefundedByProduct.set(productId, quantity);
        if (quantity <= 0) continue;
        if (data.restock !== false) {
          applyStockDelta(productId, quantity, 'sale_return', {
            id: sale.id,
            type: 'sale',
            number: sale.invoiceNo,
            reason: data.reason ?? `Refund ${sale.invoiceNo}`,
          });
        }
        const existing = mergedRefunded.find((item) => item.productId === productId);
        if (existing) existing.quantity = Number(existing.quantity || 0) + quantity;
        else mergedRefunded.push({ productId, quantity } as any);
      }

      const fullyRefunded = Array.from(saleQtyByProduct.entries()).every(([productId, saleQty]) => {
        const refunded = mergedRefunded.find((entry) => entry.productId === productId);
        return Number(refunded?.quantity || 0) >= saleQty;
      });

      const remainingRefundable = round2(
        Number(sale.grandTotal || 0) - Number(sale.refundAmount || 0),
      );
      const refundAmount = round2(
        Math.max(0, Math.min(remainingRefundable, data.amount !== undefined ? Number(data.amount) : remainingRefundable)),
      );
      if (refundAmount <= 0) {
        failure('Refund amount exceeds the remaining refundable balance', 'INVALID_INPUT');
      }
      const balanceDue = round2(Math.max(0, Number(sale.balanceDue || 0) - refundAmount));

      const updated = updateRecord('sales', id, {
        status: fullyRefunded ? 'Refunded' : 'Partially Refunded',
        refundedItems: mergedRefunded,
        refundAmount: round2(Number(sale.refundAmount || 0) + refundAmount),
        refundReason: data.reason,
        refundMethod: data.method ?? sale.paymentType,
        refundedAt: now(),
        balanceDue,
      });

      return success(decorate('sales', updated.data as AnyRecord));
    },
  };
}

function localCustomersClient() {
  return {
    ...simpleCollectionClient('customers'),

    ledger: async (id: string): Promise<ApiResponse<any>> => {
      const customer = getRecord('customers', id).data as AnyRecord;
      const sales = liveRecords<AnyRecord>('sales').filter(
        (sale) => sale.customerId === id && !['Held', 'Cancelled'].includes(sale.status),
      );
      const entries: Array<Record<string, any>> = [];

      if (Number(customer.openingBalance || 0)) {
        entries.push({
          date: customer.createdAt,
          type: 'Opening Balance',
          reference: 'Opening',
          debit: Number(customer.openingBalance),
          credit: 0,
        });
      }

      for (const sale of sales) {
        entries.push({
          date: sale.createdAt,
          type: 'Sale',
          reference: sale.invoiceNo,
          debit: Number(sale.grandTotal || 0),
          credit: Number(sale.amountPaid || 0),
        });
        if (Number(sale.refundAmount || 0) > 0) {
          entries.push({
            date: sale.refundedAt ?? sale.createdAt,
            type: 'Refund',
            reference: sale.invoiceNo,
            debit: 0,
            credit: Number(sale.refundAmount || 0),
          });
        }
      }

      for (const payment of customer.payments ?? []) {
        entries.push({
          date: payment.date,
          type: `Payment (${payment.method ?? 'Cash'})`,
          reference: payment.reference ?? 'Payment',
          debit: 0,
          credit: Number(payment.amount || 0),
        });
      }

      entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let running = 0;
      const ledger: Array<Record<string, any>> = entries.map((entry) => {
        running = round2(running + Number(entry.debit || 0) - Number(entry.credit || 0));
        return { ...entry, balance: running };
      });

      return success({
        customer: decorate('customers', customer),
        entries: ledger,
        balance: customerBalance(customer),
        totalDebit: round2(ledger.reduce((sum, entry) => sum + Number(entry.debit || 0), 0)),
        totalCredit: round2(ledger.reduce((sum, entry) => sum + Number(entry.credit || 0), 0)),
        sales: sales
          .filter((sale) => sale.status !== 'Cancelled')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((sale) => decorate('sales', sale)),
      });
    },

    addPayment: async (
      id: string,
      data: Record<string, any>,
    ): Promise<ApiResponse<AnyRecord>> => {
      const customer = getRecord('customers', id).data as AnyRecord;
      const amount = Number(data.amount || 0);
      if (amount <= 0) failure('Payment amount must be greater than zero', 'INVALID_INPUT');

      const payment = {
        id: createId(),
        date: data.date ?? now(),
        amount,
        method: data.method ?? 'Cash',
        reference: data.reference,
        note: data.note,
      };
      const payments = [...(customer.payments ?? []), payment];
      const updated = updateRecord('customers', id, { payments });
      return success(decorate('customers', updated.data as AnyRecord));
    },

    removePayment: async (
      id: string,
      paymentId: string,
    ): Promise<ApiResponse<AnyRecord>> => {
      const customer = getRecord('customers', id).data as AnyRecord;
      const payments = (customer.payments ?? []).filter(
        (payment: AnyRecord) => payment.id !== paymentId,
      );
      const updated = updateRecord('customers', id, { payments });
      return success(decorate('customers', updated.data as AnyRecord));
    },
  };
}

function normalizePurchaseItems(items: Array<Record<string, any>>): Array<Record<string, any>> {
  return items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const unitCost = Number(item.unitCost ?? item.costPrice ?? 0);
    const taxRate = Number(item.taxRate || 0);
    const discountAmount = Number(item.discountAmount || 0);
    const lineTotal = round2(quantity * unitCost - discountAmount);
    return {
      ...item,
      quantity,
      unitCost,
      taxRate,
      discountAmount,
      lineTotal,
      taxAmount: round2(lineTotal * (taxRate / 100)),
      receivedQuantity: Number(item.receivedQuantity || 0),
    };
  });
}

function purchaseTotals(items: Array<Record<string, any>>) {
  const subtotal = round2(items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitCost), 0));
  const discountAmount = round2(items.reduce((sum, item) => sum + Number(item.discountAmount || 0), 0));
  const taxAmount = round2(items.reduce((sum, item) => sum + Number(item.taxAmount || 0), 0));
  return {
    subtotal,
    discountAmount,
    taxAmount,
    grandTotal: round2(subtotal - discountAmount + taxAmount),
    itemCount: items.length,
    totalQuantity: items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
  };
}

function localPurchasesClient() {
  return {
    list: async (params?: Record<string, unknown>) => listRecords('purchases', params),
    get: async (id: string) => getRecord('purchases', id),

    create: async (data: Record<string, any>): Promise<ApiResponse<AnyRecord>> => {
      const items = normalizePurchaseItems(Array.isArray(data.items) ? data.items : []);
      if (items.length === 0) failure('A purchase must contain at least one item', 'INVALID_INPUT');
      const totals = purchaseTotals(items);
      const supplier = data.supplierId
        ? liveRecords<AnyRecord>('suppliers').find((s) => s.id === data.supplierId)
        : undefined;

      const purchase = createRecord('purchases', {
        ...data,
        ...totals,
        items,
        poNumber: data.poNumber || `PO-${Date.now().toString().slice(-6)}`,
        supplierName: data.supplierName ?? supplier?.name,
        status: data.status ?? 'Ordered',
      }).data as AnyRecord;

      return success(decorate('purchases', purchase));
    },

    update: async (id: string, data: Record<string, any>): Promise<ApiResponse<AnyRecord>> => {
      const existing = getRecord('purchases', id).data as AnyRecord;
      if (Array.isArray(data.items)) {
        const items = normalizePurchaseItems(data.items);
        data = { ...data, ...purchaseTotals(items), items };
      }
      const updated = updateRecord('purchases', id, {
        ...data,
        supplierName:
          data.supplierName ??
          (data.supplierId
            ? liveRecords<AnyRecord>('suppliers').find((s) => s.id === data.supplierId)?.name
            : existing.supplierName),
      });
      return success(decorate('purchases', updated.data as AnyRecord));
    },

    delete: async (id: string) => {
      const purchase = getRecord('purchases', id).data as AnyRecord;
      const receivedQty = (purchase.items ?? []).reduce(
        (sum: number, item: AnyRecord) => sum + Number(item.receivedQuantity || 0),
        0,
      );
      if (receivedQty > 0 && purchase.status !== 'Cancelled') {
        for (const item of purchase.items ?? []) {
          if (Number(item.receivedQuantity || 0) > 0) {
            applyStockDelta(
              item.productId,
              -Number(item.receivedQuantity || 0),
              'purchase_delete',
              {
                id: purchase.id,
                type: 'purchase',
                number: purchase.poNumber,
                reason: `Purchase ${purchase.poNumber} deleted — stock reverted`,
              },
            );
          }
        }
      }
      return deleteRecord('purchases', id);
    },

    receive: async (id: string, data: Record<string, any> = {}): Promise<ApiResponse<AnyRecord>> => {
      const purchase = getRecord('purchases', id).data as AnyRecord;
      if (purchase.status === 'Cancelled') failure('Cancelled purchases cannot be received', 'INVALID_STATE');
      if (purchase.status === 'Received') failure('Purchase already received', 'INVALID_STATE');

      const requested: Record<string, number> = {};
      if (Array.isArray(data.items) && data.items.length) {
        for (const item of data.items) {
          const quantity = Number(item.quantity || 0);
          if (quantity < 0) failure('Receive quantities cannot be negative', 'INVALID_INPUT');
          requested[item.productId] = quantity;
        }
      }

      const items = (purchase.items ?? []).map((item: AnyRecord) => {
        const ordered = Number(item.quantity || 0);
        const alreadyReceived = Number(item.receivedQuantity || 0);
        const remaining = Math.max(0, ordered - alreadyReceived);
        const quantity = Math.min(remaining, requested[item.productId] ?? remaining);
        return { ...item, receiveNow: quantity, receivedQuantity: alreadyReceived + quantity };
      });

      for (const item of items) {
        if (item.receiveNow > 0) {
          applyStockDelta(item.productId, item.receiveNow, 'purchase', {
            id: purchase.id,
            type: 'purchase',
            number: purchase.poNumber,
            reason: `Purchase ${purchase.poNumber}`,
          });
          if (Number(item.unitCost) > 0 && item.receivedQuantity >= item.quantity) {
            updateRecord('products', item.productId, { costPrice: Number(item.unitCost) });
          }
        }
      }

      const fullyReceived = items.every(
        (item: AnyRecord) => Number(item.receivedQuantity) >= Number(item.quantity),
      );
      const updated = updateRecord('purchases', id, {
        items: items.map(({ receiveNow, ...item }: AnyRecord) => item),
        status: fullyReceived ? 'Received' : 'Partial',
        receivedAt: fullyReceived ? now() : purchase.receivedAt,
      });

      return success(decorate('purchases', updated.data as AnyRecord));
    },
  };
}

function localInventoryClient() {
  return {
    adjustments: {
      list: async (params?: Record<string, unknown>) => listRecords('inventoryAdjustments', params),

      create: async (data: Record<string, any>): Promise<ApiResponse<AnyRecord>> => {
        const products = readCollection<AnyRecord>('products');
        const product = products.find((candidate) => candidate.id === data.productId);
        if (!product) failure('Product not found', 'NOT_FOUND');

        const previousStock = Number(product.stock || 0);
        const newStock =
          data.newStock !== undefined && data.newStock !== null
            ? Number(data.newStock)
            : previousStock + Number(data.changeQty || 0);
        const changeQty = round2(newStock - previousStock);

        updateRecord('products', product.id, { stock: newStock });
        const adjustment = createRecord('inventoryAdjustments', {
          ...data,
          type: data.type ?? (changeQty >= 0 ? 'increase' : 'decrease'),
          itemCode: product.itemCode,
          itemName: product.name,
          changeQty,
          previousStock,
          newStock,
          isApproved: data.isApproved ?? true,
          approvedAt: now(),
        }).data as AnyRecord;

        addStockMovement({
          productId: product.id,
          productName: product.name,
          itemCode: product.itemCode,
          type: changeQty >= 0 ? 'adjustment_in' : 'adjustment_out',
          quantity: changeQty,
          previousStock,
          newStock,
          referenceId: adjustment.id,
          referenceType: 'adjustment',
          reason: data.reason ?? 'Manual adjustment',
          unitCost: product.costPrice,
        });

        return success(adjustment);
      },

      approve: async (id: string) => updateRecord('inventoryAdjustments', id, { isApproved: true, approvedAt: now() }),
    },

    stockMovements: Object.assign(
      async (params?: Record<string, unknown>) => listRecords('stockMovements', params),
      { list: async (params?: Record<string, unknown>) => listRecords('stockMovements', params) },
    ),

    setStock: async (productId: string, newStock: number, reason = 'Stock count'): Promise<ApiResponse<any>> => {
      const product = getRecord('products', productId).data as AnyRecord;
      const changeQty = round2(Number(newStock) - Number(product.stock || 0));
      return localInventoryClient().adjustments.create({
        productId,
        newStock: Number(newStock),
        changeQty,
        reason,
      });
    },
  };
}

function localLoansClient() {
  return {
    ...simpleCollectionClient('loans'),

    update: async (id: string, data: Record<string, any>): Promise<ApiResponse<AnyRecord>> => {
      const updated = updateRecord('loans', id, data).data as AnyRecord;
      const paidAmount = round2(
        (updated.payments ?? []).reduce((sum: number, entry: AnyRecord) => sum + Number(entry.amount || 0), 0),
      );
      const totalPayable = round2(Number(updated.principal || 0) + Number(updated.interestAmount || 0));
      const balance = round2(Math.max(0, totalPayable - paidAmount));
      return success(
        updateRecord('loans', id, {
          paidAmount,
          balance,
          status: balance === 0 ? 'Paid' : updated.status === 'Paid' && balance > 0 ? 'Active' : updated.status,
        }).data as AnyRecord,
      );
    },

    addPayment: async (id: string, data: Record<string, any>): Promise<ApiResponse<AnyRecord>> => {
      const loan = getRecord('loans', id).data as AnyRecord;
      const amount = Number(data.amount || 0);
      if (amount <= 0) failure('Payment amount must be greater than zero', 'INVALID_INPUT');
      const totalPayable = round2(Number(loan.principal || 0) + Number(loan.interestAmount || 0));
      const currentBalance = round2(Math.max(0, totalPayable - Number(loan.paidAmount || 0)));
      if (amount > currentBalance) {
        failure(`Payment exceeds the outstanding balance (${currentBalance.toFixed(2)})`, 'INVALID_INPUT');
      }

      const payment = {
        id: createId(),
        date: data.date ?? now(),
        amount,
        method: data.method ?? 'Cash',
        note: data.note,
      };
      const payments = [...(loan.payments ?? []), payment];
      const paidAmount = round2(payments.reduce((sum, entry) => sum + Number(entry.amount || 0), 0));
      const balance = round2(Math.max(0, totalPayable - paidAmount));

      return updateRecord('loans', id, {
        payments,
        paidAmount,
        balance,
        status: balance === 0 ? 'Paid' : loan.status === 'Paid' ? 'Active' : loan.status,
        paidInstallments: payments.length,
      });
    },
  };
}

function localChequesClient() {
  return {
    ...simpleCollectionClient('cheques'),
    updateStatus: async (id: string, status: string) =>
      updateRecord('cheques', id, {
        status,
        clearedAt: status === 'Cleared' ? now() : undefined,
      }),
  };
}

function localExpensesClient() {
  return {
    ...simpleCollectionClient('expenses'),
    approve: async (id: string) => updateRecord('expenses', id, { isApproved: true, approvedAt: now() }),
  };
}

function localSettingsClient() {
  return {
    get: async (): Promise<ApiResponse<Record<string, any>>> => success(readSettings()),
    getPublic: async (): Promise<ApiResponse<Record<string, any>>> => success(readSettings()),
    update: async (key: string, value: unknown): Promise<ApiResponse<Record<string, any>>> => {
      const settings = { ...readSettings(), [key]: value };
      writeSettings(settings);
      return success(settings);
    },
    bulkUpdate: async (data: Record<string, any>): Promise<ApiResponse<Record<string, any>>> => {
      const settings = { ...readSettings(), ...data };
      writeSettings(settings);
      return success(settings);
    },
    exportData: async (): Promise<ApiResponse<any>> => {
      const collections: Record<string, AnyRecord[]> = {};
      for (const collection of COLLECTIONS) {
        collections[collection] = readCollection<AnyRecord>(collection);
      }
      return success({
        app: 'ami-pos',
        version: 2,
        exportedAt: now(),
        settings: readSettings(),
        collections,
      });
    },
    importData: async (payload: Record<string, any>): Promise<ApiResponse<any>> => {
      if (!payload || typeof payload !== 'object' || !payload.collections) {
        failure('Invalid backup file', 'INVALID_BACKUP');
      }
      let imported = 0;
      for (const [collection, records] of Object.entries(payload.collections)) {
        if (!COLLECTIONS.includes(collection as Collection) || !Array.isArray(records)) continue;
        writeCollection(collection as Collection, records as AnyRecord[]);
        imported += records.length;
      }
      if (payload.settings) writeSettings(payload.settings);
      return success({ imported });
    },
    resetData: async (): Promise<ApiResponse<null>> => {
      for (const collection of COLLECTIONS) {
        writeCollection(collection, []);
      }
      writeSettings({ ...DEFAULT_SETTINGS });
      return success(null);
    },
  };
}

function periodStart(period?: string): Date | null {
  const date = new Date();
  switch (period) {
    case 'today':
      date.setHours(0, 0, 0, 0);
      return date;
    case 'this_week': {
      const day = date.getDay();
      date.setDate(date.getDate() - day);
      date.setHours(0, 0, 0, 0);
      return date;
    }
    case 'this_month':
      date.setDate(1);
      date.setHours(0, 0, 0, 0);
      return date;
    case 'this_year':
      date.setMonth(0, 1);
      date.setHours(0, 0, 0, 0);
      return date;
    case 'all':
      return null;
    default:
      date.setHours(0, 0, 0, 0);
      return date;
  }
}

function inPeriod(dateValue: string, period?: string): boolean {
  const start = periodStart(period);
  if (!start) return true;
  return new Date(dateValue).getTime() >= start.getTime();
}

function localStatsClient() {
  return {
    dashboard: async (params?: Record<string, any>): Promise<ApiResponse<any>> => {
      const products = liveRecords<AnyRecord>('products');
      const customers = liveRecords<AnyRecord>('customers');
      const sales = liveRecords<AnyRecord>('sales').filter(
        (sale) => !['Cancelled', 'Held'].includes(sale.status) && inPeriod(sale.createdAt, params?.period),
      );
      const expenses = liveRecords<AnyRecord>('expenses').filter((expense) =>
        inPeriod(expense.date || expense.createdAt, params?.period),
      );
      const lowStockItems = products
        .filter((product) => Number(product.stock || 0) <= Number(product.minStock || 0))
        .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));

      const revenue = round2(sales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0));
      const expenseTotal = round2(expenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0));
      const grossProfit = round2(
        sales.reduce(
          (sum, sale) => sum + (sale.items ?? []).reduce((itemSum: number, item: AnyRecord) => itemSum + Number(item.profit || 0), 0),
          0,
        ),
      );

      return success({
        period: params?.period ?? 'today',
        summary: {
          products: products.filter((product) => product.isActive !== false).length,
          lowStockAlerts: lowStockItems.length,
          customers: customers.filter((customer) => customer.isActive !== false).length,
          sales: {
            count: sales.length,
            totalRevenue: revenue,
            averageValue: sales.length ? round2(revenue / sales.length) : 0,
          },
          expenses: expenseTotal,
          profit: round2(grossProfit - expenseTotal),
        },
        lowStockItems: lowStockItems.slice(0, 10).map((product) => decorate('products', product)),
        recentSales: sales
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 5)
          .map((sale) => decorate('sales', sale)),
      });
    },

    sales: async (params?: Record<string, any>): Promise<ApiResponse<any>> => {
      const sales = liveRecords<AnyRecord>('sales').filter(
        (sale) => !['Cancelled', 'Held'].includes(sale.status) && inPeriod(sale.createdAt, params?.period),
      );
      const groups = new Map<string, { count: number; revenue: number }>();
      const daily = new Map<string, { count: number; revenue: number }>();
      const hourly = new Map<number, { count: number; revenue: number }>();
      const products = liveRecords<AnyRecord>('products');
      const byCategory = new Map<string, { quantity: number; revenue: number }>();
      const byProduct = new Map<string, { name: string; quantity: number; revenue: number; profit: number }>();
      const byCashier = new Map<string, { count: number; revenue: number }>();

      for (const sale of sales) {
        const type = sale.paymentType || 'Cash';
        const group = groups.get(type) ?? { count: 0, revenue: 0 };
        group.count += 1;
        group.revenue += Number(sale.grandTotal || 0);
        groups.set(type, group);

        const day = new Date(sale.createdAt).toLocaleDateString('en-CA');
        const dayGroup = daily.get(day) ?? { count: 0, revenue: 0 };
        dayGroup.count += 1;
        dayGroup.revenue += Number(sale.grandTotal || 0);
        daily.set(day, dayGroup);

        const hour = new Date(sale.createdAt).getHours();
        const hourGroup = hourly.get(hour) ?? { count: 0, revenue: 0 };
        hourGroup.count += 1;
        hourGroup.revenue += Number(sale.grandTotal || 0);
        hourly.set(hour, hourGroup);

        const cashier = sale.cashierName || 'Cashier';
        const cashierGroup = byCashier.get(cashier) ?? { count: 0, revenue: 0 };
        cashierGroup.count += 1;
        cashierGroup.revenue += Number(sale.grandTotal || 0);
        byCashier.set(cashier, cashierGroup);

        for (const item of sale.items ?? []) {
          const product = products.find((candidate) => candidate.id === item.productId);
          const category = product?.categoryName || 'Uncategorized';
          const categoryGroup = byCategory.get(category) ?? { quantity: 0, revenue: 0 };
          categoryGroup.quantity += Number(item.quantity || 0);
          categoryGroup.revenue += Number(item.lineTotal || 0);
          byCategory.set(category, categoryGroup);

          const productGroup = byProduct.get(item.productId) ?? {
            name: item.name,
            quantity: 0,
            revenue: 0,
            profit: 0,
          };
          productGroup.quantity += Number(item.quantity || 0);
          productGroup.revenue += Number(item.lineTotal || 0);
          productGroup.profit += Number(item.profit || 0);
          byProduct.set(item.productId, productGroup);
        }
      }

      const totalRevenue = round2(
        sales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0),
      );

      return success({
        period: params?.period ?? 'today',
        summary: {
          totalRevenue,
          totalSales: sales.length,
          averageValue: sales.length ? round2(totalRevenue / sales.length) : 0,
        },
        byPayment: Array.from(groups.entries()).map(([payment_type, group]) => ({
          payment_type,
          paymentType: payment_type,
          count: group.count,
          revenue: round2(group.revenue),
        })),
        hourly: Array.from(hourly.entries())
          .sort(([a], [b]) => a - b)
          .map(([hour, group]) => ({ hour, ...group, revenue: round2(group.revenue) })),
        daily: Array.from(daily.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, group]) => ({ date, ...group, revenue: round2(group.revenue) })),
        byCategory: Array.from(byCategory.entries())
          .map(([category, group]) => ({ category, ...group, revenue: round2(group.revenue) }))
          .sort((a, b) => b.revenue - a.revenue),
        byCashier: Array.from(byCashier.entries()).map(([cashier, group]) => ({
          cashier,
          ...group,
          revenue: round2(group.revenue),
        })),
        topProducts: Array.from(byProduct.entries())
          .map(([productId, group]) => ({ productId, ...group, revenue: round2(group.revenue), profit: round2(group.profit) }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 10),
      });
    },

    inventory: async (): Promise<ApiResponse<any>> => {
      const products = liveRecords<AnyRecord>('products');
      const categories = new Map<string, { count: number; value: number }>();

      for (const product of products) {
        const category = product.categoryName || 'Uncategorized';
        const group = categories.get(category) ?? { count: 0, value: 0 };
        group.count += 1;
        group.value += Number(product.stock || 0) * Number(product.costPrice || 0);
        categories.set(category, group);
      }

      const lowStockItems = products
        .filter((product) => Number(product.stock || 0) <= Number(product.minStock || 0))
        .sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0));

      return success({
        totalProducts: products.length,
        activeProducts: products.filter((product) => product.isActive !== false).length,
        lowStockProducts: lowStockItems.filter((product) => Number(product.stock || 0) > 0).length,
        outOfStockProducts: products.filter((product) => Number(product.stock || 0) <= 0).length,
        inventoryValue: round2(
          products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.costPrice || 0), 0),
        ),
        retailValue: round2(
          products.reduce((sum, product) => sum + Number(product.stock || 0) * Number(product.sellingPrice || 0), 0),
        ),
        lowStockItems: lowStockItems.map((product) => decorate('products', product)),
        categoryBreakdown: Array.from(categories.entries()).map(([category, group]) => ({
          category,
          count: group.count,
          value: round2(group.value),
        })),
      });
    },

    customers: async (): Promise<ApiResponse<any>> => {
      const customers = liveRecords<AnyRecord>('customers');
      const decorated = customers.map((customer) => decorate('customers', customer));
      return success({
        totalCustomers: customers.length,
        newCustomers: customers.filter((customer) => inPeriod(customer.createdAt, 'this_month')).length,
        activeCustomers: customers.filter((customer) => customer.isActive !== false).length,
        outstandingBalance: round2(
          decorated.reduce((sum, customer) => sum + Math.max(0, Number(customer.currentBalance || 0)), 0),
        ),
        topCustomers: decorated
          .sort((a, b) => Number(b.totalSpent || 0) - Number(a.totalSpent || 0))
          .slice(0, 10)
          .map((customer) => ({
            id: customer.id,
            name: customer.name,
            totalSpent: customer.totalSpent,
            balance: customer.currentBalance,
          })),
        tierBreakdown: [],
      });
    },
  };
}

function simpleCollectionClient(collection: Collection) {
  return {
    list: async (params?: Record<string, unknown>) => listRecords(collection, params),
    get: async (id: string) => getRecord(collection, id),
    create: async (data: Record<string, unknown>) => createRecord(collection, data),
    update: async (id: string, data: Record<string, unknown>) => updateRecord(collection, id, data),
    delete: async (id: string) => deleteRecord(collection, id),
  };
}

export const localStorageClient = {
  auth: localAuthClient(),
  products: localProductsClient(),
  categories: simpleCollectionClient('categories'),
  customers: localCustomersClient(),
  suppliers: simpleCollectionClient('suppliers'),
  sales: localSalesClient(),
  purchases: localPurchasesClient(),
  expenses: localExpensesClient(),
  cheques: localChequesClient(),
  loans: localLoansClient(),
  inventory: localInventoryClient(),
  employees: simpleCollectionClient('employees'),
  settings: localSettingsClient(),
  sync: {
    status: async (): Promise<ApiResponse<any>> =>
      success({ isRunning: false, autoSyncEnabled: false, provider: 'localStorage' }),
    trigger: async (): Promise<ApiResponse<any>> => success({ success: true, pushed: 0, pulled: 0 }),
    push: async (): Promise<ApiResponse<any>> => success({ success: true, pushed: 0 }),
    pull: async (): Promise<ApiResponse<any>> => success({ success: true, pulled: 0 }),
    resolveConflict: async (): Promise<ApiResponse<null>> => success(null),
  },
  health: {
    check: async (): Promise<ApiResponse<any>> => success({ status: 'ok', mode: 'localStorage' }),
    detailed: async (): Promise<ApiResponse<any>> => success({ status: 'healthy', mode: 'localStorage' }),
  },
  stats: localStatsClient(),
};

export type LocalStorageClient = typeof localStorageClient;
