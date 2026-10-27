import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { formatNumber, cn } from '../utils/helpers';
import { Plus, Search, Edit, Trash2, FolderTree, Package } from 'lucide-react';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const categorySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

type CategoryForm = z.infer<typeof categorySchema>;

const defaultValues: CategoryForm = { name: '', description: '', isActive: true };

export function CategoriesPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [deleting, setDeleting] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['categories', search],
    queryFn: () => apiClient.categories.list({ search: search || undefined, limit: 500 }),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'category-counts'],
    queryFn: () => apiClient.products.list({ limit: 1000 }),
  });

  const categories = data?.data ?? [];
  const products = productsData?.data ?? [];

  const { register, handleSubmit, reset, formState: { errors } } = useForm<CategoryForm>({
    resolver: zodResolver(categorySchema),
    defaultValues,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['categories'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
  };

  const createMutation = useMutation({
    mutationFn: (values: CategoryForm) => apiClient.categories.create(values),
    onSuccess: () => { success('Category created'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to create category', err.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, values }: { id: string; values: CategoryForm }) => apiClient.categories.update(id, values),
    onSuccess: () => { success('Category updated'); closeModal(); invalidate(); },
    onError: (err: any) => error('Failed to update category', err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.categories.delete(id),
    onSuccess: () => { success('Category deleted'); setDeleting(null); invalidate(); },
    onError: (err: any) => error('Failed to delete category', err.message),
  });

  const closeModal = () => { setShowModal(false); setEditing(null); };

  const openCreate = () => { setEditing(null); reset(defaultValues); setShowModal(true); };

  const openEdit = (category: any) => {
    setEditing(category);
    reset({ name: category.name ?? '', description: category.description ?? '', isActive: category.isActive !== false });
    setShowModal(true);
  };

  const submit = (values: CategoryForm) => {
    if (editing) updateMutation.mutate({ id: editing.id, values });
    else createMutation.mutate(values);
  };

  const productCount = (categoryId: string) =>
    products.filter((product: any) => product.categoryId === categoryId).length;

  const columns: Column<any>[] = [
    {
      key: 'name',
      header: 'Category',
      accessor: 'name',
      render: (value) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <FolderTree className="h-4 w-4 text-primary-600 dark:text-primary-400" />
          </div>
          <span className="font-medium text-secondary-900 dark:text-white">{value}</span>
        </div>
      ),
    },
    { key: 'description', header: 'Description', accessor: 'description', render: (value) => value || '-' },
    {
      key: 'products',
      header: 'Products',
      accessor: 'id',
      align: 'center',
      width: '110px',
      render: (_v, row) => (
        <span className="inline-flex items-center gap-1 text-secondary-600 dark:text-secondary-400">
          <Package className="h-3.5 w-3.5" />{formatNumber(productCount(row.id))}
        </span>
      ),
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
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Categories</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Organize products into groups</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add Category</Button>
      </div>

      <Card className="p-4">
        <Input placeholder="Search categories..." value={search} onChange={(e) => setSearch(e.target.value)} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="max-w-md" />
      </Card>

      <Card>
        <Table columns={columns} data={categories} keyAccessor="id" loading={isLoading} emptyMessage="No categories yet. Add one to group your products." striped hoverable />
      </Card>

      <Modal isOpen={showModal} onClose={closeModal} title={editing ? 'Edit Category' : 'Add Category'} size="md">
        <form onSubmit={handleSubmit(submit)} className="space-y-4">
          <Input label="Name" error={errors.name?.message} {...register('name')} placeholder="e.g. Beverages" />
          <Textarea label="Description" {...register('description')} rows={3} placeholder="Optional description" />
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="h-4 w-4 rounded border-secondary-300 text-primary-600" {...register('isActive')} />
            <span className="text-sm text-secondary-700 dark:text-secondary-300">Active</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={closeModal}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending || updateMutation.isPending}>{editing ? 'Update' : 'Create'}</Button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!deleting} onClose={() => setDeleting(null)} title="Delete Category" size="sm">
        <p className={cn('text-secondary-600 dark:text-secondary-400')}>
          Delete <strong>{deleting?.name}</strong>? Products in this category will become uncategorized.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setDeleting(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => deleting && deleteMutation.mutate(deleting.id)} loading={deleteMutation.isPending}>Delete</Button>
        </div>
      </Modal>
    </div>
  );
}
