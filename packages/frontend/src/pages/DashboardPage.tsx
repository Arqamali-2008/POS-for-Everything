import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge, StatusBadge } from '../components/ui/Badge';
import { Select } from '../components/ui/Input';
import { cn, formatCurrency, formatNumber } from '../utils/helpers';
import {
  Package,
  Users,
  Receipt,
  TrendingUp,
  CreditCard,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  AlertTriangle,
  Smartphone,
  Banknote,
} from 'lucide-react';

const periodOptions = [
  { value: 'today', label: 'Today' },
  { value: 'this_week', label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
];

const paymentIcons: Record<string, { icon: React.ComponentType<{ className?: string }>; classes: string }> = {
  Cash: { icon: Banknote, classes: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' },
  Card: { icon: CreditCard, classes: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400' },
  UPI: { icon: Smartphone, classes: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' },
  Credit: { icon: CreditCard, classes: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/30 dark:text-yellow-400' },
};

export function DashboardPage() {
  const [period, setPeriod] = useState('today');

  const { data: stats, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['dashboard-stats', period],
    queryFn: () => apiClient.stats.dashboard({ period }),
    refetchInterval: 30000,
  });

  const { data: salesStats } = useQuery({
    queryKey: ['sales-stats', period],
    queryFn: () => apiClient.stats.sales({ period }),
  });

  const { data: inventoryStats } = useQuery({
    queryKey: ['inventory-stats'],
    queryFn: () => apiClient.stats.inventory(),
  });

  const statsData = stats?.data;
  const salesData = salesStats?.data;
  const inventoryData = inventoryStats?.data;
  const summary = statsData?.summary;
  const totalPayments = salesData?.summary?.totalRevenue || 0;
  const lowStockItems = statsData?.lowStockItems ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Dashboard</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Welcome back! Here's what's happening {period === 'today' ? 'today' : period === 'this_week' ? 'this week' : 'this month'}.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select options={periodOptions} value={period} onChange={(e) => setPeriod(e.target.value)} className="w-40" />
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Products"
          value={summary?.products || 0}
          icon={Package}
          color="bg-blue-500"
          trend={summary?.lowStockAlerts ? { value: summary.lowStockAlerts, label: 'low stock alerts', negative: true } : null}
        />
        <StatCard title="Customers" value={summary?.customers || 0} icon={Users} color="bg-green-500" />
        <StatCard title="Sales" value={summary?.sales?.count || 0} icon={Receipt} color="bg-purple-500" />
        <StatCard
          title="Revenue"
          value={formatCurrency(summary?.sales?.totalRevenue || 0)}
          icon={TrendingUp}
          color="bg-orange-500"
          trend={
            summary?.sales?.averageValue
              ? { value: formatCurrency(summary.sales.averageValue), label: 'avg. sale', positive: true }
              : null
          }
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat label="Expenses" value={formatCurrency(summary?.expenses || 0)} tone="red" />
        <MiniStat label="Profit" value={formatCurrency(summary?.profit || 0)} tone={Number(summary?.profit) >= 0 ? 'green' : 'red'} />
        <MiniStat label="Stock Value" value={formatCurrency(inventoryData?.inventoryValue || 0)} tone="blue" />
        <MiniStat label="Out of Stock" value={formatNumber(inventoryData?.outOfStockProducts || 0)} tone={inventoryData?.outOfStockProducts ? 'red' : 'green'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Payment Breakdown</h2>
            <span className="text-sm text-secondary-500">{formatCurrency(totalPayments)}</span>
          </div>
          <div className="space-y-4">
            {salesData?.byPayment?.map((payment: any) => {
              const type = payment.paymentType || payment.payment_type;
              const meta = paymentIcons[type] ?? { icon: CreditCard, classes: 'bg-secondary-100 text-secondary-600 dark:bg-secondary-800 dark:text-secondary-300' };
              const Icon = meta.icon;
              return (
                <div key={type} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', meta.classes)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-medium text-secondary-900 dark:text-white">{type}</p>
                      <p className="text-sm text-secondary-500">{formatNumber(payment.count)} transactions</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-secondary-900 dark:text-white">{formatCurrency(payment.revenue)}</p>
                    <p className="text-sm text-secondary-500">
                      {((payment.revenue / (totalPayments || 1)) * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
              );
            })}
            {!salesData?.byPayment?.length && (
              <EmptyState message={isLoading ? 'Loading...' : 'No sales in this period'} />
            )}
          </div>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Low Stock Alerts</h2>
            <Badge variant={(inventoryData?.lowStockProducts || 0) > 0 ? 'warning' : 'success'}>
              {inventoryData?.lowStockProducts || 0} items
            </Badge>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {lowStockItems.slice(0, 6).map((product: any) => (
              <div key={product.id} className="flex items-center justify-between p-3 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-secondary-900 dark:text-white truncate">{product.name}</p>
                    <p className="text-sm text-secondary-500">Min: {formatNumber(product.minStock)} {product.unit}</p>
                  </div>
                </div>
                <span className={cn('text-sm font-semibold', Number(product.stock) <= 0 ? 'text-red-600' : 'text-amber-600')}>
                  {formatNumber(product.stock)} left
                </span>
              </div>
            ))}
            {!lowStockItems.length && (
              <EmptyState message="All stock levels are healthy" />
            )}
          </div>
        </Card>
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Recent Sales</h2>
          <Link to="/sales" className="text-sm text-primary-600 hover:underline dark:text-primary-400">View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-secondary-200 dark:border-secondary-700">
                <th className="text-left px-4 py-3 text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase">Invoice</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase">Customer</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase">Items</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase">Total</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase">Payment</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-secondary-200 dark:divide-secondary-700">
              {statsData?.recentSales?.slice(0, 5).map((sale: any) => (
                <tr key={sale.id} className="hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                  <td className="px-4 py-3 text-sm font-mono text-secondary-900 dark:text-white">{sale.invoiceNo}</td>
                  <td className="px-4 py-3 text-sm text-secondary-700 dark:text-secondary-300">{sale.customerName || 'Walk-in'}</td>
                  <td className="px-4 py-3 text-sm text-secondary-500">{sale.itemCount ?? sale.items?.length ?? 0} items</td>
                  <td className="px-4 py-3 text-right text-sm font-semibold text-secondary-900 dark:text-white">{formatCurrency(sale.grandTotal)}</td>
                  <td className="px-4 py-3"><StatusBadge status={sale.paymentType} size="sm" /></td>
                  <td className="px-4 py-3 text-sm text-secondary-500">{new Date(sale.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
              {!statsData?.recentSales?.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-secondary-500">No recent sales</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone: 'green' | 'red' | 'blue' }) {
  const tones = {
    green: 'text-green-600 dark:text-green-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-blue-400',
  };
  return (
    <Card className="p-4">
      <p className="text-sm text-secondary-500 dark:text-secondary-400">{label}</p>
      <p className={cn('text-xl font-bold mt-1', tones[tone])}>{value}</p>
    </Card>
  );
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-center text-secondary-500 py-6">{message}</p>;
}

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  trend?: { value: string | number; label: string; positive?: boolean; negative?: boolean } | null;
}

function StatCard({ title, value, icon: Icon, color, trend }: StatCardProps) {
  return (
    <Card className="p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-secondary-500 dark:text-secondary-400">{title}</p>
          <p className="text-3xl font-bold text-secondary-900 dark:text-white mt-1">{value}</p>
          {trend && (
            <div className="flex items-center gap-1 mt-2">
              {trend.positive ? (
                <ArrowUpRight className="h-4 w-4 text-green-500" />
              ) : trend.negative ? (
                <ArrowDownRight className="h-4 w-4 text-red-500" />
              ) : (
                <TrendingUp className="h-4 w-4 text-secondary-500" />
              )}
              <span className={cn(
                'text-sm font-medium',
                trend.positive && 'text-green-600 dark:text-green-400',
                trend.negative && 'text-red-600 dark:text-red-400',
                !trend.positive && !trend.negative && 'text-secondary-500',
              )}>
                {trend.value}
              </span>
              <span className="text-sm text-secondary-500">{trend.label}</span>
            </div>
          )}
        </div>
        <div className={cn('h-12 w-12 rounded-xl flex items-center justify-center', color)}>
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </Card>
  );
}
