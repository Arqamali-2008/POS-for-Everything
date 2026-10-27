import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatDate } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import { Plus, Search, Edit, Trash2, Users, UserCheck, Wallet, Download, Mail, Phone } from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const employeeSchema = z.object({
  employeeCode: z.string().min(1, 'Employee code is required'),
  fullName: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  joinDate: z.string().optional(),
  salary: z.coerce.number().nonnegative().default(0),
  address: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type EmployeeForm = z.infer<typeof employeeSchema>;

const defaultValues: EmployeeForm = {
  employeeCode: '', fullName: '', email: '', phone: '', designation: '', department: '',
  joinDate: new Date().toISOString().slice(0, 10), salary: 0, address: '', notes: '', isActive: true,
};

export function EmployeesPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['employees', search],
    queryFn: () => apiClient.employees.list({ search: search || undefined, limit: 500 }),
  });

  const employees = data?.data ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues,
  });

  const createMutation = useMutation({
    mutationFn: (values: EmployeeForm) => apiClient.employees.create(values),
    onSuccess: () => { success('Employee added'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to add employee', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: EmployeeForm }) => apiClient.employees.update(id, values),
    onSuccess: () => { success('Employee updated'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to update employee', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.employees.delete(id),
    onSuccess: () => { success('Employee removed'); setDeleting(null); invalidate(); },
    onError: (err: any) => error('Failed to remove employee', err.message),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['employees'] });
  const closeModal = () => { setShowModal(false); setEditing(null); };

  const openCreate = () => {
    setEditing(null);
    reset({ ...defaultValues, employeeCode: `EMP-${String(employees.length + 1).padStart(3, '0')}` });
    setShowModal(true);
  };

  const openEdit = (employee: any) => {
    setEditing(employee);
    reset({
      employeeCode: employee.employeeCode ?? '',
      fullName: employee.fullName ?? '',
      email: employee.email ?? '',
      phone: employee.phone ?? '',
      designation: employee.designation ?? '',
      department: employee.department ?? '',
      joinDate: employee.joinDate ? String(employee.joinDate).slice(0, 10) : '',
      salary: Number(employee.salary || 0),
      address: employee.address ?? '',
      notes: employee.notes ?? '',
      isActive: employee.isActive !== false,
    });
    setShowModal(true);
  };

  const submit = (values: EmployeeForm) => {
    if (editing) updateMutation.mutate({ id: editing.id, values });
    else createMutation.mutate(values);
  };

  const activeEmployees = employees.filter((employee: any) => employee.isActive !== false);
  const payroll = activeEmployees.reduce((sum: number, employee: any) => sum + Number(employee.salary || 0), 0);

  const exportCsv = () => {
    downloadCsv(
      `employees-${new Date().toISOString().slice(0, 10)}`,
      employees.map((employee: any) => ({
        Code: employee.employeeCode,
        Name: employee.fullName,
        Designation: employee.designation,
        Department: employee.department,
        Phone: employee.phone,
        Email: employee.email,
        JoinDate: employee.joinDate,
        Salary: employee.salary,
        Status: employee.isActive === false ? 'Inactive' : 'Active',
      })),
    );
    success('Export ready', 'Employees CSV downloaded');
  };

  const columns: Column<any>[] = [
    {
      key: 'fullName',
      header: 'Employee',
      accessor: 'fullName',
      render: (value, row) => (
        <div>
          <p className="font-medium text-secondary-900 dark:text-white">{value}</p>
          <p className="text-xs text-secondary-500 font-mono">{row.employeeCode}</p>
        </div>
      ),
    },
    {
      key: 'designation',
      header: 'Role',
      accessor: 'designation',
      render: (value, row) => (
        <div>
          <p className="text-secondary-700 dark:text-secondary-300">{value || '-'}</p>
          {row.department && <p className="text-xs text-secondary-500">{row.department}</p>}
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      accessor: 'phone',
      render: (_v, row) => (
        <div className="space-y-1 text-sm">
          {row.phone && <p className="flex items-center gap-1 text-secondary-600 dark:text-secondary-400"><Phone className="h-3.5 w-3.5" />{row.phone}</p>}
          {row.email && <p className="flex items-center gap-1 text-secondary-600 dark:text-secondary-400"><Mail className="h-3.5 w-3.5" />{row.email}</p>}
          {!row.phone && !row.email && <span className="text-secondary-400">-</span>}
        </div>
      ),
    },
    { key: 'joinDate', header: 'Joined', accessor: 'joinDate', width: '120px', render: (value) => (value ? formatDate(value) : '-') },
    { key: 'salary', header: 'Salary', accessor: 'salary', align: 'right', width: '120px', render: (value) => formatCurrency(value) },
    {
      key: 'status',
      header: 'Status',
      accessor: 'isActive',
      align: 'center',
      width: '100px',
      render: (value) => <Badge variant={value === false ? 'default' : 'success'} size="sm">{value === false ? 'Inactive' : 'Active'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      width: '90px',
      align: 'center',
      render: (_v, row) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => openEdit(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700" aria-label="Edit"><Edit className="h-4 w-4" /></button>
          <button onClick={() => setDeleting(row)} className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Employees</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Manage staff records and payroll details</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Employee</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center"><Users className="h-5 w-5 text-white" /></div><div><p className="text-sm text-secondary-500">Total Employees</p><p className="text-2xl font-bold text-secondary-900 dark:text-white">{employees.length}</p></div></div></Card>
        <Card className="p-4"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-green-500 flex items-center justify-center"><UserCheck className="h-5 w-5 text-white" /></div><div><p className="text-sm text-secondary-500">Active</p><p className="text-2xl font-bold text-secondary-900 dark:text-white">{activeEmployees.length}</p></div></div></Card>
        <Card className="p-4"><div className="flex items-center gap-3"><div className="h-10 w-10 rounded-xl bg-purple-500 flex items-center justify-center"><Wallet className="h-5 w-5 text-white" /></div><div><p className="text-sm text-secondary-500">Monthly Payroll</p><p className="text-2xl font-bold text-secondary-900 dark:text-white">{formatCurrency(payroll)}</p></div></div></Card>
      </div>

      <Card className="p-4">
        <Input placeholder="Search employees by name, code or role..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="max-w-md" />
      </Card>

      <Card>
        <Table columns={columns} data={employees} keyAccessor="id" loading={isLoading} emptyMessage="No employees yet. Add staff records to track roles and payroll." striped hoverable />
      </Card>

      <Modal isOpen={showModal} onClose={closeModal} title={editing ? 'Edit Employee' : 'Add Employee'} size="lg">
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Employee Code" error={errors.employeeCode?.message} {...register('employeeCode')} placeholder="EMP-001" />
            <Input label="Full Name" error={errors.fullName?.message} {...register('fullName')} placeholder="Full name" />
            <Input label="Email" type="email" error={errors.email?.message} {...register('email')} placeholder="employee@example.com" />
            <Input label="Phone" {...register('phone')} placeholder="+94 77 123 4567" />
            <Input label="Designation" {...register('designation')} placeholder="Cashier" />
            <Select
              label="Department"
              options={[
                { value: '', label: 'Select department' },
                { value: 'Sales', label: 'Sales' },
                { value: 'Inventory', label: 'Inventory' },
                { value: 'Accounts', label: 'Accounts' },
                { value: 'Management', label: 'Management' },
                { value: 'Operations', label: 'Operations' },
              ]}
              {...register('department')}
            />
            <Input label="Join Date" type="date" {...register('joinDate')} />
            <Input label="Monthly Salary" type="number" step="0.01" min="0" {...register('salary')} />
            <Input label="Address" {...register('address')} className="md:col-span-2" />
          </div>
          <Textarea label="Notes" {...register('notes')} rows={2} />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-secondary-300 text-primary-600" {...register('isActive')} />
            <span className="text-sm text-secondary-700 dark:text-secondary-300">Currently employed</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Remove Employee" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">
          Remove <strong>{deleting?.fullName}</strong> from the employee list?
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleting && deleteMutation.mutate(deleting.id)} loading={deleteMutation.isPending}>Remove</Button>
        </div>
      </Modal>
    </div>
  );
}
