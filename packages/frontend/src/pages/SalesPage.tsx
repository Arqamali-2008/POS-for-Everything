import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Table, Column, Pagination } from '../components/ui/Table';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { formatCurrency, formatDateTime, formatDate, cn } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import { printReceipt } from '../utils/print';
import {
  Search,
  Eye,
  RefreshCw,
  CreditCard,
  Download,
  Printer,
  Receipt,
  DollarSign,
  RotateCcw,
  Ban,
  PlayCircle,
} from 'lucide-react';
import { useToast } from '../components/ui/Toaster';

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'Completed', label: 'Completed' },
  { value: 'Held', label: 'Held' },
  { value: 'Partially Refunded', label: 'Partially Refunded' },
  { value: 'Refunded', label: 'Refunded' },
  { value: 'Cancelled', label: 'Cancelled' },
];

const paymentOptions = [
  { value: '', label: 'All Payments' },
  { value: 'Cash', label: 'Cash' },
  { value: 'Card', label: 'Card' },
  { value: 'UPI', label: 'UPI' },
  { value: 'Credit', label: 'Credit' },
];

function statusVariant(status: string) {
  switch (status) {
    case 'Completed':
      return 'success' as const;
    case 'Held':
      return 'warning' as const;
    case 'Cancelled':
    case 'Refunded':
      return 'danger' as const;
    case 'Partially Refunded':
      return 'info' as const;
    default:
      return 'default' as const;
  }
}

export function SalesPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedPayment, setSelectedPayment] = useState('');
  const [dateRange, setDateRange] = useState<{ from?: string; to?: string }>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const [selectedSale, setSelectedSale] = useState<any | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showRefund, setShowRefund] = useState(false);
  const [refundAmount, setRefundAmount] = useState(0);
  const [refundReason, setRefundReason] = useState('');
  const [restock, setRestock] = useState(true);

  const params = {
    search: searchQuery || undefined,
    status: selectedStatus || undefined,
    paymentType: selectedPayment || undefined,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    page: currentPage,
    limit: pageSize,
    sortBy: 'createdAt',
    sortOrder: 'desc' as const,
  };

  const { data: salesData, isLoading, refetch } = useQuery({
    queryKey: ['sales', params],
    queryFn: () => apiClient.sales.list(params),
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.settings.get(),
  });

  const sales = salesData?.data ?? [];
  const pagination = salesData?.pagination;
  const settings = settingsData?.data ?? {};

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sales'] });
    queryClient.invalidateQueries({ queryKey: ['pos-products'] });
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['customers'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stats'] });
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => apiClient.sales.cancel(id),
    onSuccess: () => {
      success('Sale cancelled', 'Stock and customer balance have been reversed');
      setShowDetail(false);
      invalidate();
    },
    onError: (err: any) => error('Cancel failed', err.message),
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, amountPaid }: { id: string; amountPaid?: number }) =>
      apiClient.sales.complete(id, { amountPaid }),
    onSuccess: () => {
      success('Held bill resumed', 'Stock has been deducted and the sale is complete');
      setShowDetail(false);
      invalidate();
    },
    onError: (err: any) => error('Could not resume bill', err.message),
  });

  const refundMutation = useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      apiClient.sales.refund(id, { amount, reason, restock }),
    onSuccess: () => {
      success('Refund processed', restock ? 'Items returned to stock' : 'Refund recorded');
      setShowRefund(false);
      setShowDetail(false);
      setRefundReason('');
      invalidate();
    },
    onError: (err: any) => error('Refund failed', err.message),
  });

  const openDetail = (sale: any) => {
    setSelectedSale(sale);
    setShowDetail(true);
  };

  const openRefund = (sale: any) => {
    setSelectedSale(sale);
    setRefundAmount(Math.max(0, Number(sale.grandTotal || 0) - Number(sale.refundAmount || 0)));
    setRefundReason('');
    setRestock(true);
    setShowRefund(true);
  };

  const exportCsv = async () => {
    try {
      const rows: any[] = [];
      let page = 1;
      for (;;) {
        const result = await apiClient.sales.list({ ...params, page, limit: 500 });
        const batch = result.data ?? [];
        rows.push(...batch);
        const totalPages = result.pagination?.totalPages ?? 1;
        if (page >= totalPages || batch.length === 0) break;
        page += 1;
      }
      downloadCsv(
        `sales-${new Date().toISOString().slice(0, 10)}`,
        rows.map((sale: any) => ({
          Invoice: sale.invoiceNo,
          Date: formatDateTime(sale.createdAt),
          Customer: sale.customerName,
          Cashier: sale.cashierName,
          Items: sale.items?.length ?? 0,
          Payment: sale.paymentType,
          Subtotal: sale.subtotal,
          Discount: sale.discountAmount,
          Tax: sale.taxAmount,
          Total: sale.grandTotal,
          Paid: sale.amountPaid,
          Balance: sale.balanceDue,
          Status: sale.status,
        })),
      );
      success('Export ready', `${rows.length} sales exported`);
    } catch (err) {
      error('Export failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const columns: Column<any>[] = [
    { key: 'invoiceNo', header: 'Invoice', accessor: 'invoiceNo', width: '140px' },
    { key: 'createdAt', header: 'Date & Time', accessor: 'createdAt', width: '160px', render: (v) => formatDateTime(v) },
    { key: 'customerName', header: 'Customer', accessor: 'customerName', width: '160px' },
    { key: 'cashierName', header: 'Cashier', accessor: 'cashierName', width: '120px' },
    { key: 'itemCount', header: 'Items', accessor: 'itemCount', width: '70px', align: 'center', render: (v: any, row: any) => row.itemCount ?? row.items?.length ?? 0 },
    { key: 'paymentType', header: 'Payment', accessor: 'paymentType', width: '110px', render: (v) => <StatusBadge status={v} size="sm" /> },
    { key: 'grandTotal', header: 'Total', accessor: 'grandTotal', width: '120px', align: 'right', render: (v) => formatCurrency(v) },
    { key: 'status', header: 'Status', accessor: 'status', width: '140px', align: 'center', render: (v) => <Badge variant={statusVariant(v)} size="sm">{v}</Badge> },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      width: '120px',
      align: 'center',
      render: (_v, row) => (
        <div className="flex items-center justify-center gap-1">
          <button onClick={() => openDetail(row)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700" aria-label="View details"><Eye className="h-4 w-4" /></button>
          <button onClick={() => printReceipt(row, settings)} className="p-2 rounded-lg text-secondary-500 hover:bg-secondary-100 dark:hover:bg-secondary-700" aria-label="Print receipt"><Printer className="h-4 w-4" /></button>
        </div>
      ),
    },
  ];

  const revenueSales = sales.filter(
    (sale: any) => !['Cancelled', 'Refunded', 'Held', 'Unpaid', 'Pending', 'Partial', 'Partially Refunded'].includes(String(sale.status)),
  );
  const netAmount = (sale: any) => Math.max(0, Number(sale.grandTotal || 0) - Number(sale.refundAmount || 0));
  const pageRevenue = revenueSales.reduce((sum: number, sale: any) => sum + netAmount(sale), 0);
  const cashRevenue = revenueSales.filter((sale: any) => sale.paymentType === 'Cash').reduce((sum: number, sale: any) => sum + netAmount(sale), 0);
  const cardRevenue = revenueSales.filter((sale: any) => ['Card', 'UPI'].includes(sale.paymentType)).reduce((sum: number, sale: any) => sum + netAmount(sale), 0);
  const creditRevenue = revenueSales.filter((sale: any) => sale.paymentType === 'Credit').reduce((sum: number, sale: any) => sum + netAmount(sale), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Sales History</h1>
          <p className="text-secondary-500 dark:text-secondary-400">View, refund, cancel and resume bills</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-col xl:flex-row gap-3">
          <Input placeholder="Search invoices, customer..." value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }} leftIcon={<Search className="h-5 w-5 text-secondary-400" />} className="flex-1 max-w-md" />
          <Select options={statusOptions} value={selectedStatus} onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }} className="w-44" />
          <Select options={paymentOptions} value={selectedPayment} onChange={(e) => { setSelectedPayment(e.target.value); setCurrentPage(1); }} className="w-40" />
          <div className="flex items-center gap-2">
            <Input type="date" value={dateRange.from || ''} onChange={(e) => { setDateRange({ ...dateRange, from: e.target.value }); setCurrentPage(1); }} className="w-40" />
            <span className="text-secondary-400">to</span>
            <Input type="date" value={dateRange.to || ''} onChange={(e) => { setDateRange({ ...dateRange, to: e.target.value }); setCurrentPage(1); }} className="w-40" />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Invoices" value={pagination?.total ?? 0} icon={Receipt} color="bg-blue-500" />
        <StatCard title="Revenue (page)" value={formatCurrency(pageRevenue)} icon={DollarSign} color="bg-green-500" />
        <StatCard title="Cash / Card+UPI" value={`${formatCurrency(cashRevenue)} / ${formatCurrency(cardRevenue)}`} icon={CreditCard} color="bg-purple-500" />
        <StatCard title="Credit" value={formatCurrency(creditRevenue)} icon={CreditCard} color="bg-amber-500" />
      </div>

      <Card>
        <Table
          columns={columns}
          data={sales}
          keyAccessor="id"
          loading={isLoading}
          emptyMessage="No sales found matching your criteria"
          striped
          hoverable
        />
        {pagination && pagination.total > 0 && (
          <Pagination
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.limit}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1); }}
            showPageSizeSelector
          />
        )}
      </Card>

      <Modal
        isOpen={showDetail}
        onClose={() => setShowDetail(false)}
        title={`Sale ${selectedSale?.invoiceNo ?? ''}`}
        size="lg"
        footer={selectedSale ? (
          <div className="flex flex-wrap justify-end gap-2 w-full">
            {selectedSale.status === 'Held' && (
              <Button onClick={() => completeMutation.mutate({ id: selectedSale.id, amountPaid: selectedSale.grandTotal })} loading={completeMutation.isPending}>
                <PlayCircle className="h-4 w-4 mr-2" />Resume & Complete
              </Button>
            )}
            {['Completed', 'Partially Refunded'].includes(selectedSale.status) && (
              <Button variant="outline" onClick={() => { setShowDetail(false); openRefund(selectedSale); }}>
                <RotateCcw className="h-4 w-4 mr-2" />Refund
              </Button>
            )}
            {['Completed', 'Partially Refunded'].includes(selectedSale.status) && (
              <Button variant="danger" onClick={() => {
                if (window.confirm(`Cancel ${selectedSale.invoiceNo}? Stock will be restored.`)) {
                  cancelMutation.mutate(selectedSale.id);
                }
              }} loading={cancelMutation.isPending}>
                <Ban className="h-4 w-4 mr-2" />Cancel Sale
              </Button>
            )}
            <Button variant="outline" onClick={() => printReceipt(selectedSale, settings)}>
              <Printer className="h-4 w-4 mr-2" />Print
            </Button>
          </div>
        ) : undefined}
      >
        {selectedSale && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-secondary-500">Invoice:</span> <span className="font-medium ml-2 font-mono">{selectedSale.invoiceNo}</span></div>
              <div><span className="text-secondary-500">Date:</span> <span className="font-medium ml-2">{formatDateTime(selectedSale.createdAt)}</span></div>
              <div><span className="text-secondary-500">Customer:</span> <span className="font-medium ml-2">{selectedSale.customerName}</span></div>
              <div><span className="text-secondary-500">Cashier:</span> <span className="font-medium ml-2">{selectedSale.cashierName}</span></div>
              <div><span className="text-secondary-500">Payment:</span> <span className="ml-2"><StatusBadge status={selectedSale.paymentType} size="sm" /></span></div>
              <div><span className="text-secondary-500">Status:</span> <span className="ml-2"><Badge variant={statusVariant(selectedSale.status)} size="sm">{selectedSale.status}</Badge></span></div>
            </div>

            <div className="border-t border-secondary-200 dark:border-secondary-700 pt-4">
              <h4 className="font-medium text-secondary-900 dark:text-white mb-3">Items</h4>
              <div className="space-y-2">
                {(selectedSale.items ?? []).map((item: any, index: number) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-secondary-900 dark:text-white">{item.name}</p>
                      <p className="text-sm text-secondary-500">
                        {item.quantity} × {formatCurrency(item.unitPrice)}
                        {item.discountAmount ? ` − ${formatCurrency(item.discountAmount)} discount` : ''}
                      </p>
                    </div>
                    <span className="font-semibold text-secondary-900 dark:text-white">{formatCurrency(item.lineTotal)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-secondary-200 dark:border-secondary-700 pt-4 grid grid-cols-2 gap-2 text-sm">
              <div className="flex justify-between"><span className="text-secondary-500">Subtotal</span><span>{formatCurrency(selectedSale.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-secondary-500">Discount</span><span>{formatCurrency(selectedSale.discountAmount)}</span></div>
              <div className="flex justify-between"><span className="text-secondary-500">Tax</span><span>{formatCurrency(selectedSale.taxAmount)}</span></div>
              <div className="flex justify-between"><span className="text-secondary-500">Paid</span><span>{formatCurrency(selectedSale.amountPaid)}</span></div>
              <div className="flex justify-between"><span className="text-secondary-500">Change</span><span>{formatCurrency(selectedSale.changeDue)}</span></div>
              <div className="flex justify-between"><span className="text-secondary-500">Balance</span><span>{formatCurrency(selectedSale.balanceDue)}</span></div>
              <div className="flex justify-between col-span-2 text-base font-bold border-t border-secondary-200 dark:border-secondary-700 pt-2"><span>Total</span><span>{formatCurrency(selectedSale.grandTotal)}</span></div>
              {Number(selectedSale.refundAmount) > 0 && (
                <div className="flex justify-between col-span-2 text-red-600 dark:text-red-400"><span>Refunded</span><span>{formatCurrency(selectedSale.refundAmount)}</span></div>
              )}
            </div>
            {selectedSale.note && (
              <p className="text-sm text-secondary-500">Note: {selectedSale.note}</p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={showRefund}
        onClose={() => setShowRefund(false)}
        title={`Refund ${selectedSale?.invoiceNo ?? ''}`}
        size="md"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button variant="outline" onClick={() => setShowRefund(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={refundMutation.isPending}
              onClick={() => {
                if (!selectedSale) return;
                const remaining = Math.max(0, Number(selectedSale.grandTotal || 0) - Number(selectedSale.refundAmount || 0));
                if (refundAmount <= 0) {
                  error('Invalid amount', 'Refund amount must be greater than zero');
                  return;
                }
                if (refundAmount > remaining) {
                  error('Amount too high', `Only ${formatCurrency(remaining)} remains refundable`);
                  return;
                }
                refundMutation.mutate({ id: selectedSale.id, amount: refundAmount, reason: refundReason });
              }}
            >
              Process Refund
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-secondary-500">
            This will mark the sale as refunded and, if enabled, return all remaining items to stock.
          </p>
          <Input label="Refund Amount" type="number" min={0} step="0.01" value={refundAmount} onChange={(e) => setRefundAmount(Number(e.target.value) || 0)} />
          <Input label="Reason" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Damaged, customer return, wrong item..." />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} className="h-4 w-4 rounded border-secondary-300 text-primary-600" />
            Return items to stock
          </label>
        </div>
      </Modal>
    </div>
  );
}

function StatCard({ title, value, icon: Icon, color }: { title: string; value: string | number; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-secondary-500 dark:text-secondary-400">{title}</p>
          <p className="text-lg sm:text-xl font-bold text-secondary-900 dark:text-white mt-1 truncate">{value}</p>
        </div>
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
      </div>
    </Card>
  );
}
