import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import { Award, Download, TrendingUp } from 'lucide-react';

type LeaderboardTab = 'employee' | 'item' | 'category' | 'company';

const quickRanges = [
  { value: 'all', label: 'All Time' },
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'year', label: 'This Year' },
  { value: 'custom', label: 'Custom' },
];

function rangeFor(value: string): { from: string; to: string } {
  const now = new Date();
  const iso = (date: Date) => date.toLocaleDateString('en-CA');
  const to = iso(now);
  switch (value) {
    case 'today':
      return { from: to, to };
    case 'week': {
      const start = new Date(now);
      start.setDate(now.getDate() - now.getDay());
      return { from: iso(start), to };
    }
    case 'month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case 'year':
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to };
    default:
      return { from: '', to: '' };
  }
}

export function LeaderboardPage() {
  const [tab, setTab] = useState<LeaderboardTab>('employee');
  const [quickRange, setQuickRange] = useState('month');
  const initial = rangeFor('month');
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);

  const effective = quickRange === 'custom' ? { from: fromDate, to: toDate } : rangeFor(quickRange);

  const { data: salesData } = useQuery({
    queryKey: ['leaderboard-sales', effective],
    queryFn: () =>
      apiClient.sales.list({
        dateFrom: effective.from || undefined,
        dateTo: effective.to || undefined,
        limit: 2000,
        sortBy: 'createdAt',
        sortOrder: 'desc' as const,
      }),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'leaderboard'],
    queryFn: () => apiClient.products.list({ limit: 2000 }),
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees', 'leaderboard'],
    queryFn: () => apiClient.employees.list({ limit: 500 }),
  });

  const sales = (salesData?.data ?? []).filter(
    (sale: any) => !['Cancelled', 'Refunded', 'Held', 'Unpaid', 'Pending', 'Partial', 'Partially Refunded'].includes(String(sale.status)),
  );
  const products = productsData?.data ?? [];
  const employees = employeesData?.data ?? [];

  const rankings = useMemo(() => {
    if (tab === 'employee') {
      const map = new Map<string, any>();
      for (const sale of sales) {
        const code = sale.cashierCode || sale.cashierName || 'Unknown';
        const existing = map.get(code) ?? { id: code, label: code, sales: 0, profit: 0, count: 0 };
        existing.sales += Math.max(0, Number(sale.grandTotal || 0) - Number(sale.refundAmount || 0));
        existing.profit += (sale.items ?? []).reduce((sum: number, item: any) => sum + Number(item.profit || 0), 0);
        existing.count += 1;
        map.set(code, existing);
      }
      for (const employee of employees) {
        const entry = map.get(employee.salesCode);
        if (entry) entry.label = `${employee.name} (${employee.salesCode})`;
        else {
          for (const value of map.values()) {
            if (value.label === employee.name) value.label = `${employee.name} (${employee.salesCode})`;
          }
        }
      }
      return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
    }

    const map = new Map<string, any>();
    for (const sale of sales) {
      for (const item of sale.items ?? []) {
        const product = products.find((candidate: any) => candidate.id === item.productId);
        let key = 'Unknown';
        let label = 'Unknown';
        if (tab === 'item') {
          key = item.itemCode || item.productId;
          label = item.name || product?.name || key;
        } else if (tab === 'category') {
          key = product?.categoryName || 'Uncategorized';
          label = key;
        } else {
          key = sale.customerName || 'Walk-in';
          label = key;
        }
        const existing = map.get(key) ?? { id: key, label, sales: 0, profit: 0, qty: 0 };
        existing.sales += Number(item.lineTotal ?? item.total ?? 0);
        existing.profit += Number(item.profit || 0);
        existing.qty += Number(item.quantity || 0);
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [sales, products, employees, tab]);

  const top3 = rankings.slice(0, 3);
  const orderedPodium = [top3[1], top3[0], top3[2]].filter(Boolean);
  const maxSales = Math.max(1, ...rankings.map((entry) => entry.sales));

  const unitLabel = tab === 'employee' ? 'Invoices' : 'Qty';
  const unitValue = (entry: any) => (tab === 'employee' ? entry.count : entry.qty);

  const exportCsv = () => {
    downloadCsv(
      `leaderboard-${tab}-${effective.from || 'all'}-${effective.to || 'all'}`,
      rankings.map((entry, index) => ({
        Rank: index + 1,
        Label: entry.label,
        Sales: entry.sales,
        Profit: entry.profit,
        [unitLabel]: unitValue(entry),
      })),
    );
  };

  const handleQuickChange = (value: string) => {
    setQuickRange(value);
    if (value !== 'custom') {
      const range = rangeFor(value);
      setFromDate(range.from);
      setToDate(range.to);
    }
  };

  const podiumStyles = [
    { gradient: 'from-yellow-400 to-amber-500', height: 'h-44' },
    { gradient: 'from-slate-300 to-slate-400', height: 'h-32' },
    { gradient: 'from-amber-600 to-orange-700', height: 'h-24' },
  ];
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Leaderboard</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Performance rankings — updated live</p>
        </div>
        <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export</Button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <Select label="Quick Range" options={quickRanges} value={quickRange} onChange={(e) => handleQuickChange(e.target.value)} className="w-40" />
          <Input label="From" type="date" value={fromDate} onChange={(e) => { setQuickRange('custom'); setFromDate(e.target.value); }} className="w-40" />
          <Input label="To" type="date" value={toDate} onChange={(e) => { setQuickRange('custom'); setToDate(e.target.value); }} className="w-40" />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {(['employee', 'item', 'category', 'company'] as LeaderboardTab[]).map((value) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium capitalize transition-colors',
                tab === value
                  ? 'bg-primary-600 text-white'
                  : 'bg-secondary-100 dark:bg-secondary-800 text-secondary-600 dark:text-secondary-400 hover:bg-secondary-200 dark:hover:bg-secondary-700',
              )}
            >
              By {value}
            </button>
          ))}
        </div>
      </Card>

      {top3.length > 0 && (
        <div className="flex justify-center items-end gap-3 md:gap-5 mb-2 flex-wrap">
          {orderedPodium.map((entry) => {
            const rank = top3.indexOf(entry);
            const style = podiumStyles[rank];
            return (
              <div key={entry.id} className={cn('flex-1 max-w-[220px] min-w-[150px] rounded-t-2xl bg-gradient-to-b text-center pt-5 px-4 flex flex-col', style.gradient, style.height, rank === 0 ? 'order-2' : rank === 1 ? 'order-1' : 'order-3')}>
                <div className="text-3xl">{medals[rank]}</div>
                <p className="font-bold mt-1 truncate text-gray-900">{entry.label}</p>
                <p className="font-semibold mt-1 text-gray-900/90">{formatCurrency(entry.sales)}</p>
                <p className="text-xs mt-1 text-gray-900/70">Profit: {formatCurrency(entry.profit)}</p>
              </div>
            );
          })}
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center gap-2"><Award className="h-5 w-5 text-amber-500" />Rankings</h2>
          <Badge variant="outline">{rankings.length} entries</Badge>
        </div>
        <div className="space-y-3">
          {rankings.map((entry, index) => (
            <div key={entry.id} className="flex items-center gap-3">
              <div className={cn(
                'h-9 w-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0',
                index === 0 ? 'bg-yellow-400 text-gray-900' :
                index === 1 ? 'bg-slate-300 text-gray-900' :
                index === 2 ? 'bg-amber-600 text-white' :
                'bg-secondary-100 dark:bg-secondary-800 text-secondary-600 dark:text-secondary-400',
              )}>
                {index < 3 ? medals[index] : `#${index + 1}`}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between text-sm mb-1 gap-2">
                  <span className="font-medium text-secondary-900 dark:text-white truncate">{entry.label}</span>
                  <span className="font-semibold text-secondary-900 dark:text-white whitespace-nowrap">{formatCurrency(entry.sales)}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary-100 dark:bg-secondary-800 overflow-hidden">
                  <div className={cn('h-full rounded-full', index === 0 ? 'bg-yellow-400' : index === 1 ? 'bg-slate-400' : index === 2 ? 'bg-amber-600' : 'bg-primary-500')} style={{ width: `${(entry.sales / maxSales) * 100}%` }} />
                </div>
                <p className="text-xs text-secondary-500 mt-1 flex items-center gap-2">
                  <TrendingUp className="h-3 w-3" />Profit: {formatCurrency(entry.profit)} · {unitLabel}: {formatNumber(unitValue(entry))}
                </p>
              </div>
            </div>
          ))}
          {!rankings.length && (
            <p className="text-center text-secondary-500 py-10">No sales data for the selected period.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
