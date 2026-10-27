import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Textarea } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Badge } from '../components/ui/Badge';
import { formatCurrency, cn } from '../utils/helpers';
import { downloadCsv } from '../utils/csv';
import { Plus, Trash2, Save, Download, Upload, CalendarPlus, AlertTriangle, CheckCircle, XCircle, History } from 'lucide-react';
import { useToast } from '../components/ui/Toaster';

interface CashTransaction {
  id: string;
  desc: string;
  amount: number;
  time: string;
}

interface DaySummary {
  inTrans: CashTransaction[];
  outTrans: CashTransaction[];
  yesterdayBalance: number;
  todayBalance: number;
  notes: string;
}

type SummaryMap = Record<string, DaySummary>;

const STORAGE_KEY = 'ami-pos:cash-summaries';
const LEGACY_KEY = 'cashSummaries';

const emptyDay = (): DaySummary => ({
  inTrans: [],
  outTrans: [],
  yesterdayBalance: 0,
  todayBalance: 0,
  notes: '',
});

const todayKey = () => new Date().toLocaleDateString('en-CA');
const shiftDate = (date: string, days: number) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result.toLocaleDateString('en-CA');
};

function loadSummaries(): SummaryMap {
  for (const key of [STORAGE_KEY, LEGACY_KEY]) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as SummaryMap;
      }
    } catch {
      // corrupted record — fall through to next key
    }
  }
  return {};
}

export function SummaryPage() {
  const { success, error } = useToast();
  const [currentDate, setCurrentDate] = useState(todayKey());
  const [summaries, setSummaries] = useState<SummaryMap>(() => loadSummaries());
  const [showTransactionModal, setShowTransactionModal] = useState(false);
  const [transactionType, setTransactionType] = useState<'in' | 'out'>('in');
  const [transactionDesc, setTransactionDesc] = useState('');
  const [transactionAmount, setTransactionAmount] = useState(0);
  const [savedAt, setSavedAt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const day: DaySummary = summaries[currentDate] ?? emptyDay();

  const { data: salesData } = useQuery({
    queryKey: ['summary-sales'],
    queryFn: () => apiClient.sales.list({ limit: 2000, sortBy: 'createdAt', sortOrder: 'desc' as const }),
  });

  const salesByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const sale of salesData?.data ?? []) {
      if (['Cancelled', 'Refunded', 'Unpaid', 'Held', 'Pending', 'Partial', 'Partially Refunded'].includes(String(sale.status))) continue;
      const key = new Date(sale.date || sale.createdAt).toLocaleDateString('en-CA');
      map.set(key, (map.get(key) ?? 0) + Math.max(0, Number(sale.grandTotal || 0) - Number(sale.refundAmount || 0)));
    }
    return map;
  }, [salesData]);

  const todaySales = salesByDate.get(currentDate) ?? 0;
  const totalIn = day.inTrans.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const totalOut = day.outTrans.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
  const expected = totalIn + day.yesterdayBalance + todaySales;
  const actual = totalOut + day.todayBalance;
  const missing = expected - actual;
  const isBalanced = Math.abs(missing) < 0.01;

  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(summaries));
        setSavedAt(new Date().toLocaleTimeString());
      } catch (err: any) {
        error('Auto-save failed', err.message);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [summaries]);

  useEffect(() => {
    setSummaries((current) => {
      if (current[currentDate]) return current;
      const previous = current[shiftDate(currentDate, -1)];
      const carried = previous?.todayBalance ?? 0;
      return { ...current, [currentDate]: { ...emptyDay(), yesterdayBalance: carried } };
    });
  }, [currentDate, summaries]);

  const updateDay = (patch: Partial<DaySummary>) => {
    setSummaries((current) => {
      const existing = current[currentDate] ?? emptyDay();
      return { ...current, [currentDate]: { ...existing, ...patch } };
    });
  };

  const addTransaction = () => {
    if (!transactionDesc.trim() || transactionAmount <= 0) {
      error('Invalid transaction', 'Provide a description and a positive amount');
      return;
    }
    const transaction: CashTransaction = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      desc: transactionDesc.trim(),
      amount: transactionAmount,
      time: new Date().toLocaleTimeString(),
    };
    setSummaries((current) => {
      const existing = current[currentDate] ?? emptyDay();
      const field = transactionType === 'in' ? 'inTrans' : 'outTrans';
      return { ...current, [currentDate]: { ...existing, [field]: [...existing[field], transaction] } };
    });
    success(`Cash ${transactionType === 'in' ? 'IN' : 'OUT'} added`, `${transaction.desc}: ${formatCurrency(transaction.amount)}`);
    setShowTransactionModal(false);
    setTransactionDesc('');
    setTransactionAmount(0);
  };

  const removeTransaction = (type: 'in' | 'out', id: string) => {
    setSummaries((current) => {
      const existing = current[currentDate] ?? emptyDay();
      const field = type === 'in' ? 'inTrans' : 'outTrans';
      return { ...current, [currentDate]: { ...existing, [field]: existing[field].filter((transaction) => transaction.id !== id) } };
    });
  };

  const openTransactionModal = (type: 'in' | 'out') => {
    setTransactionType(type);
    setTransactionDesc('');
    setTransactionAmount(0);
    setShowTransactionModal(true);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(summaries, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cash-summaries-${todayKey()}.json`;
    link.click();
    URL.revokeObjectURL(url);
    success('Export ready', 'Cash summaries JSON downloaded');
  };

  const exportCsv = () => {
    const rows = Object.entries(summaries).sort(([a], [b]) => b.localeCompare(a));
    downloadCsv(
      `cash-summaries-${todayKey()}`,
      rows.map(([date, entry]) => {
        const tIn = entry.inTrans.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
        const tOut = entry.outTrans.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
        const sales = salesByDate.get(date) ?? 0;
        return {
          Date: date,
          'Total IN': tIn,
          'Total OUT': tOut,
          Sales: sales,
          'Yesterday Balance': entry.yesterdayBalance,
          'Today Balance': entry.todayBalance,
          Missing: (tIn + entry.yesterdayBalance + sales) - (tOut + entry.todayBalance),
          Notes: entry.notes,
        };
      }),
    );
    success('Export ready', 'Cash summaries CSV downloaded');
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result));
        if (!imported || typeof imported !== 'object' || Array.isArray(imported)) {
          error('Import failed', 'File does not contain valid summary data');
          return;
        }
        const valid: SummaryMap = {};
        for (const [date, entry] of Object.entries(imported)) {
          const record = entry as Partial<DaySummary>;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
          if (!Array.isArray(record.inTrans) || !Array.isArray(record.outTrans)) continue;
          valid[date] = {
            inTrans: record.inTrans.filter((transaction) => transaction && typeof transaction.desc === 'string'),
            outTrans: record.outTrans.filter((transaction) => transaction && typeof transaction.desc === 'string'),
            yesterdayBalance: Number(record.yesterdayBalance) || 0,
            todayBalance: Number(record.todayBalance) || 0,
            notes: typeof record.notes === 'string' ? record.notes : '',
          };
        }
        if (!Object.keys(valid).length) {
          error('Import failed', 'No valid day records found in file');
          return;
        }
        setSummaries({ ...summaries, ...valid });
        success('Import complete', `Merged ${Object.keys(valid).length} day records`);
      } catch (err: any) {
        error('Import failed', err.message);
      }
    };
    reader.readAsText(file);
  };

  const history = Object.entries(summaries).sort(([a], [b]) => b.localeCompare(a));

  const missingBoxClass = isBalanced
    ? 'bg-green-500 text-white'
    : missing > 0
      ? 'bg-orange-50 dark:bg-orange-900/20 text-orange-600'
      : 'bg-red-50 dark:bg-red-900/20 text-red-600';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Cash Reconciliation Summary</h1>
          <p className="text-secondary-500 dark:text-secondary-400">
            Daily cash position — auto-saved {savedAt && <strong className="text-green-600">✓ {savedAt}</strong>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCurrentDate(todayKey())}><CalendarPlus className="h-4 w-4 mr-2" />Go to Today</Button>
          <Button variant="outline" onClick={() => { setSavedAt(new Date().toLocaleTimeString()); success('Summary saved', `Record saved for ${currentDate}`); }}><Save className="h-4 w-4 mr-2" />Save Record</Button>
          <Button variant="outline" onClick={exportJson}><Download className="h-4 w-4 mr-2" />JSON</Button>
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-2" />CSV</Button>
          <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Import</Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) importJson(file);
            event.target.value = '';
          }}
        />
      </div>

      <Card className="p-4">
        <Input label="Summary Date" type="date" value={currentDate} onChange={(e) => setCurrentDate(e.target.value)} className="w-52" />
      </Card>

      <Card className={cn('p-6 border-2', missingBoxClass)}>
        <p className="text-sm font-medium opacity-80 mb-1">
          Missing Amount = (IN + Yesterday's Balance + Sales) − (OUT + Today's Balance)
        </p>
        <div className="flex items-center gap-3">
          {isBalanced ? <CheckCircle className="h-8 w-8" /> : missing > 0 ? <AlertTriangle className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          <div>
            <p className="text-3xl font-bold">
              {isBalanced ? 'Balanced' : missing > 0 ? `Surplus: ${formatCurrency(missing)}` : `Missing: ${formatCurrency(Math.abs(missing))}`}
            </p>
            <p className="text-sm opacity-80 mt-1">
              {isBalanced
                ? 'All cash is accounted for.'
                : missing > 0
                  ? `Extra cash of ${formatCurrency(missing)} — more cash than expected.`
                  : `Cash deficit of ${formatCurrency(Math.abs(missing))} — less cash than expected.`}
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Total Cash IN" value={formatCurrency(totalIn)} color="text-green-600" />
        <KpiCard label="Total Cash OUT" value={formatCurrency(totalOut)} color="text-red-600" />
        <KpiCard label="Today's Sales" value={formatCurrency(todaySales)} color="text-blue-600" />
        <KpiCard label="Yesterday's Balance" value={formatCurrency(day.yesterdayBalance)} color="text-violet-600" />
        <KpiCard label="Today's Balance" value={formatCurrency(day.todayBalance)} color="text-violet-600" />
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">Cash Balances</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Input
            label="Yesterday's Closing Balance"
            type="number"
            min="0"
            step="0.01"
            value={day.yesterdayBalance}
            onChange={(e) => updateDay({ yesterdayBalance: Number(e.target.value) || 0 })}
          />
          <Input
            label="Today's Closing Balance"
            type="number"
            min="0"
            step="0.01"
            value={day.todayBalance}
            onChange={(e) => updateDay({ todayBalance: Number(e.target.value) || 0 })}
          />
        </div>
        <p className="text-xs text-secondary-500 mt-2">
          Yesterday's balance auto-fills from the previous day's closing balance when a new day is opened.
        </p>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Cash IN Transactions</h2>
            <Button size="sm" variant="outline" onClick={() => openTransactionModal('in')}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
          </div>
          <div className="divide-y divide-secondary-100 dark:divide-secondary-800">
            {day.inTrans.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-secondary-900 dark:text-white">{transaction.desc}</p>
                  <p className="text-xs text-secondary-500">{transaction.time}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-green-600">{formatCurrency(transaction.amount)}</span>
                  <button onClick={() => removeTransaction('in', transaction.id)} className="text-secondary-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {!day.inTrans.length && <p className="py-6 text-center text-secondary-500">No cash IN transactions.</p>}
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Cash OUT Transactions</h2>
            <Button size="sm" variant="outline" onClick={() => openTransactionModal('out')}><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
          </div>
          <div className="divide-y divide-secondary-100 dark:divide-secondary-800">
            {day.outTrans.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-secondary-900 dark:text-white">{transaction.desc}</p>
                  <p className="text-xs text-secondary-500">{transaction.time}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-red-600">{formatCurrency(transaction.amount)}</span>
                  <button onClick={() => removeTransaction('out', transaction.id)} className="text-secondary-400 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
            {!day.outTrans.length && <p className="py-6 text-center text-secondary-500">No cash OUT transactions.</p>}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">Day Notes</h2>
        <Textarea
          rows={3}
          placeholder="Notes for this day's reconciliation..."
          value={day.notes}
          onChange={(event) => updateDay({ notes: event.target.value })}
        />
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white flex items-center gap-2"><History className="h-5 w-5 text-blue-500" />Summary History</h2>
          <Badge variant="outline">{history.length} days</Badge>
        </div>
        <div className="divide-y divide-secondary-100 dark:divide-secondary-800 max-h-80 overflow-y-auto">
          {history.map(([date, entry]) => {
            const tIn = entry.inTrans.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
            const tOut = entry.outTrans.reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0);
            const sales = salesByDate.get(date) ?? 0;
            const dayMissing = (tIn + entry.yesterdayBalance + sales) - (tOut + entry.todayBalance);
            return (
              <button key={date} onClick={() => setCurrentDate(date)} className="w-full flex items-center justify-between py-2 hover:bg-secondary-50 dark:hover:bg-secondary-800/50 rounded px-2 -mx-2 text-left">
                <div>
                  <p className="font-medium text-secondary-900 dark:text-white">
                    {date}{date === todayKey() ? <Badge variant="info" size="sm" className="ml-2">Today</Badge> : null}
                  </p>
                  <p className="text-xs text-secondary-500">
                    IN: {formatCurrency(tIn)} · OUT: {formatCurrency(tOut)} · Sales: {formatCurrency(sales)}
                  </p>
                </div>
                <div className="text-right">
                  <p className={cn('text-xs font-semibold', Math.abs(dayMissing) < 0.01 ? 'text-green-600' : dayMissing > 0 ? 'text-orange-500' : 'text-red-600')}>{formatCurrency(Math.abs(dayMissing))}</p>
                  <p className="text-xs text-secondary-500">Bal: {formatCurrency(entry.todayBalance)}</p>
                </div>
              </button>
            );
          })}
          {!history.length && <p className="py-6 text-center text-secondary-500">No saved summaries yet.</p>}
        </div>
      </Card>

      <Modal
        isOpen={showTransactionModal}
        onClose={() => setShowTransactionModal(false)}
        title={`Add Cash ${transactionType === 'in' ? 'IN' : 'OUT'}`}
        size="sm"
      >
        <div className="space-y-4">
          <Input label="Description" value={transactionDesc} onChange={(e) => setTransactionDesc(e.target.value)} placeholder={transactionType === 'in' ? 'Opening float, cash deposit...' : 'Expense, withdrawal...'} />
          <Input label="Amount" type="number" min="0" step="0.01" value={transactionAmount || ''} onChange={(e) => setTransactionAmount(Number(e.target.value) || 0)} />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowTransactionModal(false)}>Cancel</Button>
            <Button onClick={addTransaction}>Add Transaction</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function KpiCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <Card className="p-4 border-l-4 border-secondary-300 dark:border-secondary-600">
      <p className="text-sm text-secondary-500 dark:text-secondary-400">{label}</p>
      <p className={`text-xl font-bold mt-1 ${color}`}>{value}</p>
    </Card>
  );
}
