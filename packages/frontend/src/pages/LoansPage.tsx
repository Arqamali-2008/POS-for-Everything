import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatDate, cn } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import { Plus, Search, Edit, Trash2, Download, Wallet, HandCoins, TrendingDown, CircleDollarSign, History } from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const loanStatuses = ['Active', 'Paid', 'Overdue', 'Defaulted'] as const;

const loanSchema = z.object({
  lenderName: z.string().min(1, 'Lender name is required'),
  principal: z.coerce.number().positive('Principal must be greater than zero'),
  interestRate: z.coerce.number().nonnegative().default(0),
  startDate: z.string().min(1, 'Start date is required'),
  dueDate: z.string().optional(),
  installmentAmount: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional(),
  status: z.enum(loanStatuses).default('Active'),
});

type LoanForm = z.infer<typeof loanSchema>;

const defaultValues: LoanForm = {
  lenderName: '', principal: 0, interestRate: 0,
  startDate: new Date().toISOString().slice(0, 10), dueDate: '', installmentAmount: 0, notes: '', status: 'Active',
};

export function LoansPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);
  const [paymentLoan, setPaymentLoan] = useState<any | null>(null);
  const [payment, setPayment] = useState({ amount: 0, method: 'Cash', date: new Date().toISOString().slice(0, 10), note: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['loans', search, statusFilter],
    queryFn: () => apiClient.loans.list({ search: search || undefined, status: statusFilter || undefined, limit: 500 }),
  });

  const loans = data?.data ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<LoanForm>({
    resolver: zodResolver(loanSchema),
    defaultValues,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['loans'] });
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const createMutation = useMutation({
    mutationFn: (values: LoanForm) =>
      apiClient.loans.create({
        ...values,
        interestAmount: Math.round(Number(values.principal) * Number(values.interestRate) * 100) / 10000,
        paidAmount: 0,
      }),
    onSuccess: () => { success('Loan added'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to add loan', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: LoanForm }) =>
      apiClient.loans.update(id, {
        ...values,
        interestAmount: Math.round(Number(values.principal) * Number(values.interestRate) * 100) / 10000,
      }),
    onSuccess: () => { success('Loan updated'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to update loan', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.loans.delete(id),
    onSuccess: () => { success('Loan deleted'); setDeleting(null); invalidate(); },
    onError: (err: any) => error('Failed to delete loan', err.message),
  });

  const paymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => apiClient.loans.addPayment(id, data),
    onSuccess: () => {
      success('Payment recorded');
      setPaymentLoan(null);
      setPayment({ amount: 0, method: 'Cash', date: new Date().toISOString().slice(0, 10), note: '' });
      invalidate();
    },
    onError: (err: any) => error('Payment failed', err.message),
  });

  const openCreate = () => { setEditing(null); reset(defaultValues); setShowModal(true); };

  const openEdit = (loan: any) => {
    setEditing(loan);
    reset({
      lenderName: loan.lenderName ?? '',
      principal: Number(loan.principal || 0),
      interestRate: Number(loan.interestRate || 0),
      startDate: loan.startDate ? String(loan.startDate).slice(0, 10) : '',
      dueDate: loan.dueDate ? String(loan.dueDate).slice(0, 10) : '',
      installmentAmount: Number(loan.installmentAmount || 0),
      notes: loan.notes ?? '',
      status: loan.status ?? 'Active',
    });
    setShowModal(true);
  };

  const submit = (values: LoanForm) => {
    if (editing) updateMutation.mutate({ id: editing.id, values });
    else createMutation.mutate(values);
  };

  const totalPayable = (loan: any) => Number(loan.principal || 0) + Number(loan.interestAmount || 0);
  const paidAmount = (loan: any) =>
    Number(loan.paidAmount ?? (loan.payments ?? []).reduce((sum: number, entry: any) => sum + Number(entry.amount || 0), 0));
  const balance = (loan: any) => Number(loan.balance ?? Math.max(0, totalPayable(loan) - paidAmount(loan)));

  const totalPrincipal = loans.reduce((sum: number, loan: any) => sum + Number(loan.principal || 0), 0);
  const totalOutstanding = loans.reduce((sum: number, loan: any) => sum + balance(loan), 0);
  const totalPaid = loans.reduce((sum: number, loan: any) => sum + paidAmount(loan), 0);
  const activeCount = loans.filter((loan: any) => loan.status === 'Active').length;

  const exportCsv = () => {
    downloadCsv(
      `loans-${new Date().toISOString().slice(0, 10)}`,
      loans.map((loan: any) => ({
        Lender: loan.lenderName,
        Principal: loan.principal,
        Interest: loan.interestAmount,
        TotalPayable: totalPayable(loan),
        Paid: paidAmount(loan),
        Balance: balance(loan),
        StartDate: loan.startDate,
        DueDate: loan.dueDate,
        Status: loan.status,
      })),
    );
    success('Export ready', 'Loans CSV downloaded');
  };

  const columns: Column<any>[] = [
    {
      key: 'lenderName',
      header: 'Lender',
      accessor: 'lenderName',
      render: (value, row) => (
        <div>
          <p className="font-medium text-secondary-900 dark:text-white">{value}</p>
          <p className="text-xs text-secondary-500">Started {row.startDate ? formatDate(row.startDate) : '-'}</p>
        </div>
      ),
    },
    { key: 'principal', header: 'Principal', accessor: 'principal', align: 'right', width: '120px', render: (value) => formatCurrency(value) },
    {
      key: 'paid',
      header: 'Paid',
      accessor: 'paidAmount',
      align: 'right',
      width: '150px',
      render: (_v, row) => {
        const paid = paidAmount(row);
        const total = totalPayable(row);
        const percent = total ? Math.min(100, (paid / total) * 100) : 0;
        return (
          <div>
            <p className="text-sm font-medium text-secondary-900 dark:text-white">{formatCurrency(paid)}</p>
            <div className="h-1.5 w-full bg-secondary-200 dark:bg-secondary-700 rounded-full mt-1">
              <div className="h-1.5 bg-green-500 rounded-full" style={{ width: `${percent}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      key: 'balance',
      header: 'Balance',
      accessor: 'balance',
      align: 'right',
      width: '120px',
      render: (_v, row) => <span className={cn('font-semibold', balance(row) > 0 ? 'text-amber-600' : 'text-green-600')}>{formatCurrency(balance(row))}</span>,
    },
    { key: 'dueDate', header: 'Due', accessor: 'dueDate', width: '120px', render: (value) => (value ? formatDate(value) : '-') },
    {
      key: 'status',
      header: 'Status',
      accessor: 'status',
      align: 'center',
      width: '100px',
      render: (value) => <Badge variant={value === 'Paid' ? 'success' : value === 'Overdue' || value === 'Defaulted' ? 'danger' : 'warning'} size="sm">{value}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      width: '150px',
      align: 'center',
      render: (_v, row) => (
        <div className="flex items-center justify-center gap-1">
          <button title="Payments" onClick={() => { setPaymentLoan(row); setPayment({ amount: Math.min(balance(row), Number(row.installmentAmount) || balance(row)), method: 'Cash', date: new Date().toISOString().slice(0, 10), note: '' }); }} className="p-2 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><HandCoins className="h-4 w-4" /></button>
          <button title="Edit" onClick={() => openEdit(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700"><Edit className="h-4 w-4" /></button>
          <button title="Delete" onClick={() => setDeleting(row)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Loans</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Track borrowings, installments and repayments</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Loan</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Total Principal" value={formatCurrency(totalPrincipal)} icon={Wallet} color="bg-blue-500" />
        <Stat title="Outstanding" value={formatCurrency(totalOutstanding)} icon={TrendingDown} color="bg-amber-500" />
        <Stat title="Total Paid" value={formatCurrency(totalPaid)} icon={CircleDollarSign} color="bg-green-500" />
        <Stat title="Active Loans" value={String(activeCount)} icon={HandCoins} color="bg-purple-500" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input placeholder="Search by lender..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="flex-1 max-w-md" />
          <Select
            options={[{ value: '', label: 'All Statuses' }, ...loanStatuses.map((status) => ({ value: status, label: status }))]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-44"
          />
        </div>
      </Card>

      <Card>
        <Table columns={columns} data={loans} keyAccessor="id" loading={isLoading} emptyMessage="No loans recorded yet." striped hoverable />
      </Card>

      <Modal isOpen={showModal} onClose={closeModal} title={editing ? 'Edit Loan' : 'Add Loan'} size="lg">
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Lender" error={errors.lenderName?.message} {...register('lenderName')} placeholder="Bank or person" />
            <Input label="Principal Amount" type="number" step="0.01" min="0.01" error={errors.principal?.message} {...register('principal')} />
            <Input label="Interest Rate %" type="number" step="0.01" min="0" {...register('interestRate')} />
            <Input label="Installment Amount" type="number" step="0.01" min="0" {...register('installmentAmount')} />
            <Input label="Start Date" type="date" error={errors.startDate?.message} {...register('startDate')} />
            <Input label="Due Date" type="date" {...register('dueDate')} />
            <Select label="Status" options={loanStatuses.map((status) => ({ value: status, label: status }))} {...register('status')} />
          </div>
          <Textarea label="Notes" {...register('notes')} rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        isOpen={!!paymentLoan}
        onClose={() => setPaymentLoan(null)}
        title={paymentLoan ? `Payments · ${paymentLoan.lenderName}` : 'Payments'}
        size="lg"
      >
        {paymentLoan && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3 p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg text-sm">
              <div><p className="text-secondary-500">Total Payable</p><p className="font-semibold text-secondary-900 dark:text-white">{formatCurrency(totalPayable(paymentLoan))}</p></div>
              <div><p className="text-secondary-500">Paid</p><p className="font-semibold text-green-600">{formatCurrency(paidAmount(paymentLoan))}</p></div>
              <div><p className="text-secondary-500">Balance</p><p className="font-semibold text-amber-600">{formatCurrency(balance(paymentLoan))}</p></div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (payment.amount <= 0) { error('Invalid amount', 'Enter an amount greater than zero'); return; }
                paymentMutation.mutate({ id: paymentLoan.id, data: payment });
              }}
              className="space-y-3"
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input label="Amount" type="number" step="0.01" min="0.01" value={payment.amount} onChange={(e) => setPayment({ ...payment, amount: Number(e.target.value) })} />
                <Select label="Method" options={[{ value: 'Cash', label: 'Cash' }, { value: 'Card', label: 'Card' }, { value: 'Bank Transfer', label: 'Bank Transfer' }]} value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value })} />
                <Input label="Date" type="date" value={payment.date} onChange={(e) => setPayment({ ...payment, date: e.target.value })} />
              </div>
              <Input label="Note" value={payment.note} onChange={(e) => setPayment({ ...payment, note: e.target.value })} placeholder="Optional note" />
              <Button type="submit" loading={paymentMutation.isPending}><HandCoins className="h-4 w-4 mr-2" />Record Payment</Button>
            </form>

            <div>
              <h4 className="font-medium text-secondary-900 dark:text-white flex items-center gap-2 mb-2"><History className="h-4 w-4" />Payment History</h4>
              <div className="space-y-2 max-h-52 overflow-y-auto">
                {(paymentLoan.payments ?? []).slice().reverse().map((entry: any) => (
                  <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg border border-secondary-200 dark:border-secondary-700 text-sm">
                    <div>
                      <p className="font-medium text-secondary-900 dark:text-white">{formatCurrency(entry.amount)}</p>
                      <p className="text-xs text-secondary-500">{formatDate(entry.date)} · {entry.method}{entry.note ? ` · ${entry.note}` : ''}</p>
                    </div>
                  </div>
                ))}
                {!paymentLoan.payments?.length && <p className="text-sm text-secondary-500 text-center py-4">No payments recorded yet.</p>}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete Loan" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">Delete the loan from <strong>{deleting?.lenderName}</strong>?</p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleting && deleteMutation.mutate(deleting.id)} loading={deleteMutation.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}

function Stat({ title, value, icon: Icon, color }: { title: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', color)}><Icon className="h-5 w-5 text-white" /></div>
        <div><p className="text-sm text-secondary-500 dark:text-secondary-400">{title}</p><p className="text-xl font-bold text-secondary-900 dark:text-white">{value}</p></div>
      </div>
    </Card>
  );
}
