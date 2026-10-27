import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Barcode,
  Loader2,
  Package,
  Download,
  AlertTriangle,
} from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const productSchema = z.object({
  itemCode: z.string().min(1, 'Item code is required'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  categoryId: z.string().optional(),
  costPrice: z.coerce.number().nonnegative('Cost price must be positive'),
  sellingPrice: z.coerce.number().positive('Selling price must be positive'),
  wholesalePrice: z.coerce.number().nonnegative().optional(),
  taxRate: z.coerce.number().nonnegative().default(0),
  taxInclusive: z.boolean().default(false),
  stock: z.coerce.number().default(0),
  minStock: z.coerce.number().nonnegative().default(0),
  maxStock: z.coerce.number().nonnegative().default(0),
  reorderLevel: z.coerce.number().nonnegative().default(0),
  reorderQuantity: z.coerce.number().nonnegative().default(0),
  supplierId: z.string().optional(),
  unit: z.enum(['pcs', 'kg', 'g', 'l', 'ml', 'm', 'cm', 'box', 'pack', 'dozen']).default('pcs'),
  isActive: z.boolean().default(true),
  trackInventory: z.boolean().default(true),
});

type ProductForm = z.infer<typeof productSchema>;

const unitOptions = [
  { value: 'pcs', label: 'Pieces' },
  { value: 'kg', label: 'Kilograms' },
  { value: 'g', label: 'Grams' },
  { value: 'l', label: 'Liters' },
  { value: 'ml', label: 'Milliliters' },
  { value: 'm', label: 'Meters' },
  { value: 'cm', label: 'Centimeters' },
  { value: 'box', label: 'Box' },
  { value: 'pack', label: 'Pack' },
  { value: 'dozen', label: 'Dozen' },
];

const defaultValues: ProductForm = {
  itemCode: '',
  name: '',
  costPrice: 0,
  sellingPrice: 0,
  stock: 0,
  minStock: 0,
  maxStock: 0,
  reorderLevel: 0,
  reorderQuantity: 0,
  unit: 'pcs',
  taxRate: 0,
  taxInclusive: false,
  isActive: true,
  trackInventory: true,
};

export function ProductsPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<any | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<any | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const { data: productsData, isLoading, refetch } = useQuery({
    queryKey: ['products', searchQuery, selectedCategory, selectedStatus, lowStockOnly],
    queryFn: () => apiClient.products.list({
      search: searchQuery || undefined,
      categoryId: selectedCategory || undefined,
      status: selectedStatus || undefined,
      lowStock: lowStockOnly || undefined,
      limit: 500,
    }),
  });

  const { data: categoriesData } = useQuery({
    queryKey: ['categories'],
    queryFn: () => apiClient.categories.list({ limit: 500 }),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.suppliers.list({ limit: 500 }),
  });

  const { data: allProductsData } = useQuery({
    queryKey: ['products', 'all-kpis'],
    queryFn: () => apiClient.products.list({ limit: 2000 }),
  });

  const products = productsData?.data ?? [];
  const allProducts = allProductsData?.data ?? [];
  const categories = categoriesData?.data ?? [];
  const suppliers = suppliersData?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-adjustments'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: ProductForm) => apiClient.products.create(data),
    onSuccess: () => { success('Product created', 'Product has been created successfully'); setShowModal(false); invalidate(); },
    onError: (err: any) => error('Failed to create', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProductForm> }) => apiClient.products.update(id, data),
    onSuccess: () => { success('Product updated'); setShowModal(false); setEditingProduct(null); invalidate(); },
    onError: (err: any) => error('Failed to update', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.products.delete(id),
    onSuccess: () => { success('Product deleted'); setDeletingProduct(null); invalidate(); },
    onError: (err: any) => error('Failed to delete', err.message),
  });

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues,
  });

  const generateBarcode = () => {
    const code = `BC${Date.now().toString().slice(-10)}`;
    setValue('barcode', code);
    if (!editingProduct) setValue('itemCode', `PRD-${code.slice(-5)}`);
  };

  const submitForm = (data: ProductForm) => {
    setIsSaving(true);
    if (editingProduct) {
      updateMutation.mutate({ id: editingProduct.id, data }, { onSettled: () => setIsSaving(false) });
    } else {
      createMutation.mutate(data, { onSettled: () => setIsSaving(false) });
    }
  };

  const openCreate = () => {
    setEditingProduct(null);
    reset(defaultValues);
    setShowModal(true);
  };

  const openEdit = (product: any) => {
    setEditingProduct(product);
    reset({
      itemCode: product.itemCode ?? '',
      sku: product.sku ?? '',
      barcode: product.barcode ?? '',
      name: product.name ?? '',
      description: product.description ?? '',
      categoryId: product.categoryId ?? '',
      costPrice: Number(product.costPrice || 0),
      sellingPrice: Number(product.sellingPrice || 0),
      wholesalePrice: Number(product.wholesalePrice || 0),
      taxRate: Number(product.taxRate || 0),
      taxInclusive: Boolean(product.taxInclusive),
      stock: Number(product.stock || 0),
      minStock: Number(product.minStock || 0),
      maxStock: Number(product.maxStock || 0),
      reorderLevel: Number(product.reorderLevel || 0),
      reorderQuantity: Number(product.reorderQuantity || 0),
      supplierId: product.supplierId ?? '',
      unit: product.unit ?? 'pcs',
      isActive: product.isActive !== false,
      trackInventory: product.trackInventory !== false,
    });
    setShowModal(true);
  };

  const exportCsv = () => {
    downloadCsv(
      `products-${new Date().toISOString().slice(0, 10)}`,
      products.map((product: any) => ({
        ItemCode: product.itemCode,
        Barcode: product.barcode,
        Name: product.name,
        Category: product.categoryName,
        Cost: product.costPrice,
        Price: product.sellingPrice,
        Stock: product.stock,
        MinStock: product.minStock,
        MaxStock: product.maxStock,
        ReorderLevel: product.reorderLevel,
        ReorderQuantity: product.reorderQuantity,
        Unit: product.unit,
        Status: product.status,
      })),
    );
    success('Export ready', 'Products CSV downloaded');
  };

  const columns: Column<any>[] = [
    { key: 'itemCode', header: 'Code', accessor: 'itemCode', width: '110px' },
    { key: 'name', header: 'Name', accessor: 'name' },
    { key: 'categoryName', header: 'Category', accessor: 'categoryName', width: '130px', render: (v) => v || '-' },
    {
      key: 'stock',
      header: 'Stock',
      accessor: 'stock',
      width: '100px',
      align: 'center',
      render: (v, row) => (
        <span className={cn('inline-flex items-center gap-1', Number(v) <= 0 ? 'text-red-600 font-medium' : Number(v) <= Number(row.minStock || 0) ? 'text-amber-600' : '')}>
          {Number(v) <= Number(row.minStock || 0) && <AlertTriangle className="h-3.5 w-3.5" />}
          {formatNumber(v)}
        </span>
      ),
    },
    { key: 'sellingPrice', header: 'Price', accessor: 'sellingPrice', width: '110px', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'costPrice', header: 'Cost', accessor: 'costPrice', width: '100px', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'status', header: 'Status', accessor: 'status', width: '100px', align: 'center', render: (v, row) => <Badge variant={row.isActive === false ? 'default' : 'success'} size="sm">{v}</Badge> },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      width: '90px',
      align: 'center',
      render: (_v, row) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700" aria-label="Edit"><Edit className="h-4 w-4" /></button>
          <button onClick={() => setDeletingProduct(row)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  const lowStockCount = allProducts.filter(
    (product: any) => Number(product.stock || 0) <= Number(product.minStock || 0),
  ).length;
  const inventoryValue = allProducts.reduce(
    (sum: number, product: any) => sum + Number(product.stock || 0) * Number(product.costPrice || 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Products</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Manage your product catalog and pricing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Product</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <Input placeholder="Search by name, code or barcode..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="flex-1 max-w-md" />
          <Select
            options={[{ value: '', label: 'All Categories' }, ...categories.map((category: any) => ({ value: category.id, label: category.name }))]}
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-48"
          />
          <Select
            options={[
              { value: '', label: 'All Status' },
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Inactive' },
              { value: 'discontinued', label: 'Discontinued' },
            ]}
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="w-40"
          />
          <label className="flex items-center gap-2 text-sm text-secondary-700 dark:text-secondary-300">
            <input type="checkbox" checked={lowStockOnly} onChange={(e) => setLowStockOnly(e.target.checked)} className="h-4 w-4 rounded border-secondary-300 text-primary-600" />
            Low stock only
          </label>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Products" value={allProducts.length} icon={Package} color="bg-blue-500" />
        <StatCard title="Low Stock" value={lowStockCount} icon={AlertTriangle} color="bg-amber-500" />
        <StatCard title="Stock Value" value={formatCurrency(inventoryValue)} icon={Package} color="bg-green-500" />
        <StatCard title="Categories" value={categories.length} icon={Package} color="bg-purple-500" />
      </div>

      <Card>
        <Table columns={columns} data={products} keyAccessor="id" loading={isLoading} emptyMessage="No products found. Click 'Add Product' to create your first product." striped hoverable />
      </Card>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingProduct(null); }}
        title={editingProduct ? 'Edit Product' : 'Add Product'}
        size="full"
      >
        <form onSubmit={handleSubmit(submitForm)} className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Item Code" error={errors.itemCode?.message} {...register('itemCode')} placeholder="PRD-001" />
            <Input label="SKU" {...register('sku')} placeholder="Internal SKU" />
            <div>
              <Input label="Barcode" {...register('barcode')} placeholder="Scan or enter barcode" />
              <button type="button" onClick={generateBarcode} className="mt-1 inline-flex items-center gap-1 text-xs text-primary-600 hover:underline">
                <Barcode className="h-3.5 w-3.5" />Generate barcode
              </button>
            </div>
            <Input label="Name" error={errors.name?.message} {...register('name')} placeholder="Product name" className="md:col-span-2" />
            <Select label="Category" options={[{ value: '', label: 'Uncategorized' }, ...categories.map((category: any) => ({ value: category.id, label: category.name }))]} {...register('categoryId')} />
            <Select label="Supplier" options={[{ value: '', label: 'No supplier' }, ...suppliers.map((supplier: any) => ({ value: supplier.id, label: supplier.name }))]} {...register('supplierId')} />
            <Select label="Unit" options={unitOptions} {...register('unit')} />
            <Textarea label="Description" {...register('description')} placeholder="Product description" className="md:col-span-2" rows={2} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Input label="Cost Price" type="number" step="0.01" min="0" error={errors.costPrice?.message} {...register('costPrice')} />
            <Input label="Selling Price" type="number" step="0.01" min="0.01" error={errors.sellingPrice?.message} {...register('sellingPrice')} />
            <Input label="Wholesale Price" type="number" step="0.01" min="0" {...register('wholesalePrice')} />
            <Input label="Tax Rate %" type="number" step="0.01" min="0" {...register('taxRate')} />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Input label="Stock" type="number" step="1" {...register('stock')} />
            <Input label="Min Stock" type="number" step="1" min="0" {...register('minStock')} />
            <Input label="Max Stock" type="number" step="1" min="0" {...register('maxStock')} />
            <Input label="Reorder Level" type="number" step="1" min="0" {...register('reorderLevel')} />
            <Input label="Reorder Qty" type="number" step="1" min="0" {...register('reorderQuantity')} />
          </div>

          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-secondary-300 text-primary-600" {...register('taxInclusive')} />
              Tax inclusive price
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 rounded border-secondary-300 text-primary-600" {...register('trackInventory')} />
              Track inventory
            </label>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-secondary-300 text-primary-600" {...register('isActive')} />
            <span className="text-sm text-secondary-700 dark:text-secondary-300">Active (available for sale)</span>
          </label>

          <div className="flex justify-end gap-2 pt-4 border-t border-secondary-200 dark:border-secondary-700">
            <Button type="button" variant="outline" onClick={() => { setShowModal(false); setEditingProduct(null); }}>Cancel</Button>
            <Button type="submit" loading={isSaving || createMutation.isPending || updateMutation.isPending}>
              {editingProduct ? 'Update' : 'Create'} Product
            </Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deletingProduct} onClose={() => setDeletingProduct(null)} title="Delete Product" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">
          Are you sure you want to delete <strong>{deletingProduct?.name}</strong>? This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDeletingProduct(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deletingProduct && deleteMutation.mutate(deletingProduct.id)} loading={deleteMutation.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-secondary-500 dark:text-secondary-400">{title}</p>
          <p className="text-2xl font-bold text-secondary-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </Card>
  );
}
