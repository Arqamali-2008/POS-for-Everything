/**
 * Runtime smoke test for the browser localStorage data layer.
 *
 * It bundles `src/services/localStorageClient.ts` for Node, installs a tiny
 * in-memory `localStorage`, and exercises login, CRUD, a sale (with stock
 * decrement) and the statistics endpoints.
 *
 * Run it with:
 *   npm run test:local --workspace=@pospro/frontend
 */
import { webcrypto } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const bundlePath = join(here, '..', 'node_modules', '.cache', 'ami-pos-localClient.mjs');

if (!existsSync(bundlePath)) {
  console.error(`Missing bundle ${bundlePath}. Run "npm run test:local" (it bundles first).`);
  process.exit(1);
}

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  get length() {
    return this.map.size;
  }
  key(index) {
    return Array.from(this.map.keys())[index] ?? null;
  }
}

const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };
globalThis.localStorage = storage;
if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}

const { localStorageClient: api } = await import(`file://${bundlePath.replace(/\\/g, '/')}`);

const results = [];
function check(name, condition, extra = '') {
  results.push({ name, ok: Boolean(condition), extra });
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${extra ? ` :: ${extra}` : ''}`);
}

// 1. Authentication
const login = await api.auth.login({ email: 'admin@pos.com', password: 'admin123' });
check('login returns success envelope', login?.success === true, JSON.stringify(login?.data?.user?.email));
check('login persists session in localStorage', storage.getItem('ami-pos:local-session') !== null);

const badLogin = await api.auth.login({ email: 'admin@pos.com', password: 'wrong' }).then(
  () => null,
  (error) => error,
);
check('invalid password is rejected', badLogin !== null, badLogin?.message ?? '');

const me = await api.auth.me();
check('auth.me returns the signed-in admin', me?.data?.email === 'admin@pos.com');

// 2. Categories are seeded
const categories = await api.categories.list();
check(
  'categories are seeded',
  Array.isArray(categories?.data) && categories.data.length >= 4,
  `${categories?.data?.length} categories`,
);

// 3. Product CRUD
const createdProduct = await api.products.create({
  name: 'Cola Can 330ml',
  itemCode: 'SKU-1001',
  barcode: '1111111111111',
  categoryId: 'cat-beverages',
  costPrice: 80,
  sellingPrice: 120,
  stock: 25,
  minStock: 5,
  unit: 'pcs',
  trackInventory: true,
  isActive: true,
});
check(
  'product created',
  createdProduct?.success === true && Boolean(createdProduct?.data?.id),
  createdProduct?.data?.id,
);

const productList = await api.products.list();
check(
  'product list contains the new product',
  (productList?.data?.length ?? 0) >= 1,
  `${productList?.data?.length} products`,
);

const updatedProduct = await api.products.update(createdProduct.data.id, { sellingPrice: 130 });
check('product updated', updatedProduct?.data?.sellingPrice === 130, String(updatedProduct?.data?.sellingPrice));

// 4. Customer CRUD
const customer = await api.customers.create({
  name: 'Jane Doe',
  phone: '0771234567',
  type: 'regular',
  creditLimit: 5000,
});
check('customer created', customer?.success === true && Boolean(customer?.data?.id));

// 5. Sale + stock movement
const sale = await api.sales.create({
  customerId: customer.data.id,
  items: [{ productId: createdProduct.data.id, quantity: 3, unitPrice: 130, taxAmount: 0, total: 390 }],
  subtotal: 390,
  discount: 0,
  taxAmount: 0,
  grandTotal: 390,
  paidAmount: 390,
  balanceDue: 0,
  paymentType: 'Cash',
  status: 'Completed',
});
check('sale created', sale?.success === true && Boolean(sale?.data?.invoiceNo), sale?.data?.invoiceNo);

const productsAfterSale = await api.products.list();
const productAfterSale = productsAfterSale.data.find((item) => item.id === createdProduct.data.id);
check('stock decremented after the sale', Number(productAfterSale?.stock) === 22, `stock=${productAfterSale?.stock}`);

const movements = await api.inventory.stockMovements.list();
check('stock movement recorded', (movements?.data?.length ?? 0) >= 1, `${movements?.data?.length} movements`);

// 6. Insufficient stock guard
const overSell = await api.sales
  .create({
    items: [{ productId: createdProduct.data.id, quantity: 9999, unitPrice: 130 }],
    grandTotal: 1299870,
  })
  .then(
    () => null,
    (error) => error,
  );
check('insufficient stock is blocked', overSell !== null, overSell?.message ?? '');

// 7. Stats
const dashboard = await api.stats.dashboard();
check(
  'dashboard stats available',
  dashboard?.success === true && dashboard?.data?.summary?.sales?.count === 1,
  JSON.stringify(dashboard?.data?.summary?.sales),
);

const inventoryStats = await api.stats.inventory();
check('inventory stats available', inventoryStats?.success === true && inventoryStats?.data?.totalProducts === 1);

// 8. Settings persistence
await api.settings.update('shopName', 'Corner Shop');
const settings = await api.settings.get();
check('settings persisted', settings?.data?.shopName === 'Corner Shop', String(settings?.data?.shopName));

// 9. Hold bill then complete it
const held = await api.sales.create({
  customerId: customer.data.id,
  items: [{ productId: createdProduct.data.id, quantity: 2, unitPrice: 130, taxAmount: 0 }],
  paymentType: 'Cash',
  status: 'Held',
});
const stockAfterHold = (await api.products.get(createdProduct.data.id)).data.stock;
check('held bill does not touch stock', Number(stockAfterHold) === 22, `stock=${stockAfterHold}`);
const completedHeld = await api.sales.complete(held.data.id);
const stockAfterComplete = (await api.products.get(createdProduct.data.id)).data.stock;
check(
  'held bill completes and deducts stock',
  completedHeld?.data?.status === 'Completed' && Number(stockAfterComplete) === 20,
  `status=${completedHeld?.data?.status}, stock=${stockAfterComplete}`,
);

// 10. Refund restocks returned items
const refunded = await api.sales.refund(sale.data.id, {
  items: [{ productId: createdProduct.data.id, quantity: 1 }],
  amount: 130,
  reason: 'Customer return',
});
const stockAfterRefund = (await api.products.get(createdProduct.data.id)).data.stock;
check(
  'partial refund restocks the product',
  refunded?.data?.status === 'Partially Refunded' && Number(stockAfterRefund) === 21,
  `status=${refunded?.data?.status}, stock=${stockAfterRefund}`,
);

// 11. Credit sale + customer ledger payments
const creditSale = await api.sales.create({
  customerId: customer.data.id,
  items: [{ productId: createdProduct.data.id, quantity: 1, unitPrice: 120 }],
  paymentType: 'Credit',
  amountPaid: 0,
  status: 'Completed',
});
const customerAfterCredit = (await api.customers.get(customer.data.id)).data;
check(
  'credit sale adds to customer balance',
  Number(creditSale?.data?.balanceDue) === 120 && Number(customerAfterCredit.currentBalance) === 120,
  `saleDue=${creditSale?.data?.balanceDue}, balance=${customerAfterCredit.currentBalance}`,
);
const paidCustomer = await api.customers.addPayment(customer.data.id, { amount: 20, method: 'Cash' });
check('customer payment reduces balance', Number(paidCustomer?.data?.currentBalance) === 100, `balance=${paidCustomer?.data?.currentBalance}`);
const paymentId = paidCustomer.data.payments[0].id;
const revertedCustomer = await api.customers.removePayment(customer.data.id, paymentId);
check('removing a payment restores balance', Number(revertedCustomer?.data?.currentBalance) === 120, `balance=${revertedCustomer?.data?.currentBalance}`);

const ledger = await api.customers.ledger(customer.data.id);
check(
  'customer ledger includes sale and running balance',
  ledger?.data?.entries?.length >= 1 && Number.isFinite(Number(ledger?.data?.balance)),
  `${ledger?.data?.entries?.length} entries`,
);

// 12. Purchase receive updates stock and cost
const purchase = await api.purchases.create({
  supplierName: 'Demo Supplier',
  items: [{ productId: createdProduct.data.id, quantity: 10, unitCost: 70 }],
  status: 'Ordered',
});
const received = await api.purchases.receive(purchase.data.id, {});
const productAfterPurchase = (await api.products.get(createdProduct.data.id)).data;
check(
  'purchase receive restocks and updates cost',
  received?.data?.status === 'Received' && Number(productAfterPurchase.stock) === 30 && Number(productAfterPurchase.costPrice) === 70,
  `status=${received?.data?.status}, stock=${productAfterPurchase.stock}, cost=${productAfterPurchase.costPrice}`,
);

// 13. Manual stock adjustment
const setStock = await api.inventory.setStock(createdProduct.data.id, 32, 'Cycle count');
const productAfterAdjustment = (await api.products.get(createdProduct.data.id)).data;
check(
  'stock adjustment applies new stock level',
  Number(setStock?.data?.changeQty) === 2 && Number(productAfterAdjustment.stock) === 32,
  `stock=${productAfterAdjustment.stock}`,
);

// 14. Expense approval
const expense = await api.expenses.create({ amount: 50, category: 'Utilities', description: 'Smoke test', date: new Date().toISOString() });
const approvedExpense = await api.expenses.approve(expense.data.id);
check('expense can be approved', approvedExpense?.data?.isApproved === true);

// 15. Cheque status
const cheque = await api.cheques.create({
  chequeNumber: 'CHQ-1001', bankName: 'Demo Bank', partyName: 'Jane Doe',
  amount: 500, dueDate: new Date().toISOString().slice(0, 10), status: 'Pending',
});
const clearedCheque = await api.cheques.updateStatus(cheque.data.id, 'Cleared');
check('cheque status updates to cleared', clearedCheque?.data?.status === 'Cleared');

// 16. Loan repayment
const loan = await api.loans.create({ lenderName: 'Demo Bank', principal: 1000, interestAmount: 100, status: 'Active' });
const loanPayment = await api.loans.addPayment(loan.data.id, { amount: 400, method: 'Cash' });
check('loan payment updates balance', Number(loanPayment?.data?.balance) === 700, `balance=${loanPayment?.data?.balance}`);
const finalLoanPayment = await api.loans.addPayment(loan.data.id, { amount: 700 });
check('loan closes when fully paid', finalLoanPayment?.data?.status === 'Paid', `status=${finalLoanPayment?.data?.status}`);

// 17. Backup / reset / restore
const backup = await api.settings.exportData();
check(
  'backup contains business collections',
  backup?.data?.collections?.products?.length >= 1 && backup?.data?.collections?.sales?.length >= 3,
  `${backup?.data?.collections?.products?.length} products, ${backup?.data?.collections?.sales?.length} sales`,
);
await api.settings.resetData();
const afterReset = await api.products.list();
check('reset clears business data', (afterReset?.data?.length ?? 0) === 0, `${afterReset?.data?.length} products`);
const restored = await api.settings.importData(backup.data);
const afterRestore = await api.products.list();
check(
  'backup restore brings data back',
  restored?.data?.imported > 0 && (afterRestore?.data?.length ?? 0) === 1,
  `${afterRestore?.data?.length} products`,
);

// 18. Data really lives in localStorage
const rawProducts = JSON.parse(storage.getItem('ami-pos:data:products') || '[]');
check('products persisted under ami-pos:data:products', rawProducts.length === 1, `${rawProducts.length} raw records`);
check('session persisted under ami-pos:local-session', storage.getItem('ami-pos:local-session') !== null);

const failures = results.filter((result) => !result.ok);
console.log(`\n${results.length - failures.length}/${results.length} checks passed`);
if (failures.length > 0) {
  console.log('FAILED:', failures.map((failure) => failure.name).join(', '));
  process.exit(1);
}
