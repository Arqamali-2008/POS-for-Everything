import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import JsBarcode from 'jsbarcode';
import { apiClient } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import { Table, Column } from '../components/ui/Table';
import { formatCurrency, formatDateTime, cn } from '../utils/helpers';
import { Barcode, Printer, Trash2, Loader2 } from 'lucide-react';
import { useToast } from '../components/ui/Toaster';

const stickerSizes = [
  { value: 'gt800-3col', label: '⭐ Zebra GT 800 (3cm × 1.5cm) - 3 per row [9.56cm paper]' },
  { value: 'gt800-1col', label: 'Zebra GT 800 (3cm × 1.5cm) - 1 per row' },
  { value: 'zebra-3x1-5cm', label: 'Legacy Zebra (3cm × 1.5cm) - 1 per row' },
  { value: 'zebra-3x1-5cm-3row', label: 'Legacy Zebra (3cm × 1.5cm) - 3 per row' },
  { value: 'zebra-3x1-5cm-4row', label: 'Legacy Zebra (3cm × 1.5cm) - 4 per row' },
  { value: 'zebra-2x1', label: 'Zebra GT 800 (2×1 inch) - 1 per row' },
  { value: 'small', label: 'Small (2×1 inch) - 4 per row' },
  { value: 'large', label: 'Large (3×2 inch) - 2 per row' },
  { value: 'roll-square', label: 'Roll Square (1×1 inch) - 6 per row' },
  { value: 'roll-rectangle', label: 'Roll Rectangle (1×0.5 inch) - 3 per row' },
];

const SIZE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  'gt800-3col': { width: 3, height: 1.5 },
  'gt800-1col': { width: 3, height: 1.5 },
  'zebra-3x1-5cm': { width: 3, height: 1.5 },
  'zebra-3x1-5cm-3row': { width: 3, height: 1.5 },
  'zebra-3x1-5cm-4row': { width: 3, height: 1.5 },
  'zebra-2x1': { width: 5.08, height: 2.54 },
  small: { width: 5.08, height: 2.54 },
  large: { width: 7.62, height: 5.08 },
  'roll-square': { width: 2.54, height: 2.54 },
  'roll-rectangle': { width: 2.54, height: 1.27 },
};

const PER_ROW: Record<string, number> = {
  'gt800-3col': 3,
  'gt800-1col': 1,
  'zebra-3x1-5cm': 1,
  'zebra-3x1-5cm-3row': 3,
  'zebra-3x1-5cm-4row': 4,
  'zebra-2x1': 1,
  small: 4,
  large: 2,
  'roll-square': 6,
  'roll-rectangle': 3,
};

interface PrintHistoryEntry {
  id: string;
  shopName: string;
  itemName: string;
  barcodeCode: string;
  price: number;
  secretCode: string;
  stickerSize: string;
  quantity: number;
  printedAt: string;
}

const HISTORY_KEY = 'ami-pos:barcode-history';

function loadHistory(): PrintHistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function generateBarcodeSvg(code: string): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(svg, code || '000000', {
      format: 'CODE128',
      displayValue: true,
      fontSize: 10,
      height: 34,
      width: 1.4,
      margin: 2,
      background: '#ffffff',
      lineColor: '#000000',
    });
    return svg.outerHTML;
  } catch {
    return `<span style="font-size:8px;color:red;">Invalid barcode: ${escapeHtml(code)}</span>`;
  }
}

export function BarcodePage() {
  const { success, error } = useToast();
  const [shopName, setShopName] = useState('');
  const [itemName, setItemName] = useState('');
  const [barcodeCode, setBarcodeCode] = useState('');
  const [price, setPrice] = useState(0);
  const [secretCode, setSecretCode] = useState('');
  const [stickerSize, setStickerSize] = useState('gt800-3col');
  const [quantityText, setQuantityText] = useState('1');
  const [history, setHistory] = useState<PrintHistoryEntry[]>(() => loadHistory());
  const [isPrinting, setIsPrinting] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const shopNameTouchedRef = useRef(false);
  const quantity = Math.max(1, Math.floor(Number(quantityText)) || 1);

  const { data: settingsData } = useQuery({
    queryKey: ['settings', 'barcode'],
    queryFn: () => apiClient.settings.getPublic(),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', 'barcode'],
    queryFn: () => apiClient.products.list({ limit: 2000 }),
  });

  const products = productsData?.data ?? [];
  const settings = settingsData?.data ?? {};
  const currencySymbol = settings.currencySymbol || 'Rs.';

  useEffect(() => {
    if (settings.shopName && !shopNameTouchedRef.current) setShopName(settings.shopName);
  }, [settings.shopName]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    } catch (err: any) {
      error('Could not save print history', err.message);
    }
  }, [history]);

  useEffect(() => {
    const container = previewRef.current;
    if (!container) return;
    const svg = container.querySelector('svg');
    if (svg) {
      try {
        JsBarcode(svg, barcodeCode || '000000', {
          format: 'CODE128',
          displayValue: true,
          fontSize: 10,
          height: 34,
          width: 1.4,
          margin: 2,
          background: '#ffffff',
          lineColor: '#000000',
        });
      } catch {
        // leave preview empty for invalid input
      }
    }
  }, [barcodeCode]);

  const previewDimensions = SIZE_DIMENSIONS[stickerSize] ?? SIZE_DIMENSIONS['gt800-3col'];

  const productOptions = useMemo(
    () => [
      { value: '', label: 'Select a product (optional)...' },
      ...products.map((product: any) => ({
        value: product.id,
        label: `${product.name} (${product.itemCode})`,
      })),
    ],
    [products],
  );

  const fillFromProduct = (productId: string) => {
    const product = products.find((candidate: any) => candidate.id === productId);
    if (!product) return;
    setItemName(product.name);
    setBarcodeCode(product.barcode || product.itemCode || '');
    setPrice(Number(product.sellingPrice || 0));
    if (!secretCode) setSecretCode(product.itemCode?.slice(-4) ?? '');
  };

  const buildStickerHtml = (code: string): string => {
    const barcodeSvg = generateBarcodeSvg(code);
    const priceLabel = price > 0 ? `${currencySymbol} ${Number(price).toFixed(2)}` : '';
    return `
      <div style="width:${previewDimensions.width}cm;height:${previewDimensions.height}cm;background:#ffffff;color:#000000;border:1px solid #000;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;padding:2px 4px;box-sizing:border-box;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;font-size:7px;font-weight:700;">
          <span>${escapeHtml(shopName)}</span>
          <span>${escapeHtml(secretCode)}</span>
        </div>
        <div style="font-size:7px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(itemName)}</div>
        <div style="display:flex;justify-content:center;">${barcodeSvg}</div>
        <div style="display:flex;justify-content:space-between;font-size:8px;font-weight:800;">
          <span>${priceLabel}</span>
          <span style="font-size:6px;">${escapeHtml(code)}</span>
        </div>
      </div>`;
  };

  const printLabels = () => {
    if (!barcodeCode.trim() || !itemName.trim()) {
      error('Missing details', 'Item name and barcode code are required');
      return;
    }
    setIsPrinting(true);
    const perRow = PER_ROW[stickerSize] ?? 1;
    const stickers: string[] = [];
    for (let index = 0; index < quantity; index += 1) {
      stickers.push(buildStickerHtml(barcodeCode));
    }
    const rows: string[] = [];
    for (let index = 0; index < stickers.length; index += perRow) {
      rows.push(
        `<div style="display:flex;gap:2mm;">${stickers.slice(index, index + perRow).join('')}</div>`,
      );
    }
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      error('Popup blocked', 'Allow popups to print labels');
      setIsPrinting(false);
      return;
    }
    printWindow.document.write(`<!DOCTYPE html><html><head><title>Barcode Labels</title>
      <style>
        @page { size: ${(previewDimensions.width + 0.4).toFixed(2)}cm ${(previewDimensions.height + 0.4).toFixed(2)}cm; margin: 2mm; }
        body { margin: 0; padding: 2mm; background: #ffffff; }
      </style></head><body>${rows.join('\n')}</body></html>`);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      setIsPrinting(false);
    }, 350);
    const entry: PrintHistoryEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      shopName,
      itemName,
      barcodeCode,
      price,
      secretCode,
      stickerSize,
      quantity,
      printedAt: new Date().toISOString(),
    };
    setHistory((current) => [entry, ...current].slice(0, 50));
    success('Labels queued', `${quantity} label${quantity === 1 ? '' : 's'} sent to printer`);
  };

  const reprintHistory = (entry: PrintHistoryEntry) => {
    setShopName(entry.shopName);
    setItemName(entry.itemName);
    setBarcodeCode(entry.barcodeCode);
    setPrice(entry.price);
    setSecretCode(entry.secretCode);
    setStickerSize(entry.stickerSize);
    setQuantityText(String(entry.quantity));
  };

  const clearHistory = () => setHistory([]);

  const historyColumns: Column<PrintHistoryEntry>[] = [
    { key: 'printedAt', header: 'Printed At', accessor: 'printedAt', width: '160px', render: (value) => formatDateTime(value) },
    { key: 'itemName', header: 'Item', accessor: 'itemName' },
    { key: 'barcodeCode', header: 'Barcode', accessor: 'barcodeCode', width: '140px', render: (value) => <span className="font-mono text-xs">{value}</span> },
    { key: 'price', header: 'Price', accessor: 'price', align: 'right', width: '100px', render: (value) => formatCurrency(value) },
    { key: 'quantity', header: 'Labels', accessor: 'quantity', align: 'center', width: '80px' },
    {
      key: 'stickerSize',
      header: 'Size',
      accessor: 'stickerSize',
      width: '150px',
      render: (value) => stickerSizes.find((size) => size.value === value)?.label.replace(/^⭐\s*/, '') ?? value,
    },
    {
      key: 'actions',
      header: '',
      accessor: 'actions',
      align: 'center',
      width: '110px',
      render: (_value, row) => (
        <div className="flex items-center justify-center gap-1">
          <Button size="sm" variant="outline" onClick={() => reprintHistory(row)}><Barcode className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setHistory((current) => current.filter((entry) => entry.id !== row.id))}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-secondary-900 dark:text-white">Barcode Label Printing</h1>
          <p className="text-secondary-500 dark:text-secondary-400">Generate and print price labels — Zebra GT 800 ready</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={printLabels} loading={isPrinting}><Printer className="h-4 w-4 mr-2" />Print {quantity} Label{quantity === 1 ? '' : 's'}</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">Label Details</h2>
          <Select label="Fill from Product" options={productOptions} onChange={(e) => fillFromProduct(e.target.value)} className="mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Shop Name"
              value={shopName}
              onChange={(e) => { shopNameTouchedRef.current = true; setShopName(e.target.value); }}
              placeholder="Shop name on label"
            />
            <Input label="Item Name" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="Item name on label" />
            <Input label="Barcode Code" value={barcodeCode} onChange={(e) => setBarcodeCode(e.target.value)} placeholder="Scan or type code" />
            <Input label="Price" type="number" min="0" step="0.01" value={price || ''} onChange={(e) => setPrice(Number(e.target.value) || 0)} />
            <Input label="Secret Code" value={secretCode} onChange={(e) => setSecretCode(e.target.value)} placeholder="Internal code" />
            <Select label="Sticker Size" options={stickerSizes} value={stickerSize} onChange={(e) => setStickerSize(e.target.value)} />
            <Input
              label="Label Quantity"
              type="number"
              min="1"
              step="1"
              value={quantityText}
              onChange={(e) => setQuantityText(e.target.value)}
              onBlur={() => { if (!quantityText || Number(quantityText) < 1) setQuantityText('1'); }}
            />
          </div>
        </Card>

        <Card className="p-5">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white mb-4">Preview</h2>
          <div className="flex justify-center py-4 bg-secondary-50 dark:bg-secondary-900 rounded-lg">
            <div
              className={cn('bg-white text-black border border-black flex flex-col justify-between overflow-hidden', isPrinting && 'opacity-60')}
              style={{ width: `${previewDimensions.width}cm`, height: `${previewDimensions.height}cm`, padding: '2px 4px', boxSizing: 'border-box' }}
            >
              <div className="flex justify-between text-[7px] font-bold leading-tight">
                <span className="truncate">{shopName}</span>
                <span>{secretCode}</span>
              </div>
              <div className="text-[7px] font-semibold truncate">{itemName}</div>
              <div ref={previewRef} className="flex justify-center [&_svg]:max-w-full [&_svg]:h-auto"><svg /></div>
              <div className="flex justify-between items-baseline">
                <span className="text-[8px] font-extrabold">{price > 0 ? `${currencySymbol} ${price.toFixed(2)}` : ''}</span>
                <span className="text-[6px]">{barcodeCode}</span>
              </div>
            </div>
          </div>
          <p className="text-center text-xs text-secondary-500 mt-3">
            {previewDimensions.width}cm × {previewDimensions.height}cm · {PER_ROW[stickerSize] ?? 1} per row
          </p>
          {isPrinting && <div className="flex justify-center mt-2"><Loader2 className="h-4 w-4 animate-spin" /></div>}
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between p-4 border-b border-secondary-200 dark:border-secondary-700">
          <h2 className="text-lg font-semibold text-secondary-900 dark:text-white">Print History</h2>
          {history.length > 0 && (
            <Button size="sm" variant="outline" onClick={clearHistory}>Clear History</Button>
          )}
        </div>
        <Table columns={historyColumns} data={history} keyAccessor="id" emptyMessage="No labels printed yet." striped hoverable />
      </Card>
    </div>
  );
}

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
