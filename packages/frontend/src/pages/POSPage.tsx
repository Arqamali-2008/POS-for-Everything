import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCurrency, cn } from '../utils/helpers';
import { printReceipt } from '../utils/print';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  DollarSign,
  Smartphone,
  Receipt,
  Loader2,
  ShoppingCart,
  PauseCircle,
  User,
  Percent,
  Printer,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { useAuth } from '../providers/AuthProvider';

interface CartItem {
  id: string;
  productId: string;
  itemCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  taxRate: number;
  taxInclusive: boolean;
  costPrice: number;
  unit: string;
  stock: number;
  trackInventory: boolean;
}

const paymentTypes = [
  { value: 'Cash', label: 'Cash', icon: DollarSign },
  { value: 'Card', label: 'Card', icon: CreditCard },
  { value: 'UPI', label: 'UPI', icon: Smartphone },
  { value: 'Credit', label: 'Credit', icon: Receipt },
];

const quickCash = [100, 500, 1000, 2000, 5000];

const round2 = (value: number) => Math.round(value * 100) / 100;

function lineValues(item: CartItem) {
  const gross = item.unitPrice * item.quantity;
  const discountAmount = gross * (item.discountPercent / 100);
  const taxable = gross - discountAmount;
  const taxAmount = item.taxInclusive
    ? taxable - taxable / (1 + item.taxRate / 100)
    : taxable * (item.taxRate / 100);
  const lineTotal = item.taxInclusive ? taxable : taxable + taxAmount;
  return { gross, discountAmount, taxAmount, lineTotal };
}

export function POSPage() {
  const { success, error } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [lastSale, setLastSale] = useState<any | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [autoPaid, setAutoPaid] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [discountPercent, setDiscountPercent] = useState(0);
  const [note, setNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const { data: productsData, isLoading } = useQuery({
    queryKey: ['pos-products'],
    queryFn: () => apiClient.products.list({ limit: 500, isActive: true }),
    staleTime: 30_000,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.categories.list({ limit: 500 }),
  });

  const { data: customersData } = useQuery({
    queryKey: ['pos-customers'],
    queryFn: () => apiClient.customers.list({ limit: 500, isActive: true }),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.settings.get(),
  });

  const products = productsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const customers = customersData?.data ?? [];
  const settings = settingsData?.data ?? {};

  const enabledPaymentTypes = useMemo(() => {
    const configured = settings?.paymentMethods;
    if (!configured) return paymentTypes;
    const filtered = paymentTypes.filter((method) => configured[method.value] !== false);
    return filtered.length ? filtered : paymentTypes;
  }, [settings]);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return products.filter((product: any) => {
      if (selectedCategory && product.categoryId !== selectedCategory) return false;
      if (!query) return true;
      return [product.name, product.itemCode, product.barcode, product.sku, product.categoryName]
        .filter(Boolean)
        .some((value: string) => String(value).toLowerCase().includes(query));
    });
  }, [products, searchQuery, selectedCategory]);

  const totals = useMemo(() => {
    const subtotal = round2(cart.reduce((sum, item) => sum + lineValues(item).gross, 0));
    const itemDiscount = round2(cart.reduce((sum, item) => sum + lineValues(item).discountAmount, 0));
    const discountAmount =
      discountPercent > 0 ? round2((subtotal - itemDiscount) * (discountPercent / 100)) : 0;
    const taxAmount = round2(cart.reduce((sum, item) => {
      const values = lineValues(item);
      return sum + (item.taxInclusive ? 0 : values.taxAmount);
    }, 0));
    const taxableAmount = round2(subtotal - itemDiscount - discountAmount);
    const grandTotal = round2(taxableAmount + taxAmount);
    return { subtotal, itemDiscount, discountPercent, discountAmount, taxableAmount, taxAmount, grandTotal };
  }, [cart, discountPercent]);

  const changeDue = round2(Math.max(0, amountPaid - totals.grandTotal));
  const selectedCustomer = customers.find((customer: any) => customer.id === customerId);
  const customerName = selectedCustomer?.name || 'Walk-in Customer';

  const addToCart = (product: any) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.productId === product.id);
      const tracked = product.trackInventory !== false;
      const stock = Number(product.stock || 0);

      if (existing) {
        if (tracked && existing.quantity + 1 > stock) {
          error('Out of stock', `Only ${stock} units of ${product.name} available`);
          return prev;
        }
        return prev.map((item) =>
          item.productId === product.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      if (tracked && stock <= 0) {
        error('Out of stock', `${product.name} is out of stock`);
        return prev;
      }

      return [
        ...prev,
        {
          id: `${product.id}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productId: product.id,
          itemCode: product.itemCode,
          name: product.name,
          unitPrice: Number(product.sellingPrice || 0),
          quantity: 1,
          discountPercent: Number(product.discountPercent || 0),
          taxRate: Number(product.taxRate || 0),
          taxInclusive: Boolean(product.taxInclusive),
          costPrice: Number(product.costPrice || 0),
          unit: product.unit || 'pcs',
          stock,
          trackInventory: tracked,
        },
      ];
    });
  };

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = item.quantity + delta;
        if (next < 1) return item;
        if (item.trackInventory && next > item.stock) {
          error('Out of stock', `Only ${item.stock} units available`);
          return item;
        }
        return { ...item, quantity: next };
      }),
    );
  };

  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    const query = searchQuery.trim().toLowerCase();
    if (!query) return;
    const match = products.find(
      (product: any) =>
        String(product.barcode || '').toLowerCase() === query ||
        String(product.itemCode || '').toLowerCase() === query ||
        String(product.sku || '').toLowerCase() === query,
    );
    if (match) {
      addToCart(match);
      setSearchQuery('');
    } else if (filteredProducts.length === 1) {
      addToCart(filteredProducts[0]);
      setSearchQuery('');
    } else {
      error('No match', `No product found for "${searchQuery.trim()}"`);
    }
  };

  useEffect(() => {
    if (autoPaid && paymentMethod !== 'Credit') {
      setAmountPaid(totals.grandTotal);
    }
  }, [totals.grandTotal, autoPaid, paymentMethod]);

  const resetCart = () => {
    setCart([]);
    setAmountPaid(0);
    setAutoPaid(false);
    setCustomerId('');
    setDiscountPercent(0);
    setNote('');
    setPaymentMethod('Cash');
  };

  const buildSaleItems = () =>
    cart.map((item) => {
      const values = lineValues(item);
      return {
        productId: item.productId,
        itemCode: item.itemCode,
        name: item.name,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        discountAmount: values.discountAmount,
        taxRate: item.taxRate,
        taxAmount: values.taxAmount,
        taxInclusive: item.taxInclusive,
        costPrice: item.costPrice,
        lineTotal: values.lineTotal,
      };
    });

  const holdBill = async () => {
    if (cart.length === 0) {
      error('Empty cart', 'Add items before holding a bill');
      return;
    }
    setProcessing(true);
    try {
      const sale = await apiClient.sales.create({
        invoiceType: 'sale',
        status: 'Held',
        customerId: customerId || undefined,
        customerName,
        cashierId: user?.id,
        cashierName: user?.fullName || 'Cashier',
        cashierCode: (user as any)?.salesCode || (user as any)?.cashierCode || undefined,
        ...totals,
        paymentType: 'Held',
        paymentDetails: [],
        amountPaid: 0,
        changeDue: 0,
        balanceDue: totals.grandTotal,
        items: buildSaleItems(),
        note,
      });
      success('Bill held', `Held as ${sale.data?.invoiceNo ?? 'draft'}. Resume it from Sales > Held.`);
      resetCart();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
    } catch (err) {
      error('Could not hold bill', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setProcessing(false);
    }
  };

  const processSale = async () => {
    if (cart.length === 0) {
      error('Empty cart', 'Please add items to the cart');
      return;
    }
    if (paymentMethod === 'Credit' && !customerId) {
      error('Customer required', 'Select a customer for credit sales');
      return;
    }
    if (paymentMethod !== 'Credit' && amountPaid + 0.001 < totals.grandTotal) {
      error(
        'Insufficient payment',
        `Amount paid (${formatCurrency(amountPaid)}) is less than total (${formatCurrency(totals.grandTotal)})`,
      );
      return;
    }

    setProcessing(true);
    try {
      const paid = paymentMethod === 'Credit' ? 0 : amountPaid;
      const sale = await apiClient.sales.create({
        invoiceType: 'sale',
        status: 'Completed',
        customerId: customerId || undefined,
        customerName,
        cashierId: user?.id,
        cashierName: user?.fullName || 'Cashier',
        ...totals,
        paymentType: paymentMethod,
        paymentDetails: [{ type: paymentMethod, amount: paid, receivedAt: new Date().toISOString() }],
        amountPaid: paid,
        changeDue: paymentMethod === 'Credit' ? 0 : changeDue,
        balanceDue: paymentMethod === 'Credit' ? totals.grandTotal : 0,
        items: buildSaleItems(),
        note,
      });

      success('Sale completed', `Total: ${formatCurrency(totals.grandTotal)}`);
      setLastSale(sale.data);
      setShowPaymentModal(false);
      setShowReceipt(true);
      resetCart();
      queryClient.invalidateQueries({ queryKey: ['pos-products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
      queryClient.invalidateQueries({ queryKey: ['pos-customers'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
    } catch (err) {
      error('Sale failed', err instanceof Error ? err.message : 'Failed to process sale');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Point of Sale</h1>
          <p className="text-secondary-500 dark:text-secondary-400">
            Scan barcodes or search to add products
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={holdBill} disabled={cart.length === 0 || processing}>
            <PauseCircle className="h-4 w-4 mr-2" />
            Hold Bill
          </Button>
          <Button variant="outline" onClick={resetCart} disabled={cart.length === 0}>
            <Trash2 className="h-4 w-4 mr-2" />
            Clear
          </Button>
          <Button onClick={() => setShowPaymentModal(true)} disabled={cart.length === 0 || processing}>
            <CreditCard className="h-4 w-4 mr-2" />
            Checkout ({cart.length})
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:h-[calc(100vh-190px)]">
        <Card className="flex flex-col lg:h-full min-h-0">
          <div className="p-4 border-b border-secondary-200 dark:border-secondary-700 space-y-3">
            <Input
              placeholder="Scan barcode or search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              leftIcon={<Search className="h-5 w-5 text-secondary-400" />}
              autoFocus
            />
            <div className="flex gap-2 overflow-x-auto pb-1">
              <button
                onClick={() => setSelectedCategory('')}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border',
                  !selectedCategory
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'border-secondary-200 dark:border-secondary-700 text-secondary-600 dark:text-secondary-300',
                )}
              >
                All
              </button>
              {categories.map((category: any) => (
                <button
                  key={category.id}
                  onClick={() => setSelectedCategory(category.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap border',
                    selectedCategory === category.id
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'border-secondary-200 dark:border-secondary-700 text-secondary-600 dark:text-secondary-300',
                  )}
                >
                  {category.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-secondary-500">
                <Search className="h-12 w-12 mb-4 opacity-50" />
                <p>No products found</p>
              </div>
            ) : (
              filteredProducts.map((product: any) => {
                const tracked = product.trackInventory !== false;
                const out = tracked && Number(product.stock || 0) <= 0;
                return (
                  <button
                    key={product.id}
                    onClick={() => addToCart(product)}
                    disabled={out}
                    className={cn(
                      'w-full p-3 rounded-lg border border-secondary-200 dark:border-secondary-700 text-left transition-colors',
                      out
                        ? 'opacity-50 cursor-not-allowed bg-secondary-50 dark:bg-secondary-800/50'
                        : 'hover:bg-primary-50 dark:hover:bg-primary-900/20',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-secondary-900 dark:text-white truncate">
                          {product.name}
                        </p>
                        <p className="text-sm text-secondary-500">
                          {product.itemCode}
                          {tracked ? ` • Stock: ${product.stock ?? 0} ${product.unit || ''}` : ' • Service'}
                        </p>
                      </div>
                      <span className="font-semibold text-secondary-900 dark:text-white">
                        {formatCurrency(product.sellingPrice)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      {product.categoryName && (
                        <Badge variant="outline" size="sm">
                          {product.categoryName}
                        </Badge>
                      )}
                      {out ? (
                        <Badge variant="danger" size="sm">Out of stock</Badge>
                      ) : tracked && Number(product.stock) <= Number(product.minStock || 0) ? (
                        <Badge variant="warning" size="sm">Low: {product.stock}</Badge>
                      ) : null}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Card>

        <Card className="lg:col-span-2 flex flex-col lg:h-full min-h-0">
          <div className="p-4 border-b border-secondary-200 dark:border-secondary-700 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">
              Cart ({cart.reduce((sum, item) => sum + item.quantity, 0)} items)
            </h2>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={resetCart}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-secondary-500">
                <ShoppingCart className="h-16 w-16 mb-4 opacity-30" />
                <p className="text-lg">Cart is empty</p>
                <p className="text-sm">Search or scan products to add them</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => {
                  const values = lineValues(item);
                  return (
                    <div
                      key={item.id}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-3 p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-secondary-900 dark:text-white truncate">{item.name}</p>
                        <p className="text-sm text-secondary-500">
                          {formatCurrency(item.unitPrice)} × {item.quantity} {item.unit}
                          {item.discountPercent > 0 ? ` • ${item.discountPercent}% off` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateQuantity(item.id, -1)}
                          disabled={item.quantity <= 1}
                          aria-label={`Decrease quantity of ${item.name}`}
                        >
                          <Minus className="h-4 w-4" />
                        </Button>
                        <span className="w-10 text-center font-medium">{item.quantity}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => updateQuantity(item.id, 1)}
                          disabled={item.trackInventory && item.quantity >= item.stock}
                          aria-label={`Increase quantity of ${item.name}`}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setCart((prev) => prev.filter((row) => row.id !== item.id))}
                          className="text-red-500 hover:bg-red-50"
                          aria-label={`Remove ${item.name} from cart`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="w-24 text-right font-semibold text-secondary-900 dark:text-white">
                        {formatCurrency(values.lineTotal)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800/50 rounded-b-xl space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-secondary-600 dark:text-secondary-400">Subtotal</span>
              <span className="font-medium text-secondary-900 dark:text-white">
                {formatCurrency(totals.subtotal)}
              </span>
            </div>
            {discountPercent > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                <span>Discount ({discountPercent}%)</span>
                <span>-{formatCurrency(totals.discountAmount)}</span>
              </div>
            )}
            {totals.taxAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-secondary-600 dark:text-secondary-400">Tax</span>
                <span className="font-medium text-secondary-900 dark:text-white">
                  {formatCurrency(totals.taxAmount)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-secondary-200 dark:border-secondary-700">
              <span className="text-secondary-900 dark:text-white">Total</span>
              <span className="text-primary-600 dark:text-primary-400">
                {formatCurrency(totals.grandTotal)}
              </span>
            </div>
          </div>
        </Card>
      </div>

      <Modal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        title="Process Payment"
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setShowPaymentModal(false)}>Cancel</Button>
            <Button onClick={processSale} loading={processing} disabled={processing}>
              <CheckCircle className="h-4 w-4 mr-2" />
              Complete Sale
            </Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Customer
            </label>
            <Select
              options={[
                { value: '', label: 'Walk-in Customer' },
                ...customers.map((customer: any) => ({
                  value: customer.id,
                  label: `${customer.name}${customer.phone ? ` · ${customer.phone}` : ''}`,
                })),
              ]}
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            />
            {paymentMethod === 'Credit' && !customerId && (
              <p className="text-xs text-amber-600 mt-1">A customer is required for credit sales.</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Discount (%)
            </label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={discountPercent}
              onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
              leftIcon={<Percent className="h-5 w-5 text-secondary-400" />}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-3">
              Payment Method
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {enabledPaymentTypes.map((method) => (
                <button
                  key={method.value}
                  onClick={() => {
                    setPaymentMethod(method.value);
                    if (method.value === 'Cash') {
                      setAmountPaid(0);
                      setAutoPaid(false);
                    } else {
                      setAmountPaid(totals.grandTotal);
                      setAutoPaid(true);
                    }
                  }}
                  aria-pressed={paymentMethod === method.value}
                  className={cn(
                    'p-3 rounded-lg border-2 transition-all flex flex-col items-center gap-1',
                    paymentMethod === method.value
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-secondary-200 dark:border-secondary-700 hover:border-primary-300',
                  )}
                >
                  <method.icon
                    className={cn(
                      'h-5 w-5',
                      paymentMethod === method.value ? 'text-primary-600' : 'text-secondary-400',
                    )}
                  />
                  <span className="text-sm font-medium">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          {paymentMethod !== 'Credit' && (
            <div>
              <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
                Amount Paid
              </label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountPaid}
                onChange={(e) => {
                  setAmountPaid(Number(e.target.value) || 0);
                  setAutoPaid(false);
                }}
                leftIcon={<DollarSign className="h-5 w-5 text-secondary-400" />}
                className="text-xl font-bold"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <Button size="sm" variant="outline" onClick={() => { setAmountPaid(totals.grandTotal); setAutoPaid(true); }}>
                  Exact {formatCurrency(totals.grandTotal)}
                </Button>
                {quickCash.map((value) => (
                  <Button key={value} size="sm" variant="outline" onClick={() => { setAmountPaid(value); setAutoPaid(false); }}>
                    {formatCurrency(value)}
                  </Button>
                ))}
              </div>
              <p className="text-sm text-secondary-500 mt-2">
                Change due:{' '}
                <span className="font-medium text-green-600 dark:text-green-400">
                  {formatCurrency(changeDue)}
                </span>
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">
              Note (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800 text-secondary-900 dark:text-secondary-100 placeholder:text-secondary-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Add a note for this sale..."
            />
          </div>

          <div className="p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="text-primary-600 dark:text-primary-400">{formatCurrency(totals.grandTotal)}</span>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={showReceipt}
        onClose={() => setShowReceipt(false)}
        title="Sale Completed"
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setShowReceipt(false)}>Close</Button>
            <Button onClick={() => lastSale && printReceipt(lastSale, settings)}>
              <Printer className="h-4 w-4 mr-2" />
              Print Receipt
            </Button>
          </div>
        }
      >
        {lastSale && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle className="h-5 w-5" />
              <span className="font-medium">Payment received successfully</span>
            </div>
            <div className="flex justify-between"><span className="text-secondary-500">Invoice</span><span className="font-mono font-medium">{lastSale.invoiceNo}</span></div>
            <div className="flex justify-between"><span className="text-secondary-500">Customer</span><span>{lastSale.customerName}</span></div>
            <div className="flex justify-between"><span className="text-secondary-500">Payment</span><span>{lastSale.paymentType}</span></div>
            <div className="flex justify-between"><span className="text-secondary-500">Items</span><span>{lastSale.items?.length || 0}</span></div>
            <div className="flex justify-between border-t border-secondary-200 dark:border-secondary-700 pt-2 text-base font-bold"><span>Total</span><span>{formatCurrency(lastSale.grandTotal)}</span></div>
            <div className="flex justify-between"><span className="text-secondary-500">Paid</span><span>{formatCurrency(lastSale.amountPaid)}</span></div>
            {Number(lastSale.changeDue) > 0 && (
              <div className="flex justify-between"><span className="text-secondary-500">Change</span><span>{formatCurrency(lastSale.changeDue)}</span></div>
            )}
            {Number(lastSale.balanceDue) > 0 && (
              <div className="flex justify-between text-amber-600"><span>Balance due</span><span>{formatCurrency(lastSale.balanceDue)}</span></div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
