import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatDateTime, formatNumber, cn } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import {
  Plus,
  Search,
  Package,
  AlertTriangle,
  ArrowUpDown,
  History,
  Download,
  ClipboardList,
  Boxes,
  RotateCcw,
  TrendingUp,
  ScanLine,
} from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const adjustmentSchema = z.object({
  productId: z.string().min(1, 'Select a product'),
  newStock: z.coerce.number().min(0, 'Stock cannot be negative'),
  reason: z.string().min(1, 'Reason is required'),
  note: z.string().optional(),
});

type AdjustmentForm = z.infer<typeof adjustmentSchema>;
type InventoryTab = 'stock' | 'adjustments' | 'movements';
type StockStatus = 'all' | 'ok' | 'low' | 'out' | 'over' | 'negative';

function productStatus(product: any): Exclude<StockStatus, 'all'> {
  const stock = Number(product.stock || 0);
  const minStock = Number(product.minStock || 0);
  const maxStock = Number(product.maxStock || 0);
  const reorderLevel = Number(product.reorderLevel || 0);
  if (stock < 0) return 'negative';
  if (stock === 0) return 'out';
  if (maxStock > 0 && stock > maxStock) return 'over';
  if (stock <= Math.max(minStock, reorderLevel)) return 'low';
  return 'ok';
}

function statusBadge(status: string) {
  const map: Record<string, { variant: 'success' | 'warning' | 'danger' | 'info'; label: string }> = {
    ok: { variant: 'success', label: 'In Stock' },
    low: { variant: 'warning', label: 'Low Stock' },
    out: { variant: 'danger', label: 'Out of Stock' },
    over: { variant: 'info', label: 'Overstock' },
    negative: { variant: 'danger', label: 'Negative' },
  };
  const config = map[status] ?? { variant: 'success' as const, label: status };
  return <Badge variant={config.variant} size="sm">{config.label}</Badge>;
}

export function InventoryPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<InventoryTab>('stock');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [stockFilter, setStockFilter] = useState<StockStatus>('all');
  const [sortBy, setSortBy] = useState('name');
  const [showModal, setShowModal] = useState(false);
  const [showReorder, setShowReorder] = useState(false);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);

  const { data: statsData } = useQuery({
    queryKey: ['inventory-stats'],
    queryFn: () => apiClient.stats.inventory(),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'inventory'],
    queryFn: () => apiClient.products.list({ limit: 2000 }),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.categories.list({ limit: 500 }),
  });

  const { data: adjustmentsData, isLoading: loadingAdjustments } = useQuery({
    queryKey: ['inventory-adjustments'],
    queryFn: () => apiClient.inventory.adjustments.list({ limit: 500 }),
  });

  const { data: movementsData, isLoading: loadingMovements } = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: () => apiClient.inventory.stockMovements({ limit: 500 }),
  });

  const products = productsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const stats = statsData?.data;
  const adjustments = adjustmentsData?.data ?? [];
  const movements = movementsData?.data ?? [];

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<AdjustmentForm>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: { productId: '', newStock: 0, reason: 'Stock count', note: '' },
  });

  const selectedProductId = watch('productId');
  const selectedProduct = useMemo(
    () => products.find((product: any) => product.id === selectedProductId),
    [products, selectedProductId],
  );

  const categoryOptions = useMemo(
    () => [{ value: '', label: 'All Categories' }, ...categories.map((category: any) => ({ value: category.name, label: category.name }))],
    [categories],
  );

  const lastMovementByProduct = useMemo(() => {
    const map = new Map<string, any>();
    for (const movement of movements) {
      if (!map.has(movement.productId)) map.set(movement.productId, movement);
    }
    return map;
  }, [movements]);

  const stockRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const rows = products
      .filter((product: any) => product.trackInventory !== false)
      .filter((product: any) => {
        if (categoryFilter && product.categoryName !== categoryFilter) return false;
        if (stockFilter !== 'all' && productStatus(product) !== stockFilter) return false;
        if (!query) return true;
        return [product.name, product.itemCode, product.sku, product.barcode, product.categoryName]
          .filter(Boolean)
          .some((value: string) => String(value).toLowerCase().includes(query));
      });

    return [...rows].sort((a: any, b: any) => {
      switch (sortBy) {
        case 'stock_asc':
          return Number(a.stock || 0) - Number(b.stock || 0);
        case 'stock_desc':
          return Number(b.stock || 0) - Number(a.stock || 0);
        case 'value_desc':
          return Number(b.stock || 0) * Number(b.costPrice || 0) - Number(a.stock || 0) * Number(a.costPrice || 0);
        case 'sales_value_desc':
          return Number(b.stock || 0) * Number(b.sellingPrice || 0) - Number(a.stock || 0) * Number(a.sellingPrice || 0);
        default:
          return String(a.name || '').localeCompare(String(b.name || ''));
      }
    });
  }, [products, search, categoryFilter, stockFilter, sortBy]);

  const unitsInStock = products.reduce((sum: number, product: any) => sum + Number(product.stock || 0), 0);
  const overstockCount = products.filter((product: any) => productStatus(product) === 'over').length;
  const unitsValue = products.reduce((sum: number, product: any) => sum + Number(product.stock || 0) * Number(product.costPrice || 0), 0);
  const potentialSalesValue = products.reduce((sum: number, product: any) => sum + Number(product.stock || 0) * Number(product.sellingPrice || 0), 0);

  const reorderItems = useMemo(
    () =>
      products
        .filter((product: any) => product.trackInventory !== false)
        .filter((product: any) => {
          const status = productStatus(product);
          return status === 'low' || status === 'out' || status === 'negative';
        })
        .map((product: any) => {
          const stock = Number(product.stock || 0);
          const target = Number(product.maxStock || 0) > 0
            ? Number(product.maxStock)
            : Math.max(
                Number(product.minStock || 0) * 2,
                stock + Number(product.reorderQuantity || 0),
                stock + 1,
              );
          const suggested = Math.max(1, target - stock);
          return { ...product, suggested, estimatedCost: suggested * Number(product.costPrice || 0) };
        })
        .sort((a: any, b: any) => Number(a.stock || 0) - Number(b.stock || 0)),
    [products],
  );

  const reconciliation = useMemo(() => {
    const flagged = products
      .filter((product: any) => ['negative', 'out', 'low'].includes(productStatus(product)))
      .sort((a: any, b: any) => Number(a.stock || 0) - Number(b.stock || 0));
    return {
      negative: products.filter((product: any) => Number(product.stock || 0) < 0),
      out: products.filter((product: any) => Number(product.stock || 0) === 0),
      low: products.filter((product: any) => productStatus(product) === 'low'),
      flagged,
    };
  }, [products]);

  const filteredAdjustments = adjustments.filter((item: any) =>
    !search ||
    String(item.itemName || '').toLowerCase().includes(search.toLowerCase()) ||
    String(item.itemCode || '').toLowerCase().includes(search.toLowerCase()) ||
    String(item.reason || '').toLowerCase().includes(search.toLowerCase()),
  );

  const filteredMovements = movements.filter((item: any) =>
    !search ||
    String(item.productName || '').toLowerCase().includes(search.toLowerCase()) ||
    String(item.itemCode || '').toLowerCase().includes(search.toLowerCase()) ||
    String(item.reason || '').toLowerCase().includes(search.toLowerCase()),
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['inventory-adjustments'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: AdjustmentForm) =>
      apiClient.inventory.adjustments.create({
        productId: values.productId,
        newStock: values.newStock,
        reason: values.note ? `${values.reason} - ${values.note}` : values.reason,
      }),
    onSuccess: () => {
      success('Stock adjusted', 'Inventory has been updated');
      closeModal();
      invalidate();
    },
    onError: (err: any) => error('Adjustment failed', err.message),
  });

  const openModal = (product?: any) => {
    setEditingProduct(product ?? null);
    reset({
      productId: product?.id ?? '',
      newStock: Number(product?.stock ?? 0),
      reason: 'Stock count',
      note: '',
    });
    setShowModal(true);
  };

  const closeModal = () => { setShowModal(false); setEditingProduct(null); };

  const exportCsv = () => {
    if (tab === 'stock') {
      downloadCsv(
        `stock-on-hand-${new Date().toISOString().slice(0, 10)}`,
        stockRows.map((product: any) => ({
          ItemCode: product.itemCode,
          Barcode: product.barcode,
          Name: product.name,
          Category: product.categoryName,
          Unit: product.unit,
          Stock: product.stock,
          MinStock: product.minStock,
          ReorderLevel: product.reorderLevel,
          MaxStock: product.maxStock,
          Cost: product.costPrice,
          Price: product.sellingPrice,
          StockValue: Number(product.stock || 0) * Number(product.costPrice || 0),
          RetailValue: Number(product.stock || 0) * Number(product.sellingPrice || 0),
          Status: productStatus(product),
        })),
      );
    } else if (tab === 'movements') {
      downloadCsv(
        `stock-movements-${new Date().toISOString().slice(0, 10)}`,
        filteredMovements.map((item: any) => ({
          Date: item.createdAt,
          Product: item.productName,
          Code: item.itemCode,
          Type: item.type,
          Quantity: item.quantity,
          PreviousStock: item.previousStock,
          NewStock: item.newStock,
          Reason: item.reason,
        })),
      );
    } else {
      downloadCsv(
        `inventory-adjustments-${new Date().toISOString().slice(0, 10)}`,
        filteredAdjustments.map((item: any) => ({
          Date: item.createdAt,
          Product: item.itemName,
          Code: item.itemCode,
          Type: item.type,
          Change: item.changeQty,
          PreviousStock: item.previousStock,
          NewStock: item.newStock,
          Reason: item.reason,
          Approved: item.isApproved ? 'Yes' : 'No',
        })),
      );
    }
    success('Export ready', 'Inventory CSV downloaded');
  };

  const exportReorder = () => {
    downloadCsv(
      `reorder-list-${new Date().toISOString().slice(0, 10)}`,
      reorderItems.map((product: any) => ({
        ItemCode: product.itemCode,
        Name: product.name,
        Category: product.categoryName,
        Stock: product.stock,
        MinStock: product.minStock,
        MaxStock: product.maxStock,
        SuggestedOrder: product.suggested,
        UnitCost: product.costPrice,
        EstimatedCost: product.estimatedCost,
      })),
    );
    success('Export ready', 'Reorder list downloaded');
  };

  const stockColumns: Column<any>[] = [
    {
      key: 'itemCode',
      header: 'Product',
      accessor: 'itemCode',
      render: (_value, row) => (
        <div>
          <p className="font-medium text-secondary-900 dark:text-white">{row.name}</p>
          <p className="text-xs text-secondary-500 font-mono">{row.itemCode}{row.barcode ? ` · ${row.barcode}` : ''}</p>
        </div>
      ),
    },
    { key: 'categoryName', header: 'Category', accessor: 'categoryName', width: '120px', render: (value) => value || '-' },
    { key: 'unit', header: 'Unit', accessor: 'unit', width: '70px' },
    {
      key: 'stock',
      header: 'Qty',
      accessor: 'stock',
      align: 'right',
      width: '80px',
      render: (value) => <span className={cn('font-semibold', Number(value) <= 0 ? 'text-red-600' : '')}>{formatNumber(value)}</span>,
    },
    {
      key: 'levels',
      header: 'Min / Reorder / Max',
      accessor: 'minStock',
      align: 'center',
      width: '140px',
      render: (_value, row) => `${formatNumber(row.minStock || 0)} / ${formatNumber(row.reorderLevel || 0)} / ${formatNumber(row.maxStock || 0)}`,
    },
    { key: 'costPrice', header: 'Cost', accessor: 'costPrice', align: 'right', width: '90px', render: (value) => formatCurrency(value) },
    { key: 'sellingPrice', header: 'Price', accessor: 'sellingPrice', align: 'right', width: '90px', render: (value) => formatCurrency(value) },
    {
      key: 'stockValue',
      header: 'Stock Value',
      accessor: 'stockValue',
      align: 'right',
      width: '110px',
      render: (_value, row) => formatCurrency(Number(row.stock || 0) * Number(row.costPrice || 0)),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: 'status',
      align: 'center',
      width: '110px',
      render: (_value, row) => statusBadge(productStatus(row)),
    },
    {
      key: 'lastMovement',
      header: 'Last Movement',
      accessor: 'id',
      width: '130px',
      render: (_value, row) => {
        const movement = lastMovementByProduct.get(row.id);
        return movement ? formatDateTime(movement.createdAt) : '-';
      },
    },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      align: 'center',
      width: '80px',
      render: (_value, row) => (
        <Button size="sm" variant="outline" onClick={() => openModal(row)}>Adjust</Button>
      ),
    },
  ];

  const adjustmentColumns: Column<any>[] = [
    { key: 'createdAt', header: 'Date', accessor: 'createdAt', width: '160px', render: (value) => formatDateTime(value) },
    {
      key: 'itemName',
      header: 'Product',
      accessor: 'itemName',
      render: (value, row) => (
        <div>
          <p className="font-medium text-secondary-900 dark:text-white">{value}</p>
          <p className="text-xs text-secondary-500 font-mono">{row.itemCode}</p>
        </div>
      ),
    },
    {
      key: 'changeQty',
      header: 'Change',
      accessor: 'changeQty',
      align: 'right',
      width: '100px',
      render: (value) => (
        <span className={cn('font-semibold', Number(value) >= 0 ? 'text-green-600' : 'text-red-600')}>
          {Number(value) > 0 ? '+' : ''}{formatNumber(value)}
        </span>
      ),
    },
    { key: 'previousStock', header: 'Previous', accessor: 'previousStock', align: 'right', width: '90px', render: (value) => formatNumber(value) },
    { key: 'newStock', header: 'New', accessor: 'newStock', align: 'right', width: '90px', render: (value) => formatNumber(value) },
    { key: 'reason', header: 'Reason', accessor: 'reason', render: (value) => value || '-' },
    {
      key: 'status',
      header: 'Approved',
      accessor: 'isApproved',
      align: 'center',
      width: '100px',
      render: (value) => <Badge variant={value === false ? 'warning' : 'success'} size="sm">{value === false ? 'Pending' : 'Yes'}</Badge>,
    },
  ];

  const movementColumns: Column<any>[] = [
    { key: 'createdAt', header: 'Date', accessor: 'createdAt', width: '160px', render: (value) => formatDateTime(value) },
    {
      key: 'productName',
      header: 'Product',
      accessor: 'productName',
      render: (value, row) => (
        <div>
          <p className="font-medium text-secondary-900 dark:text-white">{value}</p>
          <p className="text-xs text-secondary-500 font-mono">{row.itemCode}</p>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      accessor: 'type',
      width: '140px',
      render: (value) => <Badge variant={String(value).includes('in') || ['sale_return', 'purchase'].includes(String(value)) ? 'success' : 'danger'} size="sm">{String(value).replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'quantity',
      header: 'Qty',
      accessor: 'quantity',
      align: 'right',
      width: '80px',
      render: (value) => (
        <span className={cn('font-semibold', Number(value) >= 0 ? 'text-green-600' : 'text-red-600')}>
          {Number(value) > 0 ? '+' : ''}{formatNumber(value)}
        </span>
      ),
    },
    { key: 'previousStock', header: 'Previous', accessor: 'previousStock', align: 'right', width: '90px', render: (value) => formatNumber(value) },
    { key: 'newStock', header: 'New', accessor: 'newStock', align: 'right', width: '90px', render: (value) => formatNumber(value) },
    { key: 'reason', header: 'Reference', accessor: 'reason', render: (value) => value || '-' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Inventory & Stock</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Stock on hand, valuation, reorder levels and audited movements</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShowReorder(true)}><ClipboardList className="h-4 w-4 mr-2" />Reorder</Button>
          <Button variant="outline" onClick={() => setShowReconciliation(true)}><ScanLine className="h-4 w-4 mr-2" />Reconcile</Button>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={() => openModal()}><Plus className="h-4 w-4 mr-2" />Adjustment</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <InventoryStat title="Active Products" value={formatNumber(stats?.activeProducts ?? products.length)} icon={Package} color="bg-blue-500" />
        <InventoryStat title="Units in Stock" value={formatNumber(unitsInStock)} icon={Boxes} color="bg-emerald-500" />
        <InventoryStat title="Inventory Value" value={formatCurrency(unitsValue)} icon={TrendingUp} color="bg-amber-500" />
        <InventoryStat title="Potential Sales" value={formatCurrency(potentialSalesValue)} icon={TrendingUp} color="bg-indigo-500" />
        <InventoryStat title="Low Stock" value={formatNumber(stats?.lowStockProducts ?? 0)} icon={AlertTriangle} color="bg-amber-500" />
        <InventoryStat title="Out of Stock" value={formatNumber(stats?.outOfStockProducts ?? reconciliation.out.length)} icon={AlertTriangle} color="bg-red-500" />
        <InventoryStat title="Overstock" value={formatNumber(overstockCount)} icon={Boxes} color="bg-indigo-500" />
        <InventoryStat title="Adjustments" value={formatNumber(adjustments.length)} icon={RotateCcw} color="bg-violet-500" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col xl:flex-row xl:items-center gap-3">
          <div className="flex rounded-lg border border-secondary-200 dark:border-secondary-700 overflow-hidden">
            <button
              onClick={() => setTab('stock')}
              className={cn('px-4 py-2 text-sm font-medium flex items-center gap-2', tab === 'stock' ? 'bg-primary-600 text-white' : 'text-secondary-600 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-800')}
            >
              <Boxes className="h-4 w-4" />Stock On Hand
            </button>
            <button
              onClick={() => setTab('adjustments')}
              className={cn('px-4 py-2 text-sm font-medium flex items-center gap-2', tab === 'adjustments' ? 'bg-primary-600 text-white' : 'text-secondary-600 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-800')}
            >
              <ClipboardList className="h-4 w-4" />Adjustments
            </button>
            <button
              onClick={() => setTab('movements')}
              className={cn('px-4 py-2 text-sm font-medium flex items-center gap-2', tab === 'movements' ? 'bg-primary-600 text-white' : 'text-secondary-600 dark:text-secondary-400 hover:bg-secondary-50 dark:hover:bg-secondary-800')}
            >
              <History className="h-4 w-4" />Movements
            </button>
          </div>

          <div className="flex flex-1 flex-wrap gap-2">
            <Input placeholder="Search product, code or barcode..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="flex-1 min-w-[220px]" />
            {tab === 'stock' && (
              <>
                <Select options={categoryOptions} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-44" />
                <Select
                  options={[
                    { value: 'all', label: 'All Statuses' },
                    { value: 'ok', label: 'In Stock' },
                    { value: 'low', label: 'Low Stock' },
                    { value: 'out', label: 'Out of Stock' },
                    { value: 'over', label: 'Overstock' },
                    { value: 'negative', label: 'Negative Stock' },
                  ]}
                  value={stockFilter}
                  onChange={(e) => setStockFilter(e.target.value as StockStatus)}
                  className="w-40"
                />
                <Select
                  options={[
                    { value: 'name', label: 'Name A-Z' },
                    { value: 'stock_asc', label: 'Stock Low-High' },
                    { value: 'stock_desc', label: 'Stock High-Low' },
                    { value: 'value_desc', label: 'Stock Value' },
                    { value: 'sales_value_desc', label: 'Potential Sales' },
                  ]}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-44"
                />
              </>
            )}
          </div>
        </div>
      </Card>

      <Card>
        {tab === 'stock' && (
          <Table columns={stockColumns} data={stockRows} keyAccessor="id" emptyMessage="No products match the current filters." striped hoverable />
        )}
        {tab === 'adjustments' && (
          <Table columns={adjustmentColumns} data={filteredAdjustments} keyAccessor="id" loading={loadingAdjustments} emptyMessage="No stock adjustments yet." striped hoverable />
        )}
        {tab === 'movements' && (
          <Table columns={movementColumns} data={filteredMovements} keyAccessor="id" loading={loadingMovements} emptyMessage="No stock movements yet." striped hoverable />
        )}
      </Card>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Low Stock Products</h2>
          <Badge variant={stats?.lowStockProducts ? 'warning' : 'success'}>{stats?.lowStockProducts || 0} items</Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {(stats?.lowStockItems ?? []).slice(0, 12).map((product: any) => (
            <div key={product.id} className="flex items-center justify-between p-3 rounded-lg border border-secondary-200 dark:border-secondary-700">
              <div className="min-w-0">
                <p className="font-medium text-secondary-900 dark:text-white truncate">{product.name}</p>
                <p className="text-xs text-secondary-500">{product.itemCode} · Min {formatNumber(product.minStock)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('text-sm font-semibold', Number(product.stock) <= 0 ? 'text-red-600' : 'text-amber-600')}>{formatNumber(product.stock)}</span>
                <Button size="sm" variant="outline" onClick={() => openModal(product)}>Restock</Button>
              </div>
            </div>
          ))}
          {!stats?.lowStockItems?.length && <p className="text-secondary-500 col-span-full text-center py-6">All products are above their minimum stock level.</p>}
        </div>
      </Card>

      <Modal isOpen={showModal} onClose={closeModal} title="Stock Adjustment" size="md">
        <form onSubmit={handleSubmit((values) => createMutation.mutate(values))} className="space-y-4">
          <Select
            label="Product"
            options={[{ value: '', label: 'Select a product' }, ...products.map((product: any) => ({ value: product.id, label: `${product.name} (${product.itemCode})` }))]}
            error={errors.productId?.message}
            {...register('productId')}
            onChange={(e) => {
              const product = products.find((candidate: any) => candidate.id === e.target.value);
              setValue('productId', e.target.value);
              setValue('newStock', Number(product?.stock ?? 0));
            }}
          />
          {selectedProduct && (
            <div className="grid grid-cols-3 gap-3 p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg text-sm">
              <div><p className="text-secondary-500">Current</p><p className="font-semibold text-secondary-900 dark:text-white">{formatNumber(selectedProduct.stock)}</p></div>
              <div><p className="text-secondary-500">Min</p><p className="font-semibold text-secondary-900 dark:text-white">{formatNumber(selectedProduct.minStock)}</p></div>
              <div><p className="text-secondary-500">Unit</p><p className="font-semibold text-secondary-900 dark:text-white capitalize">{selectedProduct.unit}</p></div>
            </div>
          )}
          <Input label="New Stock Level" type="number" min="0" step="1" error={errors.newStock?.message} {...register('newStock')} />
          <div>
            <Input label="Reason" error={errors.reason?.message} {...register('reason')} placeholder="Stock count, damaged, received..." />
            <div className="flex flex-wrap gap-2 mt-2">
              {['Stock count', 'Damaged goods', 'Expired', 'Customer return', 'Stock take correction'].map((reason) => (
                <button key={reason} type="button" onClick={() => setValue('reason', reason)} className="px-2 py-1 text-xs rounded-full border border-secondary-200 dark:border-secondary-600 text-secondary-600 dark:text-secondary-400 hover:bg-secondary-100 dark:hover:bg-secondary-700">{reason}</button>
              ))}
            </div>
          </div>
          <Textarea label="Note (optional)" {...register('note')} rows={2} placeholder="Additional details" />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}><ArrowUpDown className="h-4 w-4 mr-2" />Apply Adjustment</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showReorder} onClose={() => setShowReorder(false)} title="Suggested Reorder List" size="xl" footer={
        <div className="flex w-full justify-between items-center">
          <p className="text-sm text-secondary-500">{reorderItems.length} items · Est. {formatCurrency(reorderItems.reduce((sum: number, item: any) => sum + item.estimatedCost, 0))}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportReorder}><Download className="h-4 w-4 mr-2" />Export</Button>
            <Button onClick={() => setShowReorder(false)}>Close</Button>
          </div>
        </div>
      }>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-secondary-200 dark:border-secondary-700 text-left text-secondary-500">
                <th className="py-2">Product</th>
                <th className="py-2 text-right">Stock</th>
                <th className="py-2 text-right">Min</th>
                <th className="py-2 text-right">Max</th>
                <th className="py-2 text-right">Suggested</th>
                <th className="py-2 text-right">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {reorderItems.map((product: any) => (
                <tr key={product.id} className="border-b border-secondary-100 dark:border-secondary-800">
                  <td className="py-2">
                    <p className="font-medium text-secondary-900 dark:text-white">{product.name}</p>
                    <p className="text-xs text-secondary-500 font-mono">{product.itemCode}</p>
                  </td>
                  <td className="py-2 text-right">{formatNumber(product.stock)}</td>
                  <td className="py-2 text-right">{formatNumber(product.minStock || 0)}</td>
                  <td className="py-2 text-right">{formatNumber(product.maxStock || 0)}</td>
                  <td className="py-2 text-right font-semibold text-primary-600">{formatNumber(product.suggested)}</td>
                  <td className="py-2 text-right">{formatCurrency(product.estimatedCost)}</td>
                </tr>
              ))}
              {!reorderItems.length && (
                <tr><td colSpan={6} className="py-8 text-center text-secondary-500">No products need reordering.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal isOpen={showReconciliation} onClose={() => setShowReconciliation(false)} title="Stock Reconciliation" size="lg" footer={<Button onClick={() => setShowReconciliation(false)}>Close</Button>}>
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20"><p className="text-xs text-red-600">Out of Stock</p><p className="text-2xl font-bold text-red-700 dark:text-red-400">{reconciliation.out.length}</p></div>
          <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20"><p className="text-xs text-amber-600">Low Stock</p><p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{reconciliation.low.length}</p></div>
          <div className="p-3 rounded-lg bg-red-100 dark:bg-red-900/30"><p className="text-xs text-red-700">Negative Stock</p><p className="text-2xl font-bold text-red-800 dark:text-red-300">{reconciliation.negative.length}</p></div>
        </div>
        <p className="text-sm text-secondary-500 mb-3">Products requiring physical verification and replenishment.</p>
        <div className="max-h-72 overflow-y-auto divide-y divide-secondary-100 dark:divide-secondary-800">
          {reconciliation.flagged.map((product: any) => (
            <div key={product.id} className="flex items-center justify-between py-2">
              <div>
                <p className="font-medium text-secondary-900 dark:text-white">{product.name}</p>
                <p className="text-xs text-secondary-500 font-mono">{product.itemCode}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold">{formatNumber(product.stock)}</span>
                {statusBadge(productStatus(product))}
              </div>
            </div>
          ))}
          {!reconciliation.flagged.length && <p className="py-6 text-center text-secondary-500">All stock levels look healthy.</p>}
        </div>
      </Modal>
    </div>
  );
}

function InventoryStat({ title, value, icon: Icon, color }: { title: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm text-secondary-500 dark:text-secondary-400">{title}</p>
          <p className="text-xl font-bold text-secondary-900 dark:text-white">{value}</p>
        </div>
      </div>
    </Card>
  );
}
