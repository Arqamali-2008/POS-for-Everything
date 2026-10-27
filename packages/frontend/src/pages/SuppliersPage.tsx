import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { downloadCsv } from '../utils/csv';
import { Plus, Search, Edit, Trash2, Phone, Mail, Building2, Download, Truck } from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const supplierSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true),
});

type SupplierForm = z.infer<typeof supplierSchema>;

const defaultValues: SupplierForm = {
  name: '', contactPerson: '', phone: '', email: '', address: '', city: '', notes: '', isActive: true,
};

export function SuppliersPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', search],
    queryFn: () => apiClient.suppliers.list({ search: search || undefined, limit: 500 }),
  });

  const { data: purchasesData } = useQuery({
    queryKey: ['purchases', 'supplier-counts'],
    queryFn: () => apiClient.purchases.list({ limit: 1000 }),
  });

  const suppliers = data?.data ?? [];
  const purchases = purchasesData?.data ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<SupplierForm>({
    resolver: zodResolver(supplierSchema),
    defaultValues,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    queryClient.invalidateQueries({ queryKey: ['purchases'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: SupplierForm) => apiClient.suppliers.create(values),
    onSuccess: () => { success('Supplier created'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to create supplier', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: SupplierForm }) => apiClient.suppliers.update(id, values),
    onSuccess: () => { success('Supplier updated'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to update supplier', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.suppliers.delete(id),
    onSuccess: () => { success('Supplier deleted'); setDeleting(null); invalidate(); },
    onError: (err: any) => error('Failed to delete supplier', err.message),
  });

  const closeModal = () => { setShowModal(false); setEditing(null); };
  const openCreate = () => { setEditing(null); reset(defaultValues); setShowModal(true); };
  const openEdit = (supplier: any) => {
    setEditing(supplier);
    reset({
      name: supplier.name ?? '',
      contactPerson: supplier.contactPerson ?? '',
      phone: supplier.phone ?? '',
      email: supplier.email ?? '',
      address: supplier.address ?? '',
      city: supplier.city ?? '',
      notes: supplier.notes ?? '',
      isActive: supplier.isActive !== false,
    });
    setShowModal(true);
  };

  const submit = (values: SupplierForm) => {
    if (editing) updateMutation.mutate({ id: editing.id, values });
    else createMutation.mutate(values);
  };

  const purchaseCount = (supplierId: string) =>
    purchases.filter((purchase: any) => purchase.supplierId === supplierId).length;

  const exportCsv = () => {
    downloadCsv(
      `suppliers-${new Date().toISOString().slice(0, 10)}`,
      suppliers.map((supplier: any) => ({
        Name: supplier.name,
        Contact: supplier.contactPerson,
        Phone: supplier.phone,
        Email: supplier.email,
        Address: supplier.address,
        City: supplier.city,
        Purchases: purchaseCount(supplier.id),
      })),
    );
    success('Export ready', 'Suppliers CSV downloaded');
  };

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Supplier',
      accessor: 'name',
      render: (value, row) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Building2 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="font-medium text-secondary-900 dark:text-white">{value}</p>
            {row.contactPerson && <p className="text-sm text-secondary-500">{row.contactPerson}</p>}
          </div>
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
    { key: 'city', header: 'City', accessor: 'city', width: '120px', render: (value) => value || '-' },
    {
      key: 'purchases',
      header: 'Orders',
      accessor: 'id',
      align: 'center',
      width: '90px',
      render: (_v, row) => <span className="text-secondary-600 dark:text-secondary-400">{purchaseCount(row.id)}</span>,
    },
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
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Suppliers</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Manage vendors and purchase sources</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Supplier</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500 flex items-center justify-center"><Truck className="h-5 w-5 text-white" /></div>
            <div><p className="text-sm text-secondary-500">Total Suppliers</p><p className="text-2xl font-bold text-secondary-900 dark:text-white">{suppliers.length}</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-green-500 flex items-center justify-center"><Building2 className="h-5 w-5 text-white" /></div>
            <div><p className="text-sm text-secondary-500">Active</p><p className="text-2xl font-bold text-secondary-900 dark:text-white">{suppliers.filter((s: any) => s.isActive !== false).length}</p></div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-purple-500 flex items-center justify-center"><Truck className="h-5 w-5 text-white" /></div>
            <div><p className="text-sm text-secondary-500">Purchase Orders</p><p className="text-2xl font-bold text-secondary-900 dark:text-white">{purchases.length}</p></div>
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <Input placeholder="Search suppliers by name, phone or email..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="max-w-md" />
      </Card>

      <Card>
        <Table columns={columns} data={suppliers} keyAccessor="id" loading={isLoading} emptyMessage="No suppliers yet. Add a supplier to start creating purchase orders." striped hoverable />
      </Card>

      <Modal isOpen={showModal} onClose={closeModal} title={editing ? 'Edit Supplier' : 'Add Supplier'} size="lg">
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input label="Company Name" error={errors.name?.message} {...register('name')} placeholder="Supplier name" />
            <Input label="Contact Person" {...register('contactPerson')} placeholder="Full name" />
            <Input label="Phone" {...register('phone')} placeholder="+94 11 234 5678" />
            <Input label="Email" type="email" error={errors.email?.message} {...register('email')} placeholder="supplier@example.com" />
            <Input label="City" {...register('city')} placeholder="Colombo" />
            <Input label="Address" {...register('address')} placeholder="Street address" />
          </div>
          <Textarea label="Notes" {...register('notes')} rows={3} placeholder="Payment terms, delivery schedule..." />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-secondary-300 text-primary-600" {...register('isActive')} />
            <span className="text-sm text-secondary-700 dark:text-secondary-300">Active supplier</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete Supplier" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">
          Delete <strong>{deleting?.name}</strong>? Purchase orders will keep their supplier name.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleting && deleteMutation.mutate(deleting.id)} loading={deleteMutation.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
