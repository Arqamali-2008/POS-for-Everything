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
import { Plus, Search, Edit, Trash2, Download, Wallet, CheckCircle, XCircle, Clock, Landmark } from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const chequeStatuses = ['Pending', 'Deposited', 'Cleared', 'Bounced', 'Cancelled'] as const;

const chequeSchema = z.object({
  chequeNumber: z.string().min(1, 'Cheque number is required'),
  bankName: z.string().min(1, 'Bank is required'),
  branch: z.string().optional(),
  partyName: z.string().min(1, 'Payee/payer is required'),
  partyType: z.enum(['Received', 'Issued']).default('Received'),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
  issueDate: z.string().optional(),
  dueDate: z.string().min(1, 'Due date is required'),
  status: z.enum(chequeStatuses).default('Pending'),
  reference: z.string().optional(),
  notes: z.string().optional(),
});

type ChequeForm = z.infer<typeof chequeSchema>;

const defaultValues: ChequeForm = {
  chequeNumber: '', bankName: '', branch: '', partyName: '', partyType: 'Received',
  amount: 0, issueDate: new Date().toISOString().slice(0, 10),
  dueDate: new Date().toISOString().slice(0, 10), status: 'Pending', reference: '', notes: '',
};

const statusVariant: Record<string, 'success' | 'warning' | 'danger' | 'default' | 'info'> = {
  Cleared: 'success',
  Pending: 'warning',
  Deposited: 'info',
  Bounced: 'danger',
  Cancelled: 'default',
};

export function ChequesPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['cheques', search, statusFilter],
    queryFn: () => apiClient.cheques.list({ search: search || undefined, status: statusFilter || undefined, limit: 500 }),
  });

  const cheques = data?.data ?? [];
  const today = new Date().toLocaleDateString('en-CA');
  const isOverdue = (cheque: any) =>
    ['Pending', 'Deposited'].includes(cheque.status) && cheque.dueDate && String(cheque.dueDate).slice(0, 10) < today;

  const { register, handleSubmit, reset, formState: { errors } } = useForm<ChequeForm>({
    resolver: zodResolver(chequeSchema),
    defaultValues,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cheques'] });
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const createMutation = useMutation({
    mutationFn: (values: ChequeForm) => apiClient.cheques.create(values),
    onSuccess: () => { success('Cheque added'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to add cheque', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: ChequeForm }) => apiClient.cheques.update(id, values),
    onSuccess: () => { success('Cheque updated'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to update cheque', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.cheques.delete(id),
    onSuccess: () => { success('Cheque deleted'); setDeleting(null); invalidate(); },
    onError: (err: any) => error('Failed to delete cheque', err.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiClient.cheques.updateStatus(id, status),
    onSuccess: () => { success('Cheque status updated'); invalidate(); },
    onError: (err: any) => error('Failed to update status', err.message),
  });

  const openCreate = () => { setEditing(null); reset(defaultValues); setShowModal(true); };

  const openEdit = (cheque: any) => {
    setEditing(cheque);
    reset({
      chequeNumber: cheque.chequeNumber ?? '',
      bankName: cheque.bankName ?? '',
      branch: cheque.branch ?? '',
      partyName: cheque.partyName ?? '',
      partyType: cheque.partyType ?? 'Received',
      amount: Number(cheque.amount || 0),
      issueDate: cheque.issueDate ? String(cheque.issueDate).slice(0, 10) : '',
      dueDate: cheque.dueDate ? String(cheque.dueDate).slice(0, 10) : '',
      status: cheque.status ?? 'Pending',
      reference: cheque.reference ?? '',
      notes: cheque.notes ?? '',
    });
    setShowModal(true);
  };

  const submit = (values: ChequeForm) => {
    if (editing) updateMutation.mutate({ id: editing.id, values });
    else createMutation.mutate(values);
  };

  const pendingAmount = cheques.filter((cheque: any) => ['Pending', 'Deposited'].includes(cheque.status) && cheque.partyType !== 'Issued')
    .reduce((sum: number, cheque: any) => sum + Number(cheque.amount || 0), 0);
  const clearedAmount = cheques.filter((cheque: any) => cheque.status === 'Cleared')
    .reduce((sum: number, cheque: any) => sum + Number(cheque.amount || 0), 0);
  const overdueCount = cheques.filter(isOverdue).length;

  const exportCsv = () => {
    downloadCsv(
      `cheques-${new Date().toISOString().slice(0, 10)}`,
      cheques.map((cheque: any) => ({
        ChequeNo: cheque.chequeNumber,
        Bank: cheque.bankName,
        Branch: cheque.branch,
        Party: cheque.partyName,
        Type: cheque.partyType,
        Amount: cheque.amount,
        IssueDate: cheque.issueDate,
        DueDate: cheque.dueDate,
        Status: cheque.status,
        Reference: cheque.reference,
      })),
    );
    success('Export ready', 'Cheques CSV downloaded');
  };

  const columns: Column<any>[] = [
    {
      key: 'chequeNumber',
      header: 'Cheque',
      accessor: 'chequeNumber',
      render: (value, row) => (
        <div>
          <p className="font-medium text-secondary-900 dark:text-white font-mono">{value}</p>
          <p className="text-xs text-secondary-500">{row.bankName}{row.branch ? ` · ${row.branch}` : ''}</p>
        </div>
      ),
    },
    {
      key: 'partyName',
      header: 'Party',
      accessor: 'partyName',
      render: (value, row) => (
        <div>
          <p className="text-secondary-900 dark:text-white">{value}</p>
          <Badge variant={row.partyType === 'Issued' ? 'warning' : 'info'} size="sm">{row.partyType}</Badge>
        </div>
      ),
    },
    { key: 'amount', header: 'Amount', accessor: 'amount', align: 'right', width: '130px', render: (value) => <span className="font-semibold">{formatCurrency(value)}</span> },
    {
      key: 'dueDate',
      header: 'Due Date',
      accessor: 'dueDate',
      width: '140px',
      render: (value, row) => (
        <span className={cn(isOverdue(row) && 'text-red-600 font-medium')}>
          {value ? formatDate(value) : '-'}{isOverdue(row) && <span className="block text-xs">Overdue</span>}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      accessor: 'status',
      align: 'center',
      width: '120px',
      render: (value) => <Badge variant={statusVariant[value] ?? 'default'} size="sm">{value}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      width: '150px',
      align: 'center',
      render: (_v, row) => (
        <div className="flex items-center justify-center gap-1">
          {row.status !== 'Cleared' && (
            <button title="Mark cleared" onClick={() => statusMutation.mutate({ id: row.id, status: 'Cleared' })} className="p-2 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><CheckCircle className="h-4 w-4" /></button>
          )}
          {row.status !== 'Bounced' && row.status !== 'Cleared' && (
            <button title="Mark bounced" onClick={() => statusMutation.mutate({ id: row.id, status: 'Bounced' })} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><XCircle className="h-4 w-4" /></button>
          )}
          <button title="Edit" onClick={() => openEdit(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700"><Edit className="h-4 w-4" /></button>
          <button title="Delete" onClick={() => setDeleting(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Cheques</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Track received and issued cheques</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Cheque</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Total Cheques" value={String(cheques.length)} icon={Landmark} color="bg-blue-500" />
        <Stat title="Pending Amount" value={formatCurrency(pendingAmount)} icon={Clock} color="bg-amber-500" />
        <Stat title="Cleared Amount" value={formatCurrency(clearedAmount)} icon={CheckCircle} color="bg-green-500" />
        <Stat title="Overdue" value={String(overdueCount)} icon={XCircle} color="bg-red-500" />
      </div>

      <Card className="p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input placeholder="Search cheque no., bank or party..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="flex-1 max-w-md" />
          <Select
            options={[{ value: '', label: 'All Statuses' }, ...chequeStatuses.map((status) => ({ value: status, label: status }))]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-44"
          />
        </div>
      </Card>

      <Card>
        <Table columns={columns} data={cheques} keyAccessor="id" loading={isLoading} emptyMessage="No cheques recorded yet." striped hoverable />
      </Card>

      <Modal isOpen={showModal} onClose={closeModal} title={editing ? 'Edit Cheque' : 'Add Cheque'} size="lg">
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Input label="Cheque Number" error={errors.chequeNumber?.message} {...register('chequeNumber')} placeholder="000123" />
            <Input label="Bank" error={errors.bankName?.message} {...register('bankName')} placeholder="Bank name" />
            <Input label="Branch" {...register('branch')} placeholder="Branch" />
            <Input label="Payee / Payer" error={errors.partyName?.message} {...register('partyName')} placeholder="Name" />
            <Select label="Type" options={[{ value: 'Received', label: 'Received' }, { value: 'Issued', label: 'Issued' }]} {...register('partyType')} />
            <Input label="Amount" type="number" step="0.01" min="0.01" error={errors.amount?.message} {...register('amount')} />
            <Input label="Issue Date" type="date" {...register('issueDate')} />
            <Input label="Due Date" type="date" error={errors.dueDate?.message} {...register('dueDate')} />
            <Select label="Status" options={chequeStatuses.map((status) => ({ value: status, label: status }))} {...register('status')} />
            <Input label="Reference" {...register('reference')} placeholder="Invoice or reference" className="md:col-span-2" />
          </div>
          <Textarea label="Notes" {...register('notes')} rows={2} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete Cheque" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">Delete cheque <strong>{deleting?.chequeNumber}</strong>?</p>
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
