import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Table, Column, Pagination } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCurrency, formatDateTime, cn } from '../utils/helpers';
import { printPurchaseOrder } from '../utils/print';
import {
  Plus,
  Search,
  Eye,
  Printer,
  ShoppingBag,
  ArrowUpRight,
  PackageCheck,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { useToast } from '../components/ui/Toaster';

interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;
  unitCost: number;
  receivedQuantity?: number;
}

interface PurchaseForm {
  supplierId: string;
  poNumber: string;
  status: string;
  note: string;
  items: PurchaseItem[];
}

const emptyForm: PurchaseForm = {
  supplierId: '',
  poNumber: '',
  status: 'Ordered',
  note: '',
  items: [],
};

const statusVariant = (status: string) =>
  status === 'Received' ? 'success' : status === 'Ordered' ? 'info' : status === 'Partial' ? 'warning' : 'danger';

export function PurchasesPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PurchaseForm>(emptyForm);
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const params = {
    search: searchQuery || undefined,
    status: selectedStatus || undefined,
    page: currentPage,
    limit: pageSize,
    sortBy: 'createdAt',
    sortOrder: 'desc' as const,
  };

  const { data: purchasesData, isLoading } = useQuery({
    queryKey: ['purchases', params],
    queryFn: () => apiClient.purchases.list(params),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => apiClient.suppliers.list({ limit: 500 }),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products'],
    queryFn: () => apiClient.products.list({ limit: 500 }),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.settings.get(),
  });

  const purchases = purchasesData?.data ?? [];
  const pagination = purchasesData?.pagination;
  const suppliers = suppliersData?.data ?? [];
  const products = productsData?.data ?? [];
  const settings = settingsData?.data ?? {};

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
    queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-adjustments'] });
  };

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editingId ? apiClient.purchases.update(editingId, data) : apiClient.purchases.create(data),
    onSuccess: () => {
      success(editingId ? 'Purchase updated' : 'Purchase order created');
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err: any) => error('Could not save purchase', err.message),
  });

  const receiveMutation = useMutation({
    mutationFn: (id: string) => apiClient.purchases.receive(id, {}),
    onSuccess: async () => {
      success('Stock received', 'Product stock has been updated');
      setShowDetail(false);
      setSelectedPurchase(null);
      invalidate();
    },
    onError: (err: any) => error('Could not receive purchase', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.purchases.delete(id),
    onSuccess: () => {
      success('Purchase deleted');
      setDeletingId(null);
      invalidate();
    },
    onError: (err: any) => error('Could not delete purchase', err.message),
  });

  const formTotals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
    return { subtotal, total: subtotal };
  }, [form.items]);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEdit = (purchase: any) => {
    setEditingId(purchase.id);
    setForm({
      supplierId: purchase.supplierId || '',
      poNumber: purchase.poNumber || '',
      status: purchase.status || 'Ordered',
      note: purchase.note || '',
      items: (purchase.items ?? []).map((item: any) => ({
        productId: item.productId,
        name: item.name,
        quantity: Number(item.quantity || 0),
        unitCost: Number(item.unitCost || 0),
        receivedQuantity: Number(item.receivedQuantity || 0),
      })),
    });
    setShowDetail(false);
    setShowForm(true);
  };

  const addItem = (productId: string) => {
    const product = products.find((candidate: any) => candidate.id === productId);
    if (!product) return;
    setForm((prev) => {
      if (prev.items.some((item) => item.productId === productId)) return prev;
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            productId,
            name: product.name,
            quantity: 1,
            unitCost: Number(product.costPrice || 0),
          },
        ],
      };
    });
  };

  const updateItem = (productId: string, changes: Partial<PurchaseItem>) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.productId === productId ? { ...item, ...changes } : item)),
    }));
  };

  const removeItem = (productId: string) => {
    setForm((prev) => ({ ...prev, items: prev.items.filter((item) => item.productId !== productId) }));
  };

  const submitForm = () => {
    if (form.items.length === 0) {
      error('No items', 'Add at least one product to the purchase order');
      return;
    }
    const supplier = suppliers.find((candidate: any) => candidate.id === form.supplierId);
    saveMutation.mutate({
      ...form,
      supplierName: supplier?.name,
      items: form.items.map((item) => ({ ...item, taxRate: 0 })),
    });
  };

  const columns: Column<any>[] = [
    { key: 'poNumber', header: 'PO Number', accessor: 'poNumber', width: '140px' },
    { key: 'createdAt', header: 'Date', accessor: 'createdAt', width: '140px', render: (v) => formatDateTime(v) },
    { key: 'supplierName', header: 'Supplier', accessor: 'supplierName', width: '180px' },
    { key: 'itemCount', header: 'Items', accessor: 'itemCount', width: '70px', align: 'center' },
    { key: 'grandTotal', header: 'Total', accessor: 'grandTotal', width: '120px', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'status', header: 'Status', accessor: 'status', width: '110px', align: 'center', render: (v) => <Badge variant={statusVariant(v)} size="sm">{v}</Badge> },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      width: '150px',
      align: 'center',
      render: (_v, row) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => { setSelectedPurchase(row); setShowDetail(true); }} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700" aria-label="View"><Eye className="h-4 w-4" /></button>
          {row.status !== 'Received' && row.status !== 'Cancelled' && (
            <button onClick={() => receiveMutation.mutate(row.id)} className="p-2 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20" aria-label="Receive"><PackageCheck className="h-4 w-4" /></button>
          )}
          <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700" aria-label="Edit"><Pencil className="h-4 w-4" /></button>
          <button onClick={() => setDeletingId(row.id)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Purchases</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Create purchase orders and receive stock</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Create PO</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input placeholder="Search PO number or supplier..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="flex-1 max-w-md" />
          <Select
            options={[
              { value: '', label: 'All Status' },
              { value: 'Ordered', label: 'Ordered' },
              { value: 'Received', label: 'Received' },
              { value: 'Partial', label: 'Partial' },
              { value: 'Cancelled', label: 'Cancelled' },
            ]}
            value={selectedStatus}
            onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }}
            className="w-40"
          />
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Total POs" value={pagination?.total ?? 0} icon={ShoppingBag} color="bg-blue-500" />
        <StatCard title="Page Value" value={formatCurrency(purchases.reduce((sum: number, p: any) => sum + Number(p.grandTotal || 0), 0))} icon={ArrowUpRight} color="bg-green-500" />
        <StatCard title="Pending" value={purchases.filter((p: any) => ['Ordered', 'Partial'].includes(p.status)).length} icon={ShoppingBag} color="bg-yellow-500" />
        <StatCard title="Received" value={purchases.filter((p: any) => p.status === 'Received').length} icon={PackageCheck} color="bg-green-500" />
      </div>

      <Card>
        <Table columns={columns} data={purchases} keyAccessor="id" loading={isLoading} emptyMessage="No purchase orders found" striped hoverable />
        {pagination && pagination.total > 0 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.limit}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
          />
        )}
      </Card>

      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={`Purchase ${selectedPurchase?.poNumber ?? ''}`}
        size="lg"
        footer={selectedPurchase ? (
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => printPurchaseOrder(selectedPurchase, settings)}><Printer className="h-4 w-4 mr-2" />Print</Button>
            {!['Received', 'Cancelled'].includes(selectedPurchase.status) && (
              <Button onClick={() => receiveMutation.mutate(selectedPurchase.id)} loading={receiveMutation.isPending}>
                <PackageCheck className="h-4 w-4 mr-2" />Receive Stock
              </Button>
            )}
            {selectedPurchase.status !== 'Received' && (
              <Button variant="outline" onClick={() => openEdit(selectedPurchase)}><Pencil className="h-4 w-4 mr-2" />Edit</Button>
            )}
          </div>
        ) : undefined}
      >
        {selectedPurchase && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-secondary-500">PO:</span> <span className="font-medium ml-2 font-mono">{selectedPurchase.poNumber}</span></div>
              <div><span className="text-secondary-500">Date:</span> <span className="font-medium ml-2">{formatDateTime(selectedPurchase.createdAt)}</span></div>
              <div><span className="text-secondary-500">Supplier:</span> <span className="font-medium ml-2">{selectedPurchase.supplierName || '-'}</span></div>
              <div><span className="text-secondary-500">Status:</span> <span className="ml-2"><Badge variant={statusVariant(selectedPurchase.status)} size="sm">{selectedPurchase.status}</Badge></span></div>
            </div>
            <div className="border-t border-secondary-200 dark:border-secondary-700 pt-4 space-y-2">
              {(selectedPurchase.items ?? []).map((item: any, index: number) => (
                <div key={index} className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg">
                  <div>
                    <p className="font-medium text-secondary-900 dark:text-white">{item.name}</p>
                    <p className="text-sm text-secondary-500">
                      {item.quantity} × {formatCurrency(item.unitCost)}
                      {item.receivedQuantity ? ` · received ${item.receivedQuantity}` : ''}
                    </p>
                  </div>
                  <span className="font-semibold">{formatCurrency(item.lineTotal)}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-between border-t border-secondary-200 dark:border-secondary-700 pt-3 text-base font-bold">
              <span>Total</span>
              <span>{formatCurrency(selectedPurchase.grandTotal)}</span>
            </div>
            {selectedPurchase.note && <p className="text-sm text-secondary-500">Note: {selectedPurchase.note}</p>}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingId(null); }}
        title={editingId ? 'Edit Purchase Order' : 'Create Purchase Order'}
        size="full"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            <Button onClick={submitForm} loading={saveMutation.isPending}>
              {editingId ? 'Save Changes' : 'Create PO'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Select
              label="Supplier"
              options={[{ value: '', label: 'Select supplier' }, ...suppliers.map((supplier: any) => ({ value: supplier.id, label: supplier.name }))]}
              value={form.supplierId}
              onChange={(e) => setForm({ ...form, supplierId: e.target.value })}
            />
            <Input label="PO Number (optional)" value={form.poNumber} onChange={(e) => setForm({ ...form, poNumber: e.target.value })} placeholder="Auto-generated" />
            <Select label="Status" options={[{ value: 'Ordered', label: 'Ordered' }]} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} />
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">Add Product</label>
            <Select
              options={[{ value: '', label: 'Select product...' }, ...products.map((product: any) => ({ value: product.id, label: `${product.name} (${product.itemCode})` }))]}
              value=""
              onChange={(e) => { if (e.target.value) addItem(e.target.value); }}
            />
          </div>

          {form.items.length === 0 ? (
            <p className="text-sm text-secondary-500 py-6 text-center border border-dashed border-secondary-300 dark:border-secondary-700 rounded-lg">No items added yet</p>
          ) : (
            <div className="space-y-2">
              {form.items.map((item) => (
                <div key={item.productId} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg">
                  <div className="sm:col-span-5">
                    <p className="font-medium text-sm text-secondary-900 dark:text-white">{item.name}</p>
                  </div>
                  <div className="sm:col-span-2">
                    <Input label="Qty" type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.productId, { quantity: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="sm:col-span-3">
                    <Input label="Unit Cost" type="number" min={0} step="0.01" value={item.unitCost} onChange={(e) => updateItem(item.productId, { unitCost: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="sm:col-span-1 text-right font-semibold pb-2">{formatCurrency(item.quantity * item.unitCost)}</div>
                  <div className="sm:col-span-1 flex justify-end pb-1">
                    <Button variant="ghost" size="icon" onClick={() => removeItem(item.productId)}><X className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-between border-t border-secondary-200 dark:border-secondary-700 pt-3 font-bold">
            <span>Total</span>
            <span>{formatCurrency(formTotals.total)}</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 dark:text-secondary-300 mb-2">Note</label>
            <textarea
              rows={2}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
              className="w-full px-3 py-2 border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800"
            />
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="Delete Purchase" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">Delete this purchase order? This cannot be undone.</p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDeletingId(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deletingId && deleteMutation.mutate(deletingId)} loading={deleteMutation.isPending}>Delete</Button>
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
