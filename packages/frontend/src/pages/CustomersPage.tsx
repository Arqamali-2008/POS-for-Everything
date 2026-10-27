import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatDate, formatDateTime, cn } from '../utils/helpers';
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Wallet,
  Users,
  UserCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const customerSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  creditLimit: z.coerce.number().nonnegative().default(0),
  openingBalance: z.coerce.number().default(0),
  notes: z.string().optional(),
});

type CustomerForm = z.infer<typeof customerSchema>;

export function CustomersPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);
  const [deletingCustomer, setDeletingCustomer] = useState<any | null>(null);
  const [ledgerCustomer, setLedgerCustomer] = useState<any | null>(null);
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [paymentNote, setPaymentNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const { data: customersData, isLoading: loading, refetch } = useQuery({
    queryKey: ['customers', searchQuery],
    queryFn: () => apiClient.customers.list({ search: searchQuery || undefined, limit: 500 }),
  });

  const { data: ledgerData, isLoading: ledgerLoading, refetch: refetchLedger } = useQuery({
    queryKey: ['customer-ledger', ledgerCustomer?.id],
    queryFn: () => apiClient.customers.ledger(ledgerCustomer!.id),
    enabled: !!ledgerCustomer?.id,
  });

  const customers = customersData?.data ?? [];
  const ledger = ledgerData?.data;

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['customer-ledger'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['sales'] });
  };

  const createMutation = useMutation({
    mutationFn: (data: CustomerForm) => apiClient.customers.create(data),
    onSuccess: () => { success('Customer created'); setShowModal(false); invalidate(); },
    onError: (err: any) => error('Failed to create', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CustomerForm> }) => apiClient.customers.update(id, data),
    onSuccess: () => { success('Customer updated'); setShowModal(false); setEditingCustomer(null); invalidate(); },
    onError: (err: any) => error('Failed to update', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.customers.delete(id),
    onSuccess: () => { success('Customer deleted'); setDeletingCustomer(null); invalidate(); },
    onError: (err: any) => error('Failed to delete', err.message),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiClient.customers.addPayment(id, data),
    onSuccess: () => {
      success('Payment recorded', 'Customer balance has been updated');
      setPaymentAmount(0);
      setPaymentNote('');
      refetchLedger();
      invalidate();
    },
    onError: (err: any) => error('Payment failed', err.message),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CustomerForm>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: '', phone: '', email: '', address: '', city: '', creditLimit: 0, openingBalance: 0, notes: '' },
  });

  const openCreate = () => {
    setEditingCustomer(null);
    reset({ name: '', phone: '', email: '', address: '', city: '', creditLimit: 0, openingBalance: 0, notes: '' });
    setShowModal(true);
  };

  const openEdit = (customer: any) => {
    setEditingCustomer(customer);
    reset({
      name: customer.name ?? '',
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      city: customer.city ?? '',
      creditLimit: Number(customer.creditLimit || 0),
      openingBalance: Number(customer.openingBalance || 0),
      notes: customer.notes ?? '',
    });
    setShowModal(true);
  };

  const submitForm = (data: CustomerForm) => {
    setIsSaving(true);
    if (editingCustomer) {
      updateMutation.mutate({ id: editingCustomer.id, data }, { onSettled: () => setIsSaving(false) });
    } else {
      createMutation.mutate(data, { onSettled: () => setIsSaving(false) });
    }
  };

  const columns: Column<any>[] = [
    { key: 'name', header: 'Name', accessor: 'name' },
    { key: 'phone', header: 'Phone', accessor: 'phone', width: '140px', render: (v) => v || '-' },
    { key: 'city', header: 'City', accessor: 'city', width: '120px', render: (v) => v || '-' },
    { key: 'creditLimit', header: 'Credit Limit', accessor: 'creditLimit', width: '130px', align: 'right', render: (v) => formatCurrency(v || 0) },
    { key: 'currentBalance', header: 'Balance', accessor: 'currentBalance', width: '130px', align: 'right', render: (v) => <span className={Number(v) > 0 ? 'text-red-600 font-medium' : ''}>{formatCurrency(v || 0)}</span> },
    { key: 'totalSpent', header: 'Total Spent', accessor: 'totalSpent', width: '130px', align: 'right', render: (v) => formatCurrency(v || 0) },
    { key: 'totalPurchases', header: 'Orders', accessor: 'totalPurchases', width: '80px', align: 'center' },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      width: '130px',
      align: 'center',
      render: (_v, row) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => { setLedgerCustomer(row); setPaymentAmount(0); }} className="p-2 rounded-lg text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20" aria-label="Ledger"><Wallet className="h-4 w-4" /></button>
          <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700" aria-label="Edit"><Edit className="h-4 w-4" /></button>
          <button onClick={() => setDeletingCustomer(row)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  const totalOutstanding = customers.reduce(
    (sum: number, customer: any) => sum + Math.max(0, Number(customer.currentBalance || 0)),
    0,
  );
  const withDebt = customers.filter((customer: any) => Number(customer.currentBalance || 0) > 0).length;
  const thisMonth = customers.filter((customer: any) => {
    const created = new Date(customer.createdAt);
    const now = new Date();
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Customers</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Manage customers, credit and payments</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Customer</Button>
      </div>

      <Card className="p-4">
        <Input placeholder="Search customers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="max-w-md" />
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard title="Customers" value={customers.length} icon={Users} color="bg-blue-500" />
        <StatCard title="Outstanding" value={formatCurrency(totalOutstanding)} icon={AlertCircle} color="bg-red-500" />
        <StatCard title="With Balance" value={withDebt} icon={Wallet} color="bg-amber-500" />
        <StatCard title="New This Month" value={thisMonth} icon={UserCheck} color="bg-green-500" />
      </div>

      <Card>
        <Table columns={columns} data={customers} keyAccessor="id" loading={loading} emptyMessage="No customers found. Add your first customer." striped hoverable />
      </Card>

      <Modal isOpen={showModal} onClose={() => { setShowModal(false); setEditingCustomer(null); }} title={editingCustomer ? 'Edit Customer' : 'Add Customer'} size="lg">
        <form onSubmit={handleSubmit(submitForm)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Name" error={errors.name?.message} {...register('name')} placeholder="John Doe" />
            <Input label="Phone" type="tel" {...register('phone')} placeholder="+94 7X XXX XXXX" />
            <Input label="Email" type="email" {...register('email')} placeholder="john@example.com" />
            <Input label="City" {...register('city')} placeholder="Colombo" />
            <Input label="Address" {...register('address')} placeholder="123 Main St" className="md:col-span-2" />
            <Input label="Credit Limit" type="number" step="0.01" min="0" {...register('creditLimit')} />
            <Input label="Opening Balance" type="number" step="0.01" {...register('openingBalance')} />
            <Input label="Notes" {...register('notes')} placeholder="Optional notes" className="md:col-span-2" />
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t border-secondary-200 dark:border-secondary-700">
            <Button type="button" variant="outline" onClick={() => { setShowModal(false); setEditingCustomer(null); }}>Cancel</Button>
            <Button type="submit" loading={isSaving || createMutation.isPending || updateMutation.isPending}>
              {editingCustomer ? 'Update' : 'Create'} Customer
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!ledgerCustomer}
        onClose={() => setLedgerCustomer(null)}
        title={`Ledger · ${ledgerCustomer?.name ?? ''}`}
        size="full"
      >
        {ledgerLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-primary-600" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Summary label="Balance" value={formatCurrency(ledger?.balance ?? ledgerCustomer?.currentBalance ?? 0)} highlight />
              <Summary label="Total debit" value={formatCurrency(ledger?.totalDebit ?? 0)} />
              <Summary label="Total credit" value={formatCurrency(ledger?.totalCredit ?? 0)} />
              <Summary label="Credit limit" value={formatCurrency(ledgerCustomer?.creditLimit ?? 0)} />
            </div>

            <Card className="p-4">
              <h4 className="font-medium text-secondary-900 dark:text-white mb-3">Record Payment</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <Input label="Amount" type="number" min={0} step="0.01" value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value) || 0)} />
                <Select label="Method" options={[{ value: 'Cash', label: 'Cash' }, { value: 'Card', label: 'Card' }, { value: 'Bank', label: 'Bank' }, { value: 'Cheque', label: 'Cheque' }]} value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} />
                <Input label="Reference" value={paymentNote} onChange={(e) => setPaymentNote(e.target.value)} placeholder="Optional" />
                <div className="flex items-end">
                  <Button
                    className="w-full"
                    loading={paymentMutation.isPending}
                    onClick={() => {
                      if (!ledgerCustomer) return;
                      if (paymentAmount <= 0) { error('Invalid amount', 'Enter a payment amount'); return; }
                      paymentMutation.mutate({ id: ledgerCustomer.id, data: { amount: paymentAmount, method: paymentMethod, reference: paymentNote } });
                    }}
                  >
                    Add Payment
                  </Button>
                </div>
              </div>
            </Card>

            <div className="overflow-x-auto rounded-lg border border-secondary-200 dark:border-secondary-700">
              <table className="w-full text-sm">
                <thead className="bg-secondary-50 dark:bg-secondary-800/50">
                  <tr>
                    <th className="px-3 py-2 text-left">Date</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-left">Reference</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-secondary-200 dark:divide-secondary-700">
                  {(ledger?.entries ?? []).map((entry: any, index: number) => (
                    <tr key={index}>
                      <td className="px-3 py-2">{formatDate(entry.date)}</td>
                      <td className="px-3 py-2">{entry.type}</td>
                      <td className="px-3 py-2 font-mono text-xs">{entry.reference}</td>
                      <td className="px-3 py-2 text-right">{entry.debit ? formatCurrency(entry.debit) : '-'}</td>
                      <td className="px-3 py-2 text-right text-green-600">{entry.credit ? formatCurrency(entry.credit) : '-'}</td>
                      <td className="px-3 py-2 text-right font-medium">{formatCurrency(entry.balance)}</td>
                    </tr>
                  ))}
                  {(ledger?.entries ?? []).length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-secondary-500">No ledger entries</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div>
              <h4 className="font-medium text-secondary-900 dark:text-white mb-2">Recent Sales</h4>
              <div className="space-y-2">
                {(ledger?.sales ?? []).slice(0, 8).map((sale: any) => (
                  <div key={sale.id} className="flex items-center justify-between p-2 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg text-sm">
                    <div>
                      <span className="font-mono">{sale.invoiceNo}</span>
                      <span className="text-secondary-500 ml-2">{formatDateTime(sale.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={sale.status === 'Completed' ? 'success' : 'warning'} size="sm">{sale.status}</Badge>
                      <span className="font-semibold">{formatCurrency(sale.grandTotal)}</span>
                    </div>
                  </div>
                ))}
                {(ledger?.sales ?? []).length === 0 && <p className="text-sm text-secondary-500">No sales yet</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!deletingCustomer} onClose={() => setDeletingCustomer(null)} title="Delete Customer" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">Delete <strong>{deletingCustomer?.name}</strong>? Sales history is kept but the customer is hidden.</p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDeletingCustomer(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deletingCustomer && deleteMutation.mutate(deletingCustomer.id)} loading={deleteMutation.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

function Summary({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={cn('p-4', highlight && 'border-primary-300 dark:border-primary-700')}>
      <p className="text-xs text-secondary-500">{label}</p>
      <p className="text-lg font-bold text-secondary-900 dark:text-white mt-1">{value}</p>
    </Card>
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
