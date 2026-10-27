import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Table, Column } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, formatNumber, cn } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import { BarChart3, Search, Download, Users, Boxes, PieChart, TrendingUp } from 'lucide-react';

const timeOptions = [
  { value: 'today', label: 'Today' },
  { value: '7days', label: 'Last 7 Days' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'this_year', label: 'This Year' },
  { value: 'custom', label: 'Custom Date Range' },
];

function resolveRange(range: string): { from: string; to: string } {
  const now = new Date();
  const iso = (date: Date) => date.toLocaleDateString('en-CA');
  const to = iso(now);
  switch (range) {
    case 'today':
      return { from: to, to };
    case '7days': {
      const from = new Date(now);
      from.setDate(now.getDate() - 6);
      return { from: iso(from), to };
    }
    case 'this_month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to };
    case 'last_month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)), to: iso(new Date(now.getFullYear(), now.getMonth(), 0)) };
    case 'this_year':
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to };
    default:
      return { from: '', to: '' };
  }
}

export function AnalysisPage() {
  const [timeRange, setTimeRange] = useState('this_month');
  const initial = resolveRange('this_month');
  const [fromDate, setFromDate] = useState(initial.from);
  const [toDate, setToDate] = useState(initial.to);
  const [employeeFilter, setEmployeeFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [tableSearch, setTableSearch] = useState('');

  const effectiveRange = timeRange === 'custom' ? { from: fromDate, to: toDate } : resolveRange(timeRange);

  const { data: salesData } = useQuery({
    queryKey: ['analysis-sales', effectiveRange],
    queryFn: () =>
      apiClient.sales.list({
        dateFrom: effectiveRange.from || undefined,
        dateTo: effectiveRange.to || undefined,
        limit: 2000,
        sortBy: 'date',
        sortOrder: 'desc' as const,
      }),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'analysis'],
    queryFn: () => apiClient.products.list({ limit: 2000 }),
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees', 'analysis'],
    queryFn: () => apiClient.employees.list({ limit: 500 }),
  });

  const sales = salesData?.data ?? [];
  const products = productsData?.data ?? [];
  const employees = employeesData?.data ?? [];

  const completedSales = useMemo(
    () => sales.filter((sale: any) => !['Cancelled', 'Refunded', 'Held', 'Unpaid'].includes(String(sale.status))),
    [sales],
  );

  const expandedItems = useMemo(() => {
    const rows: any[] = [];
    for (const sale of completedSales) {
      const customerName = sale.customerName || 'Walk-in';
      const cashierCode = sale.cashierCode || sale.cashierName || 'Unknown';
      for (const item of sale.items ?? []) {
        const product = products.find((candidate: any) => candidate.id === item.productId);
        rows.push({
          itemCode: item.itemCode || product?.itemCode || '',
          name: item.name || product?.name || '',
          company: customerName,
          category1: product?.categoryName || 'Uncategorized',
          category2: product?.subCategoryName || product?.brandName || '-',
          salesCode: cashierCode,
          employeeName: sale.cashierName || 'Unknown',
          date: sale.date || sale.createdAt,
          invoiceNo: sale.invoiceNo,
          qty: Number(item.quantity || 0),
          sales: Number(item.lineTotal ?? item.total ?? 0),
          profit: Number(item.profit || 0),
        });
      }
    }
    return rows.filter((row) => {
      if (employeeFilter) {
        const employee = employees.find((candidate: any) => candidate.salesCode === employeeFilter);
        const matchesCode = row.salesCode === employeeFilter;
        const matchesName = employee && row.employeeName === employee.name;
        if (!matchesCode && !matchesName) return false;
      }
      if (productFilter && row.itemCode !== productFilter) return false;
      if (categoryFilter && row.category1 !== categoryFilter) return false;
      return true;
    });
  }, [completedSales, products, employees, employeeFilter, productFilter, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of expandedItems) {
      const key = `${item.itemCode}_${item.salesCode}`;
      const existing = map.get(key) ?? {
        id: key,
        itemCode: item.itemCode,
        name: item.name,
        company: item.company,
        companies: new Set<string>([item.company]),
        category1: item.category1,
        category2: item.category2,
        salesCode: item.salesCode,
        employeeName: item.employeeName,
        qty: 0,
        sales: 0,
        profit: 0,
      };
      existing.qty += item.qty;
      existing.sales += item.sales;
      existing.profit += item.profit;
      existing.companies.add(item.company);
      map.set(key, existing);
    }
    return Array.from(map.values())
      .map((row) => ({ ...row, companies: row.companies.size }))
      .sort((a, b) => b.sales - a.sales);
  }, [expandedItems]);

  const tableRows = useMemo(() => {
    if (!tableSearch.trim()) return grouped;
    const query = tableSearch.toLowerCase();
    return grouped.filter((row) =>
      [row.itemCode, row.name, row.company, row.category1, row.category2, row.employeeName, row.salesCode]
        .filter(Boolean)
        .some((value: string) => String(value).toLowerCase().includes(query)),
    );
  }, [grouped, tableSearch]);

  const totals = tableRows.reduce(
    (acc, row) => ({ qty: acc.qty + row.qty, sales: acc.sales + row.sales, profit: acc.profit + row.profit }),
    { qty: 0, sales: 0, profit: 0 },
  );

  const topProducts = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of expandedItems) {
      const existing = map.get(item.itemCode) ?? { code: item.itemCode, name: item.name, qty: 0, sales: 0 };
      existing.qty += item.qty;
      existing.sales += item.sales;
      map.set(item.itemCode, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales).slice(0, 8);
  }, [expandedItems]);

  const employeeStats = useMemo(() => {
    const map = new Map<string, any>();
    for (const item of expandedItems) {
      const existing = map.get(item.salesCode) ?? {
        code: item.salesCode,
        name: item.employeeName,
        qty: 0,
        sales: 0,
        profit: 0,
        invoices: new Set<string>(),
      };
      existing.qty += item.qty;
      existing.sales += item.sales;
      existing.profit += item.profit;
      existing.invoices.add(item.invoiceNo);
      map.set(item.salesCode, existing);
    }
    return Array.from(map.values())
      .map((row: any) => ({ ...row, invoices: row.invoices.size }))
      .sort((a, b) => b.sales - a.sales);
  }, [expandedItems]);

  const categoryStats = useMemo(() => {
    const map = new Map<string, { category: string; qty: number; sales: number; profit: number }>();
    for (const item of expandedItems) {
      const existing = map.get(item.category1) ?? { category: item.category1, qty: 0, sales: 0, profit: 0 };
      existing.qty += item.qty;
      existing.sales += item.sales;
      existing.profit += item.profit;
      map.set(item.category1, existing);
    }
    return Array.from(map.values()).sort((a, b) => b.sales - a.sales);
  }, [expandedItems]);

  const weeklySales = useMemo(() => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const totalsByDay = new Map<string, number>();
    for (const sale of completedSales) {
      const date = new Date(sale.date || sale.createdAt);
      const label = days[(date.getDay() + 6) % 7];
      totalsByDay.set(label, (totalsByDay.get(label) ?? 0) + Number(sale.total || 0));
    }
    return days.map((label) => ({ label, value: totalsByDay.get(label) ?? 0 }));
  }, [completedSales]);

  const maxWeekly = Math.max(1, ...weeklySales.map((entry) => entry.value));
  const maxCategory = Math.max(1, ...categoryStats.map((entry) => entry.sales));
  const maxEmployee = Math.max(1, ...employeeStats.map((entry) => entry.sales));
  const maxProduct = Math.max(1, ...topProducts.map((entry) => entry.sales));

  const productOptions = useMemo(
    () => [{ value: '', label: 'All Products' }, ...products.map((product: any) => ({ value: product.itemCode, label: `${product.name} (${product.itemCode})` }))],
    [products],
  );
  const employeeOptions = useMemo(
    () => [{ value: '', label: 'All Employees' }, ...employees.map((employee: any) => ({ value: employee.salesCode, label: `${employee.name} (${employee.salesCode})` }))],
    [employees],
  );
  const categoryOptions = useMemo(
    () => [{ value: '', label: 'All Categories' }, ...Array.from(new Set(products.map((product: any) => product.categoryName).filter(Boolean))).map((name) => ({ value: String(name), label: String(name) }))],
    [products],
  );

  const columns: Column<any>[] = [
    { key: 'itemCode', header: 'Item Code', accessor: 'itemCode', width: '110px', render: (value) => <span className="font-mono text-xs">{value}</span> },
    { key: 'name', header: 'Name', accessor: 'name' },
    { key: 'company', header: 'Company', accessor: 'company', width: '130px', render: (_value, row) => row.companies === 1 ? row.company : `Multiple (${row.companies})` },
    { key: 'category1', header: 'Category 1', accessor: 'category1', width: '130px', render: (value) => <Badge variant="outline" size="sm">{value}</Badge> },
    { key: 'category2', header: 'Category 2', accessor: 'category2', width: '110px', render: (value) => value === '-' ? '-' : <Badge variant="outline" size="sm">{value}</Badge> },
    {
      key: 'employee',
      header: 'Employee',
      accessor: 'employeeName',
      width: '160px',
      render: (_value, row) => `${row.employeeName} (${row.salesCode})`,
    },
    { key: 'qty', header: 'Qty Sold', accessor: 'qty', align: 'right', width: '90px', render: (value) => formatNumber(value) },
    { key: 'sales', header: 'Sales', accessor: 'sales', align: 'right', width: '110px', render: (value) => formatCurrency(value) },
    {
      key: 'profit',
      header: 'Profit',
      accessor: 'profit',
      align: 'right',
      width: '110px',
      render: (value) => <span className={cn(Number(value) < 0 ? 'text-red-600' : 'text-green-600')}>{formatCurrency(value)}</span>,
    },
  ];

  const exportCsv = () => {
    downloadCsv(
      `analysis-${effectiveRange.from || 'all'}-${effectiveRange.to || 'all'}`,
      tableRows.map((row) => ({
        ItemCode: row.itemCode,
        Name: row.name,
        Company: row.company,
        Category1: row.category1,
        Category2: row.category2,
        Employee: row.employeeName,
        SalesCode: row.salesCode,
        Qty: row.qty,
        Sales: row.sales,
        Profit: row.profit,
      })),
    );
  };

  const handleTimeChange = (value: string) => {
    setTimeRange(value);
    if (value !== 'custom') {
      const range = resolveRange(value);
      setFromDate(range.from);
      setToDate(range.to);
    }
  };

  const clearFilters = () => {
    setTimeRange('this_month');
    setEmployeeFilter('');
    setProductFilter('');
    setCategoryFilter('');
    setTableSearch('');
    handleTimeChange('this_month');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Analysis Dashboard</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Detailed item, employee and category performance analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={clearFilters}><PieChart className="h-4 w-4 mr-2" />Clear Filters</Button>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />Export CSV</Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <Select label="Time Filter" options={timeOptions} value={timeRange} onChange={(e) => handleTimeChange(e.target.value)} className="w-44" />
          {timeRange === 'custom' && (
            <>
              <Input label="From Date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-40" />
              <Input label="To Date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-40" />
            </>
          )}
          <Select label="Employee" options={employeeOptions} value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)} className="w-52" />
          <Select label="Product" options={productOptions} value={productFilter} onChange={(e) => setProductFilter(e.target.value)} className="w-52" />
          <Select label="Category 1" options={categoryOptions} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="w-44" />
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SummaryTile label="Qty Sold" value={formatNumber(totals.qty)} icon={Boxes} color="bg-blue-500" />
        <SummaryTile label="Sales" value={formatCurrency(totals.sales)} icon={TrendingUp} color="bg-emerald-500" />
        <SummaryTile label="Profit" value={formatCurrency(totals.profit)} icon={BarChart3} color="bg-violet-500" />
        <SummaryTile label="Margin" value={`${totals.sales ? ((totals.profit / totals.sales) * 100).toFixed(1) : '0.0'}%`} icon={PieChart} color="bg-amber-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">Weekly Sales Heatmap</h2>
          <div className="flex items-end justify-between gap-2 h-40">
            {weeklySales.map((entry) => (
              <div key={entry.label} className="flex-1 flex flex-col items-center gap-2">
                <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
                  <div
                    className={cn('w-full max-w-[48px] rounded-t-lg', entry.value ? 'bg-primary-500' : 'bg-secondary-200 dark:bg-secondary-700')}
                    style={{ height: `${Math.max(4, (entry.value / maxWeekly) * 100)}%` }}
                    title={formatCurrency(entry.value)}
                  />
                </div>
                <span className="text-xs text-secondary-500">{entry.label}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">Top Selling Products</h2>
          <div className="space-y-3">
            {topProducts.map((product, index) => (
              <div key={product.code}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="font-medium text-secondary-700 dark:text-secondary-300 truncate">
                    #{index + 1} {product.name}
                  </span>
                  <span className="font-semibold text-secondary-900 dark:text-white whitespace-nowrap ml-2">{formatCurrency(product.sales)}</span>
                </div>
                <div className="h-2 rounded-full bg-secondary-100 dark:bg-secondary-800 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(product.sales / maxProduct) * 100}%` }} />
                </div>
              </div>
            ))}
            {!topProducts.length && <p className="text-center text-secondary-500 py-6">No sales in the selected period.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4 flex items-center gap-2"><Users className="h-5 w-5 text-blue-500" />Employee Analysis</h2>
        <div className="space-y-4">
          {employeeStats.map((employee) => (
            <div key={employee.code}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-secondary-700 dark:text-secondary-300">{employee.name} · {formatNumber(employee.invoices)} invoices</span>
                <span className="text-secondary-900 dark:text-white font-semibold">{formatCurrency(employee.sales)}</span>
              </div>
              <div className="h-2.5 rounded-full bg-secondary-100 dark:bg-secondary-800 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${(employee.sales / maxEmployee) * 100}%` }} />
              </div>
              <p className="text-xs text-secondary-500 mt-1">Qty: {formatNumber(employee.qty)} · Profit: {formatCurrency(employee.profit)}</p>
            </div>
          ))}
          {!employeeStats.length && <p className="text-center text-secondary-500 py-6">No employee activity in the selected period.</p>}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">Category Performance</h2>
        <div className="space-y-3">
          {categoryStats.map((entry) => (
            <div key={entry.category}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium text-secondary-700 dark:text-secondary-300">{entry.category}</span>
                <span className="font-semibold text-secondary-900 dark:text-white">{formatCurrency(entry.sales)}</span>
              </div>
              <div className="h-2 rounded-full bg-secondary-100 dark:bg-secondary-800 overflow-hidden">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${(entry.sales / maxCategory) * 100}%` }} />
              </div>
            </div>
          ))}
          {!categoryStats.length && <p className="text-center text-secondary-500 py-6">No category data for the selected period.</p>}
        </div>
      </Card>

      <Card>
        <div className="p-4 border-b border-secondary-200 dark:border-secondary-700">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-3">Detailed Item Analysis</h2>
          <Input
            placeholder="Search by item, company, employee..."
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
            leftIcon={<Search className="h-5 w-5 text-secondary-400" />}
            className="max-w-sm"
          />
        </div>
        <Table columns={columns} data={tableRows} keyAccessor="id" emptyMessage="No analysis data for the current filters." striped hoverable />
        <div className="grid grid-cols-[110px_1fr_130px_130px_110px_160px_90px_110px_110px] items-center p-4 border-t border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800/50 text-sm">
          <span className="col-span-6 text-secondary-500 font-medium">Totals ({formatNumber(tableRows.length)} rows)</span>
          <span className="text-right font-semibold text-secondary-900 dark:text-white">{formatNumber(totals.qty)}</span>
          <span className="text-right font-semibold text-secondary-900 dark:text-white">{formatCurrency(totals.sales)}</span>
          <span className="text-right font-semibold text-green-600 dark:text-green-400">{formatCurrency(totals.profit)}</span>
        </div>
      </Card>
    </div>
  );
}

function SummaryTile({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; color: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={cn('h-10 w-10 rounded-xl flex items-center justify-center', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-sm text-secondary-500 dark:text-secondary-400">{label}</p>
          <p className="text-lg font-bold text-secondary-900 dark:text-white">{value}</p>
        </div>
      </div>
    </Card>
  );
}
