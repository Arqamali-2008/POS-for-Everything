import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, databaseApi, isLocalStorageMode } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import {
  Save,
  CreditCard,
  DollarSign,
  Users,
  Settings as SettingsIcon,
  Printer,
  Globe,
  Shield,
  Database,
  Cloud,
  Wifi,
  Download,
  Upload,
  Trash2,
  HardDrive,
} from 'lucide-react';
import { cn } from '../utils/helpers';
import { useToast } from '../components/ui/Toaster';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const settingsSchema = z.object({
  shopName: z.string().min(1),
  shopAddress: z.string().optional(),
  shopPhone: z.string().optional(),
  shopEmail: z.string().optional(),
  taxId: z.string().optional(),
  currency: z.string().length(3),
  currencySymbol: z.string().min(1),
  taxRate: z.coerce.number().nonnegative(),
  taxInclusive: z.boolean(),
  printerWidth: z.enum(['58mm', '80mm', 'A4']),
  printerName: z.string().optional(),
  invoicePrefix: z.string().min(1),
  receiptHeader: z.string().optional(),
  receiptFooter: z.string(),
  timezone: z.string(),
  language: z.string(),
  theme: z.enum(['light', 'dark', 'system']),
});

type SettingsForm = z.infer<typeof settingsSchema>;

const defaultForm: SettingsForm = {
  shopName: 'POS for Everything',
  shopAddress: '',
  shopPhone: '',
  shopEmail: '',
  taxId: '',
  currency: 'LKR',
  currencySymbol: 'Rs.',
  taxRate: 0,
  taxInclusive: false,
  printerWidth: '80mm',
  printerName: '',
  invoicePrefix: 'INV-',
  receiptHeader: 'Welcome to our shop',
  receiptFooter: 'Thank you for your business! Come again.',
  timezone: 'Asia/Colombo',
  language: 'en',
  theme: 'system',
};

const sections = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'appearance', label: 'Appearance', icon: Globe },
  { id: 'printing', label: 'Printing', icon: Printer },
  { id: 'tax', label: 'Tax', icon: CreditCard },
  { id: 'payments', label: 'Payments', icon: DollarSign },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'sync', label: 'Sync', icon: Cloud },
  { id: 'backup', label: 'Backup', icon: HardDrive },
  { id: 'security', label: 'Security', icon: Shield },
];

function applyTheme(theme: string) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('theme', theme);
}

export function SettingsPage() {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);

  const [activeSection, setActiveSection] = useState('general');
  const [isSaving, setIsSaving] = useState(false);
  const [dbProvider, setDbProvider] = useState<'sqlite' | 'supabase' | 'turso' | 'azuresql'>('sqlite');
  const [syncStatus, setSyncStatus] = useState<'connected' | 'disconnected' | 'syncing'>('disconnected');
  const [paymentMethods, setPaymentMethods] = useState<Record<string, boolean>>({
    Cash: true,
    Card: true,
    UPI: true,
    Credit: true,
  });
  const [showReset, setShowReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiClient.settings.get(),
  });

  const { data: syncData, refetch: refetchSync } = useQuery({
    queryKey: ['sync-status'],
    queryFn: () => apiClient.sync.status(),
  });

  const [dbPathInput, setDbPathInput] = useState('');
  const [dbBusy, setDbBusy] = useState(false);

  const { data: dbInfoData, refetch: refetchDbInfo } = useQuery({
    queryKey: ['database-info'],
    queryFn: () => databaseApi!.info(),
    enabled: !isLocalStorageMode,
  });

  const dbInfo = dbInfoData?.data as
    | { path: string; isNetworkPath: boolean; exists: boolean; sizeBytes: number; journalMode?: string | null; runtimeOverride?: string | null }
    | undefined;

  useEffect(() => {
    if (dbInfo && !dbPathInput) setDbPathInput(dbInfo.path);
  }, [dbInfo, dbPathInput]);

  const testDbPath = async () => {
    setDbBusy(true);
    try {
      const response = await databaseApi!.testPath(dbPathInput);
      if (response.success) {
        success('Path is usable', dbPathInput);
      } else {
        const message = (response as { error?: string }).error || 'Unknown reason';
        error('Path not usable', message);
      }
    } catch (err) {
      error('Path test failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDbBusy(false);
    }
  };

  const switchDbPath = async () => {
    if (!window.confirm('Switch the server database to this file? All terminals will use it immediately.')) return;
    setDbBusy(true);
    try {
      const response = await databaseApi!.switchPath(dbPathInput);
      success('Data file switched', (response as { message?: string }).message || dbPathInput);
      await refetchDbInfo();
    } catch (err) {
      error('Switch failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDbBusy(false);
    }
  };

  const backupDb = async () => {
    setDbBusy(true);
    try {
      const response = await databaseApi!.backup();
      const backupPath = (response.data as { backupPath?: string })?.backupPath;
      success('Backup created', backupPath || 'Next to the data file');
    } catch (err) {
      error('Backup failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDbBusy(false);
    }
  };

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: defaultForm,
  });

  useEffect(() => {
    if (!settingsData?.data) return;
    const settings = settingsData.data;
    const mapped: SettingsForm = {
      ...defaultForm,
      ...Object.fromEntries(
        Object.keys(defaultForm).map((key) => [key, settings[key] ?? (defaultForm as any)[key]]),
      ),
    };
    mapped.taxRate = Number(mapped.taxRate || 0);
    mapped.taxInclusive = Boolean(mapped.taxInclusive);
    reset(mapped);
    if (settings.paymentMethods) setPaymentMethods(settings.paymentMethods);
    if (settings.theme) applyTheme(settings.theme);
  }, [settingsData, reset]);

  const saveMutation = useMutation({
    mutationFn: (data: SettingsForm) =>
      apiClient.settings.bulkUpdate({ ...data, paymentMethods }),
    onSuccess: () => {
      success('Settings saved', 'Your changes have been applied');
      setIsSaving(false);
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: any) => {
      error('Failed to save', err.message);
      setIsSaving(false);
    },
  });

  const submit = async (data: SettingsForm) => {
    setIsSaving(true);
    applyTheme(data.theme);
    await saveMutation.mutateAsync(data);
  };

  const savePaymentMethods = async () => {
    setIsSaving(true);
    try {
      await apiClient.settings.bulkUpdate({ paymentMethods });
      success('Payment methods saved');
    } catch (err) {
      error('Failed to save', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsSaving(false);
    }
  };

  const exportBackup = async () => {
    try {
      const response = await apiClient.settings.exportData();
      const blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pos-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      success('Backup downloaded', 'Keep this file in a safe place');
    } catch (err) {
      error('Backup failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const importBackup = async (file: File) => {
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      if (!window.confirm('Import this backup? Existing records with the same data will be replaced.')) return;
      const response = await apiClient.settings.importData(payload);
      success('Backup restored', `${response.data?.imported ?? 0} records imported. Reloading...`);
      setTimeout(() => window.location.reload(), 800);
    } catch (err) {
      error('Import failed', err instanceof Error ? err.message : 'Invalid backup file');
    }
  };

  const resetData = async () => {
    setResetting(true);
    try {
      await apiClient.settings.resetData();
      success('Data cleared', 'The application will reload');
      setTimeout(() => window.location.reload(), 700);
    } catch (err) {
      error('Reset failed', err instanceof Error ? err.message : 'Unknown error');
      setResetting(false);
    }
  };

  const triggerSync = async () => {
    setSyncStatus('syncing');
    try {
      await apiClient.sync.trigger();
      await refetchSync();
      setSyncStatus('connected');
      success('Sync finished');
    } catch (err) {
      setSyncStatus('disconnected');
      error('Sync failed', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const renderSection = () => {
    switch (activeSection) {
      case 'general':
        return (
          <form onSubmit={handleSubmit(submit)} className="space-y-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Shop Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Shop Name" error={errors.shopName?.message} {...register('shopName')} placeholder="My Shop" />
              <Input label="Currency Symbol" {...register('currencySymbol')} placeholder="Rs." />
              <Select label="Currency" options={[{ value: 'LKR', label: 'Sri Lankan Rupee (LKR)' }, { value: 'USD', label: 'US Dollar (USD)' }, { value: 'EUR', label: 'Euro (EUR)' }, { value: 'GBP', label: 'British Pound (GBP)' }]} {...register('currency')} />
              <Input label="Invoice Prefix" {...register('invoicePrefix')} placeholder="INV-" />
              <Input label="Shop Address" {...register('shopAddress')} placeholder="123 Main Street, Colombo" className="md:col-span-2" />
              <Input label="Phone" type="tel" {...register('shopPhone')} placeholder="+94 11 234 5678" />
              <Input label="Email" type="email" {...register('shopEmail')} placeholder="shop@example.com" />
              <Input label="GSTIN / Tax ID" {...register('taxId')} placeholder="Tax ID" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white border-t pt-6">Localization</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Select label="Timezone" options={[{ value: 'Asia/Colombo', label: 'Sri Lanka (GMT+5:30)' }, { value: 'UTC', label: 'UTC' }, { value: 'America/New_York', label: 'Eastern Time' }, { value: 'Europe/London', label: 'London' }]} {...register('timezone')} />
              <Select label="Language" options={[{ value: 'en', label: 'English' }, { value: 'si', label: 'Sinhala' }, { value: 'ta', label: 'Tamil' }]} {...register('language')} />
              <Select label="Theme" options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} {...register('theme')} onChange={(e) => { void setValue('theme', e.target.value as SettingsForm['theme']); applyTheme(e.target.value); }} />
            </div>
            <Button type="submit" loading={isSaving}><Save className="h-4 w-4 mr-2" />Save General Settings</Button>
          </form>
        );

      case 'appearance':
        return (
          <form onSubmit={handleSubmit(submit)} className="space-y-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Receipt Customization</h3>
            <div className="space-y-4">
              <Input label="Receipt Header" {...register('receiptHeader')} placeholder="Welcome to Our Shop" />
              <Input label="Receipt Footer" {...register('receiptFooter')} placeholder="Thank you for your business!" />
              <Select label="Theme" options={[{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }, { value: 'system', label: 'System' }]} {...register('theme')} onChange={(e) => { void setValue('theme', e.target.value as SettingsForm['theme']); applyTheme(e.target.value); }} />
            </div>
            <Button type="submit" loading={isSaving}><Save className="h-4 w-4 mr-2" />Save Appearance</Button>
          </form>
        );

      case 'printing':
        return (
          <form onSubmit={handleSubmit(submit)} className="space-y-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Printer Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select label="Printer Width" options={[{ value: '58mm', label: '58mm (2 inch)' }, { value: '80mm', label: '80mm (3 inch)' }, { value: 'A4', label: 'A4 Sheet' }]} {...register('printerWidth')} />
              <Input label="Printer Name" {...register('printerName')} placeholder="TM-T88V" />
            </div>
            <p className="text-sm text-secondary-500">
              Receipts are printed using the browser print dialog. Select your thermal printer there and set margins to none.
            </p>
            <Button type="submit" loading={isSaving}><Save className="h-4 w-4 mr-2" />Save Printing</Button>
          </form>
        );

      case 'tax':
        return (
          <form onSubmit={handleSubmit(submit)} className="space-y-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Tax Configuration</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Default Tax Rate %" type="number" step="0.01" min="0" max="100" {...register('taxRate')} />
              <label className="flex items-center gap-2 cursor-pointer pt-6">
                <input type="checkbox" className="h-4 w-4 rounded border-secondary-300 text-primary-600" {...register('taxInclusive')} />
                <span className="text-sm text-secondary-700 dark:text-secondary-300">Prices include tax by default</span>
              </label>
            </div>
            <p className="text-sm text-secondary-500">
              Product-level tax settings override these defaults at checkout.
            </p>
            <Button type="submit" loading={isSaving}><Save className="h-4 w-4 mr-2" />Save Tax Settings</Button>
          </form>
        );

      case 'payments':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Payment Methods</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(paymentMethods).map(([method, enabled]) => (
                <label key={method} className="flex items-center gap-3 p-4 border border-secondary-200 dark:border-secondary-700 rounded-lg cursor-pointer hover:bg-secondary-50 dark:hover:bg-secondary-800/50">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setPaymentMethods((prev) => ({ ...prev, [method]: e.target.checked }))}
                    className="h-4 w-4 rounded border-secondary-300 text-primary-600"
                  />
                  <span className="font-medium text-secondary-900 dark:text-white">{method}</span>
                </label>
              ))}
            </div>
            <p className="text-sm text-secondary-500">
              Disabled methods are hidden from the POS checkout screen.
            </p>
            <Button onClick={savePaymentMethods} loading={isSaving}><Save className="h-4 w-4 mr-2" />Save Payment Settings</Button>
          </div>
        );

      case 'database':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Database Provider</h3>
              <Badge variant={isLocalStorageMode ? 'warning' : 'success'}>
                Active: {isLocalStorageMode ? 'Browser localStorage' : 'API / Server'}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { id: 'sqlite', label: 'SQLite (Local)', icon: Database, desc: 'Local file-based server database', recommended: true },
                { id: 'supabase', label: 'Supabase (PostgreSQL)', icon: Cloud, desc: 'Cloud PostgreSQL with realtime' },
                { id: 'turso', label: 'Turso (LibSQL)', icon: Wifi, desc: 'Edge SQLite with sync' },
                { id: 'azuresql', label: 'Azure SQL', icon: Database, desc: 'Microsoft Azure SQL Database' },
              ].map((provider) => (
                <label key={provider.id} className={cn('p-4 border-2 rounded-lg cursor-pointer transition-all relative', dbProvider === provider.id ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-secondary-200 dark:border-secondary-700 hover:border-primary-300')}>
                  <input type="radio" name="dbProvider" value={provider.id} checked={dbProvider === provider.id} onChange={() => setDbProvider(provider.id as typeof dbProvider)} className="sr-only" />
                  <div className="flex items-start gap-3">
                    <div className={cn('h-10 w-10 rounded-lg flex items-center justify-center', provider.recommended ? 'bg-primary-100 dark:bg-primary-900/30' : 'bg-secondary-100 dark:bg-secondary-800')}>
                      <provider.icon className="h-5 w-5 text-primary-600 dark:text-primary-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-semibold text-secondary-900 dark:text-white">{provider.label}</h4>
                        {provider.recommended && <Badge variant="success" size="sm">Recommended</Badge>}
                      </div>
                      <p className="text-sm text-secondary-500 dark:text-secondary-400 mt-1">{provider.desc}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <div className="p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg text-sm text-secondary-600 dark:text-secondary-400">
              <p className="font-medium text-secondary-900 dark:text-white mb-1">How data mode works</p>
              <p>
                The frontend uses <code>VITE_DATA_MODE=local</code> by default and stores everything in this browser.
                Set <code>VITE_DATA_MODE=api</code> and run the backend to switch to server storage. Switching providers
                requires restarting the backend with the corresponding environment variables.
              </p>
            </div>
            {!isLocalStorageMode && dbInfo && (
              <div className="border-t border-secondary-200 dark:border-secondary-700 pt-6">
                <h3 className="text-lg font-semibold text-secondary-900 dark:text-white mb-3">Data File</h3>
                <div className="p-4 bg-secondary-50 dark:bg-secondary-800/50 rounded-lg text-sm text-secondary-600 dark:text-secondary-400 mb-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <HardDrive className="h-4 w-4 shrink-0" />
                    <span className="font-mono break-all text-secondary-900 dark:text-white">{dbInfo.path}</span>
                    {dbInfo.isNetworkPath && <Badge variant="info" size="sm">Network path</Badge>}
                    <Badge variant={dbInfo.exists ? 'success' : 'warning'} size="sm">{dbInfo.exists ? 'File exists' : 'New file'}</Badge>
                  </div>
                  <p>
                    {dbInfo.journalMode ? <span className="inline">SQLite (journal: {dbInfo.journalMode}), </span> : null}
                    {dbInfo.sizeBytes > 0 ? `${(dbInfo.sizeBytes / (1024 * 1024)).toFixed(2)} MB` : '0 B'} — active data file
                    {dbInfo.runtimeOverride ? ' (chosen here, overrides env)' : ''}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <div className="flex-1 min-w-[280px]">
                    <Input
                      label="Data file path"
                      value={dbPathInput}
                      onChange={(e) => setDbPathInput(e.target.value)}
                      placeholder="\\SERVER\pos\posdata.db or D:\pos\posdata.db"
                    />
                  </div>
                  <div className="flex gap-2 pt-6">
                    <Button variant="outline" onClick={testDbPath} loading={dbBusy}>Test</Button>
                    <Button onClick={switchDbPath} loading={dbBusy}>Switch</Button>
                    <Button variant="outline" onClick={backupDb} loading={dbBusy}>Backup Now</Button>
                  </div>
                </div>
                <p className="text-sm text-secondary-500 mt-2">
                  Point the server at a single <code>.db</code> on a network shared drive so every terminal on the LAN
                  uses the same data. The server PC is the only machine that touches the file — other PCs open this POS
                  in their browser. Switching reconnects live; no restart needed.
                </p>
              </div>
            )}
            {isLocalStorageMode && (
              <p className="text-sm text-secondary-500">
                Data-file selection is available when the frontend runs in API mode (server storage). You are in
                local mode, so data lives in this browser and the server is not used.
              </p>
            )}
          </div>
        );

      case 'sync':
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Cloud Synchronization</h3>
              <Badge variant={syncStatus === 'connected' ? 'success' : syncStatus === 'syncing' ? 'warning' : 'default'} dot>
                {syncStatus === 'connected' ? 'Connected' : syncStatus === 'syncing' ? 'Syncing...' : isLocalStorageMode ? 'Local only' : 'Idle'}
              </Badge>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 border border-secondary-200 dark:border-secondary-700 rounded-lg">
                <h4 className="font-medium text-secondary-900 dark:text-white mb-2">Last sync status</h4>
                <p className="text-sm text-secondary-500">
                  Provider: {syncData?.data?.provider ?? (isLocalStorageMode ? 'localStorage' : 'server')}
                </p>
                <p className="text-sm text-secondary-500">
                  Running: {syncData?.data?.isRunning ? 'Yes' : 'No'}
                </p>
              </div>
              <div className="p-4 border border-secondary-200 dark:border-secondary-700 rounded-lg">
                <h4 className="font-medium text-secondary-900 dark:text-white mb-2">Sync interval</h4>
                <Select options={[{ value: '30000', label: 'Every 30 seconds' }, { value: '60000', label: 'Every minute' }, { value: '300000', label: 'Every 5 minutes' }, { value: '900000', label: 'Every 15 minutes' }]} defaultValue="60000" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={triggerSync} disabled={syncStatus === 'syncing'}>Sync Now</Button>
              <Button variant="outline" onClick={() => refetchSync()}>Refresh Status</Button>
            </div>
            {isLocalStorageMode && (
              <p className="text-sm text-secondary-500">
                You are running in local mode, so records are already stored on this device. Use Backup to move data between devices.
              </p>
            )}
          </div>
        );

      case 'backup':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Backup & Restore</h3>
            <p className="text-sm text-secondary-500">
              Export all products, sales, customers, purchases, expenses and settings to a JSON file.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={exportBackup}><Download className="h-4 w-4 mr-2" />Download Backup</Button>
              <Button variant="outline" onClick={() => importRef.current?.click()}><Upload className="h-4 w-4 mr-2" />Import Backup</Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => { const file = e.target.files?.[0]; if (file) importBackup(file); e.target.value = ''; }}
              />
            </div>
            <div className="border-t border-secondary-200 dark:border-secondary-700 pt-6">
              <h4 className="font-medium text-red-600 dark:text-red-400 mb-2">Danger zone</h4>
              <p className="text-sm text-secondary-500 mb-3">
                Clear all local business records and restore default settings. This cannot be undone.
              </p>
              <Button variant="danger" onClick={() => setShowReset(true)}><Trash2 className="h-4 w-4 mr-2" />Reset All Data</Button>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-secondary-900 dark:text-white">Security Settings</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="p-6">
                <h4 className="font-semibold text-secondary-900 dark:text-white mb-4 flex items-center gap-2"><Shield className="h-5 w-5" />Change Password</h4>
                <ChangePasswordForm />
              </Card>
              <Card className="p-6">
                <h4 className="font-semibold text-secondary-900 dark:text-white mb-4 flex items-center gap-2"><Users className="h-5 w-5" />Staff Accounts</h4>
                <p className="text-secondary-600 dark:text-secondary-400 mb-4">
                  Manage staff and roles from the Employees page. Local accounts use the login email and password stored on the server.
                </p>
                <Button variant="outline" onClick={() => { window.location.href = '/employees'; }}>Manage Employees</Button>
              </Card>
            </div>
          </div>
        );

      default:
        return <div>Select a section</div>;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Settings</h1>
        <p className="text-secondary-500 dark:text-secondary-400">Configure your POS system</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <aside className="lg:w-48 flex-shrink-0">
          <nav className="space-y-1" role="navigation" aria-label="Settings sections">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left',
                  activeSection === section.id
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'text-secondary-600 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:bg-secondary-700',
                )}
              >
                <section.icon className="h-5 w-5 flex-shrink-0" />
                <span>{section.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1 min-w-0">
          <Card className="p-6">{renderSection()}</Card>
        </div>
      </div>

      <Modal isOpen={showReset} onClose={() => setShowReset(false)} title="Reset All Data" size="sm">
        <p className="text-secondary-600 dark:text-secondary-400">
          This deletes all products, sales, customers and settings from this browser. Export a backup first if you need it.
        </p>
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={() => setShowReset(false)}>Cancel</Button>
          <Button variant="danger" onClick={resetData} loading={resetting}>Reset Everything</Button>
        </div>
      </Modal>
    </div>
  );
}

function ChangePasswordForm() {
  const { success, error } = useToast();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword.length < 6) {
      error('Password too short', 'Use at least 6 characters');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      error('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await apiClient.auth.changePassword({
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      success('Password changed', 'Use the new password next time you sign in');
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      error('Failed to change password', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input label="Current Password" type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required />
      <Input label="New Password" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} required minLength={6} />
      <Input label="Confirm Password" type="password" value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} required />
      <Button type="submit" loading={loading} className="w-full">Change Password</Button>
    </form>
  );
}
