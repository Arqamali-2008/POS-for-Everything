import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Table, Column, Pagination } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCurrency, formatDate, cn } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  CreditCard,
  Receipt,
  TrendingUp,
  Download,
  CheckCircle,
} from 'lucide-react';
import { useToast } from '../components/ui/Toaster';

const categories = [
  'Rent',
  'Utilities',
  'Salaries',
  'Marketing',
  'Maintenance',
  'Supplies',
  'Transport',
  'Insurance',
  'Taxes',
  'Other',
];

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  category: 'Other',
  description: '',
  amount: 0,
  paymentMethod: 'Cash',
  vendorName: '',
  reference: '',
  note: '',
};

export function ExpensesPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedApproval, setSelectedApproval] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, any>>(emptyForm);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const params = {
    search: searchQuery || undefined,
    category: selectedCategory || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    page: currentPage,
    limit: pageSize,
    sortBy: 'date',
    sortOrder: 'desc' as const,
  };

  const { data: expensesData, isLoading } = useQuery({
    queryKey: ['expenses', params],
    queryFn: () => apiClient.expenses.list(params),
  });

  const summaryParams = {
    search: searchQuery || undefined,
    category: selectedCategory || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  };

  const { data: summaryData, isLoading: loadingSummary } = useQuery({
    queryKey: ['expenses-summary', summaryParams],
    queryFn: () => apiClient.expenses.list({ ...summaryParams, page: 1, limit: 1000 }),
  });

  const expenses = expensesData?.data ?? [];
  const pagination = expensesData?.pagination;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['expenses'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
  };

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      editingId ? apiClient.expenses.update(editingId, data) : apiClient.expenses.create(data),
    onSuccess: () => {
      success(editingId ? 'Expense updated' : 'Expense recorded');
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
      invalidate();
    },
    onError: (err: any) => error('Could not save expense', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.expenses.delete(id),
    onSuccess: () => {
      success('Expense deleted');
      setDeletingId(null);
      invalidate();
    },
    onError: (err: any) => error('Could not delete expense', err.message),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiClient.expenses.approve(id),
    onSuccess: () => {
      success('Expense approved');
      invalidate();
    },
    onError: (err: any) => error('Could not approve expense', err.message),
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm, date: new Date().toISOString().slice(0, 10) });
    setShowForm(true);
  };

  const openEdit = (expense: any) => {
    setEditingId(expense.id);
    setForm({
      date: String(expense.date || expense.createdAt || '').slice(0, 10),
      category: expense.category || 'Other',
      description: expense.description || '',
      amount: Number(expense.amount || 0),
      paymentMethod: expense.paymentMethod || 'Cash',
      vendorName: expense.vendorName || '',
      reference: expense.reference || expense.paymentReference || '',
      note: expense.note || '',
    });
    setShowForm(true);
  };

  const submit = () => {
    if (!form.description.trim()) {
      error('Description required', 'Enter what this expense was for');
      return;
    }
    if (Number(form.amount) <= 0) {
      error('Invalid amount', 'Expense amount must be greater than zero');
      return;
    }
    saveMutation.mutate(form);
  };

  const filtered = useMemo(
    () =>
      expenses.filter((expense: any) =>
        selectedApproval === 'approved'
          ? expense.isApproved
          : selectedApproval === 'pending'
            ? !expense.isApproved
            : true,
      ),
    [expenses, selectedApproval],
  );

  const exportCsv = async () => {
    const all = await apiClient.expenses.list({ ...summaryParams, page: 1, limit: 1000 });
    downloadCsv(
      `expenses-${new Date().toISOString().slice(0, 10)}`,
      (all.data ?? []).map((expense: any) => ({
        Date: formatDate(expense.date || expense.createdAt),
        Category: expense.category,
        Description: expense.description,
        Amount: expense.amount,
        Payment: expense.paymentMethod,
        Vendor: expense.vendorName,
        Reference: expense.reference || expense.paymentReference || '',
        Notes: expense.note,
        Approved: expense.isApproved ? 'Yes' : 'No',
      })),
    );
    success('Export ready', 'Expenses CSV downloaded');
  };

  const columns: Column<any>[] = [
    { key: 'date', header: 'Date', accessor: 'date', width: '110px', render: (v, row) => formatDate(v || row.createdAt) },
    { key: 'category', header: 'Category', accessor: 'category', width: '130px', render: (v) => <Badge variant="outline" size="sm">{v}</Badge> },
    { key: 'description', header: 'Description', accessor: 'description' },
    { key: 'amount', header: 'Amount', accessor: 'amount', width: '110px', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'paymentMethod', header: 'Payment', accessor: 'paymentMethod', width: '110px' },
    { key: 'reference', header: 'Reference', accessor: 'reference', width: '130px', render: (v, row) => v || row.paymentReference || '-' },
    { key: 'vendorName', header: 'Vendor', accessor: 'vendorName', width: '140px' },
    { key: 'isApproved', header: 'Status', accessor: 'isApproved', width: '110px', align: 'center', render: (v, row) => v ? <Badge variant="success" size="sm">Approved</Badge> : (
      <button onClick={() => approveMutation.mutate(row.id)} className="text-xs font-medium text-amber-600 hover:underline">Approve</button>
    ) },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      width: '90px',
      align: 'center',
      render: (_v, row) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700" aria-label="Edit"><Edit className="h-4 w-4" /></button>
          <button onClick={() => setDeletingId(row.id)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  const summaryExpenses = useMemo(
    () =>
      (summaryData?.data ?? []).filter((expense: any) =>
        selectedApproval === 'approved'
          ? expense.isApproved
          : selectedApproval === 'pending'
            ? !expense.isApproved
            : true,
      ),
    [summaryData, selectedApproval],
  );

  const todayKey = new Date().toLocaleDateString('en-CA');
  const monthKey = todayKey.slice(0, 7);
  const totalExpenses = summaryExpenses.reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0);
  const todayExpenses = summaryExpenses
    .filter((expense: any) => String(expense.date || expense.createdAt || '').slice(0, 10) === todayKey)
    .reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0);
  const monthExpenses = summaryExpenses
    .filter((expense: any) => String(expense.date || expense.createdAt || '').slice(0, 7) === monthKey)
    .reduce((sum: number, expense: any) => sum + Number(expense.amount || 0), 0);

  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    for (const expense of summaryExpenses) {
      const category = expense.category || 'Other';
      totals.set(category, (totals.get(category) ?? 0) + Number(expense.amount || 0));
    }
    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [summaryExpenses]);

  const highestCategory = categoryTotals[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Expenses</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Track and manage business expenses</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Expense</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col xl:flex-row xl:items-end gap-3">
          <Input placeholder="Search expenses..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="flex-1 min-w-[220px]" />
          <Select
            options={[{ value: '', label: 'All Categories' }, ...categories.map((category) => ({ value: category, label: category }))]}
            value={selectedCategory}
            onChange={(e) => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
            className="w-48"
          />
          <Select
            options={[{ value: '', label: 'All Status' }, { value: 'approved', label: 'Approved' }, { value: 'pending', label: 'Pending' }]}
            value={selectedApproval}
            onChange={(e) => { setSelectedApproval(e.target.value); setCurrentPage(1); }}
            className="w-40"
          />
          <Input label="From" type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setCurrentPage(1); }} className="w-40" />
          <Input label="To" type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setCurrentPage(1); }} className="w-40" />
          {(dateFrom || dateTo || selectedCategory || searchQuery || selectedApproval) && (
            <Button variant="ghost" onClick={() => { setDateFrom(''); setDateTo(''); setSelectedCategory(''); setSelectedApproval(''); setSearchQuery(''); setCurrentPage(1); }}>Clear</Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Filtered Total" value={formatCurrency(totalExpenses)} icon={CreditCard} color="bg-red-500" />
        <StatCard title="This Month" value={formatCurrency(monthExpenses)} icon={TrendingUp} color="bg-blue-500" />
        <StatCard title="Today" value={formatCurrency(todayExpenses)} icon={Receipt} color="bg-yellow-500" />
        <StatCard title="Top Category" value={highestCategory?.category ?? '-'} icon={TrendingUp} color="bg-orange-500" />
      </div>

      {categoryTotals.length > 0 && (
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Spending by Category</h2>
            <Badge variant="outline">{loadingSummary ? 'Loading...' : `${summaryExpenses.length} records`}</Badge>
          </div>
          <div className="space-y-4">
            {categoryTotals.slice(0, 8).map((item) => (
              <div key={item.category}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-secondary-700 dark:text-secondary-300">{item.category}</span>
                  <span className="text-secondary-900 dark:text-white font-semibold">{formatCurrency(item.total)}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary-100 dark:bg-secondary-800 overflow-hidden">
                  <div className="h-full rounded-full bg-red-500" style={{ width: `${(item.total / categoryTotals[0].total) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <Table columns={columns} data={filtered} keyAccessor="id" loading={isLoading} emptyMessage="No expenses found" striped hoverable />
        {pagination && pagination.total > pageSize && (
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
        isOpen={showForm}
        onClose={() => { setShowForm(false); setEditingId(null); }}
        title={editingId ? 'Edit Expense' : 'Add Expense'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>Cancel</Button>
            <Button onClick={submit} loading={saveMutation.isPending}>{editingId ? 'Save Changes' : 'Add Expense'}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input label="Date" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <Select label="Category" options={categories.map((category) => ({ value: category, label: category }))} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Office rent for October" className="sm:col-span-2" />
          <Input label="Amount" type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} />
          <Select label="Payment Method" options={[{ value: 'Cash', label: 'Cash' }, { value: 'Card', label: 'Card' }, { value: 'Bank', label: 'Bank Transfer' }, { value: 'Cheque', label: 'Cheque' }]} value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })} />
          <Input label="Vendor" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} placeholder="Vendor name" />
          <Input label="Reference" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Invoice / cheque no." />
          <Input label="Note" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional note" className="sm:col-span-2" />
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={Boolean(form.isApproved)} onChange={(e) => setForm({ ...form, isApproved: e.target.checked })} className="h-4 w-4 rounded border-secondary-300 text-primary-600" />
            Mark as approved
          </label>
        </div>
      </Modal>

      <Modal isOpen={!!deletingId} onClose={() => setDeletingId(null)} title="Delete Expense" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">Delete this expense record?</p>
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
