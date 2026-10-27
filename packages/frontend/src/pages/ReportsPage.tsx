import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import { useToast } from '../components/ui/Toaster';
import {
  TrendingUp,
  Receipt,
  Wallet,
  Download,
  Package,
  Users,
  BarChart3,
  PieChart,
  Trophy,
} from 'lucide-react';

const periodOptions = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
];

export function ReportsPage() {
  const { success } = useToast();
  const [period, setPeriod] = useState('this_month');

  const { data: salesData, isLoading: loadingSales } = useQuery({
    queryKey: ['reports-sales', period],
    queryFn: () => apiClient.stats.sales({ period }),
  });

  const { data: dashboardData } = useQuery({
    queryKey: ['reports-dashboard', period],
    queryFn: () => apiClient.stats.dashboard({ period }),
  });

  const { data: inventoryData } = useQuery({
    queryKey: ['reports-inventory'],
    queryFn: () => apiClient.stats.inventory(),
  });

  const { data: customersData } = useQuery({
    queryKey: ['reports-customers'],
    queryFn: () => apiClient.stats.customers(),
  });

  const sales = salesData?.data;
  const dashboardSummary = dashboardData?.data?.summary;
  const inventory = inventoryData?.data;
  const customers = customersData?.data;

  const totalRevenue = sales?.summary?.totalRevenue || 0;
  const maxCategoryRevenue = Math.max(1, ...(sales?.byCategory ?? []).map((entry: any) => entry.revenue));
  const maxProductRevenue = Math.max(1, ...(sales?.topProducts ?? []).map((entry: any) => entry.revenue));

  const exportSales = () => {
    downloadCsv(
      `sales-report-${period}-${new Date().toISOString().slice(0, 10)}`,
      (sales?.daily ?? []).map((entry: any) => ({ Date: entry.date, Sales: entry.count, Revenue: entry.revenue })),
    );
    success('Export ready', 'Sales report downloaded');
  };

  const exportProducts = () => {
    downloadCsv(
      `product-report-${period}-${new Date().toISOString().slice(0, 10)}`,
      (sales?.topProducts ?? []).map((entry: any) => ({
        Product: entry.name,
        Quantity: entry.quantity,
        Revenue: entry.revenue,
        Profit: entry.profit,
      })),
    );
    success('Export ready', 'Product report downloaded');
  };

  const exportCustomers = () => {
    downloadCsv(
      `customer-report-${new Date().toISOString().slice(0, 10)}`,
      (customers?.topCustomers ?? []).map((entry: any) => ({
        Customer: entry.name,
        TotalSpent: entry.totalSpent,
        Balance: entry.balance,
      })),
    );
    success('Export ready', 'Customer report downloaded');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Reports</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Sales, inventory and customer insights</p>
        </div>
        <div className="flex gap-2">
          <Select options={periodOptions} value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
          <Button variant="outline" onClick={exportSales}><Download className="h-4 w-4 mr-2" />Sales CSV</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi title="Revenue" value={formatCurrency(totalRevenue)} icon={TrendingUp} color="bg-green-500" loading={loadingSales} />
        <Kpi title="Sales" value={formatNumber(sales?.summary?.totalSales || 0)} icon={Receipt} color="bg-blue-500" loading={loadingSales} />
        <Kpi title="Average Sale" value={formatCurrency(sales?.summary?.averageValue || 0)} icon={Wallet} color="bg-purple-500" loading={loadingSales} />
        <Kpi title="Profit" value={formatCurrency(dashboardSummary?.profit || 0)} icon={BarChart3} color="bg-orange-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center gap-2"><PieChart className="h-5 w-5 text-primary-500" />Payment Methods</h2>
            <span className="text-sm text-secondary-500">{formatNumber(sales?.byPayment?.length || 0)} methods</span>
          </div>
          <div className="space-y-3">
            {(sales?.byPayment ?? []).map((entry: any) => {
              const percent = totalRevenue ? (entry.revenue / totalRevenue) * 100 : 0;
              return (
                <div key={entry.paymentType || entry.payment_type}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-secondary-700 dark:text-secondary-300">{entry.paymentType || entry.payment_type}</span>
                    <span className="font-medium text-secondary-900 dark:text-white">{formatCurrency(entry.revenue)} · {percent.toFixed(1)}%</span>
                  </div>
                  <div className="h-2 w-full bg-secondary-100 dark:bg-secondary-700 rounded-full">
                    <div className="h-2 bg-primary-500 rounded-full" style={{ width: `${Math.min(100, percent)}%` }} />
                  </div>
                  <p className="text-xs text-secondary-500 mt-1">{formatNumber(entry.count)} transactions</p>
                </div>
              );
            })}
            {!sales?.byPayment?.length && <Empty text="No sales in this period" />}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center gap-2"><BarChart3 className="h-5 w-5 text-blue-500" />Daily Sales</h2>
          </div>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {(sales?.daily ?? []).slice().reverse().map((entry: any) => {
              const percent = totalRevenue ? (entry.revenue / totalRevenue) * 100 : 0;
              return (
                <div key={entry.date} className="flex items-center gap-3">
                  <span className="text-xs text-secondary-500 w-24 flex-shrink-0">{entry.date}</span>
                  <div className="flex-1 h-2 bg-secondary-100 dark:bg-secondary-700 rounded-full">
                    <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${Math.max(2, Math.min(100, percent))}%` }} />
                  </div>
                  <span className="text-xs font-medium text-secondary-900 dark:text-white w-24 text-right">{formatCurrency(entry.revenue)}</span>
                </div>
              );
            })}
            {!sales?.daily?.length && <Empty text="No daily sales data" />}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" />Top Products</h2>
          <Button variant="outline" size="sm" onClick={exportProducts}><Download className="h-4 w-4 mr-2" />Export</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary-200 dark:border-secondary-700">
                <th className="text-left px-3 py-2 text-xs font-medium text-secondary-500 uppercase">#</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-secondary-500 uppercase">Product</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-secondary-500 uppercase">Qty</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-secondary-500 uppercase">Revenue share</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-secondary-500 uppercase">Revenue</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-secondary-500 uppercase">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200 dark:divide-secondary-700">
              {(sales?.topProducts ?? []).slice(0, 10).map((entry: any, index: number) => (
                <tr key={entry.productId} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                  <td className="px-3 py-2 text-sm text-secondary-500">{index + 1}</td>
                  <td className="px-3 py-2 text-sm font-medium text-secondary-900 dark:text-white">{entry.name}</td>
                  <td className="px-3 py-2 text-sm text-right text-secondary-600 dark:text-secondary-400">{formatNumber(entry.quantity)}</td>
                  <td className="px-3 py-2">
                    <div className="h-2 w-40 bg-secondary-100 dark:bg-secondary-700 rounded-full">
                      <div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, (entry.revenue / maxProductRevenue) * 100)}%` }} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-sm text-right font-medium text-secondary-900 dark:text-white">{formatCurrency(entry.revenue)}</td>
                  <td className="px-3 py-2 text-sm text-right text-green-600">{formatCurrency(entry.profit)}</td>
                </tr>
              ))}
              {!sales?.topProducts?.length && (
                <tr><td colSpan={6}><Empty text="No product sales in this period" /></td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4 flex items-center gap-2"><Package className="h-5 w-5 text-blue-500" />Sales by Category</h2>
          <div className="space-y-3">
            {(sales?.byCategory ?? []).map((entry: any) => (
              <div key={entry.category}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-secondary-700 dark:text-secondary-300">{entry.category}</span>
                  <span className="font-medium text-secondary-900 dark:text-white">{formatCurrency(entry.revenue)}</span>
                </div>
                <div className="h-2 w-full bg-secondary-100 dark:bg-secondary-700 rounded-full">
                  <div className="h-2 bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, (entry.revenue / maxCategoryRevenue) * 100)}%` }} />
                </div>
              </div>
            ))}
            {!sales?.byCategory?.length && <Empty text="No category data" />}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-purple-500" />Cashier Performance</h2>
          <div className="space-y-3">
            {(sales?.byCashier ?? []).map((entry: any) => (
              <div key={entry.cashier} className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg">
                <div>
                  <p className="font-medium text-secondary-900 dark:text-white">{entry.cashier}</p>
                  <p className="text-xs text-secondary-500">{formatNumber(entry.count)} sales</p>
                </div>
                <span className="font-semibold text-secondary-900 dark:text-white">{formatCurrency(entry.revenue)}</span>
              </div>
            ))}
            {!sales?.byCashier?.length && <Empty text="No cashier data" />}
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4 flex items-center gap-2"><Package className="h-5 w-5 text-amber-500" />Inventory Summary</h2>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <SummaryTile label="Inventory Value" value={formatCurrency(inventory?.inventoryValue || 0)} />
            <SummaryTile label="Retail Value" value={formatCurrency(inventory?.retailValue || 0)} />
            <SummaryTile label="Low Stock" value={formatNumber(inventory?.lowStockProducts || 0)} warning />
            <SummaryTile label="Out of Stock" value={formatNumber(inventory?.outOfStockProducts || 0)} danger />
          </div>
          <div className="space-y-2">
            {(inventory?.categoryBreakdown ?? []).map((entry: any) => (
              <div key={entry.category} className="flex items-center justify-between text-sm">
                <span className="text-secondary-600 dark:text-secondary-400">{entry.category} <span className="text-secondary-400">· {entry.count}</span></span>
                <span className="font-medium text-secondary-900 dark:text-white">{formatCurrency(entry.value)}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center gap-2"><Users className="h-5 w-5 text-green-500" />Customer Summary</h2>
            <Button variant="outline" size="sm" onClick={exportCustomers}><Download className="h-4 w-4 mr-2" />Export</Button>
          </div>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <SummaryTile label="Customers" value={formatNumber(customers?.totalCustomers || 0)} />
            <SummaryTile label="Active" value={formatNumber(customers?.activeCustomers || 0)} />
            <SummaryTile label="New This Month" value={formatNumber(customers?.newCustomers || 0)} />
            <SummaryTile label="Outstanding" value={formatCurrency(customers?.outstandingBalance || 0)} warning />
          </div>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {(customers?.topCustomers ?? []).map((entry: any, index: number) => (
              <div key={entry.id} className="flex items-center justify-between text-sm">
                <span className="text-secondary-600 dark:text-secondary-400">{index + 1}. {entry.name}</span>
                <span className="font-medium text-secondary-900 dark:text-white">{formatCurrency(entry.totalSpent)}</span>
              </div>
            ))}
            {!customers?.topCustomers?.length && <Empty text="No customer data" />}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-secondary-500">
          <span>Period: <strong className="text-secondary-900 dark:text-white">{periodOptions.find((option) => option.value === period)?.label}</strong></span>
          <div className="flex gap-2">
            <Badge variant="success">Revenue {formatCurrency(totalRevenue)}</Badge>
            <Badge variant="warning">Expenses {formatCurrency(dashboardSummary?.expenses || 0)}</Badge>
            <Badge variant={Number(dashboardSummary?.profit) >= 0 ? 'success' : 'danger'}>Profit {formatCurrency(dashboardSummary?.profit || 0)}</Badge>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ title, value, icon: Icon, color, loading }: { title: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string; loading?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${color}`}><Icon className="h-5 w-5 text-white" /></div>
        <div>
          <p className="text-sm text-secondary-500 dark:text-secondary-400">{title}</p>
          <p className="text-xl font-bold text-secondary-900 dark:text-white">{loading ? '...' : value}</p>
        </div>
      </div>
    </Card>
  );
}

function SummaryTile({ label, value, warning, danger }: { label: string; value: string; warning?: boolean; danger?: boolean }) {
  return (
    <div className="p-3 rounded-lg bg-secondary-50 dark:bg-secondary-800/50">
      <p className="text-xs text-secondary-500">{label}</p>
      <p className={`text-lg font-semibold ${danger ? 'text-red-600' : warning ? 'text-amber-600' : 'text-secondary-900 dark:text-white'}`}>{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-sm text-secondary-500 text-center py-6">{text}</p>;
}
