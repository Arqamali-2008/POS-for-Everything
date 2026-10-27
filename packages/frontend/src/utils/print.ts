import { formatCurrency, formatDateTime } from './helpers';

interface PrintSettings {
  shopName?: string;
  shopAddress?: string;
  shopPhone?: string;
  shopEmail?: string;
  taxId?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  currencySymbol?: string;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function openPrintWindow(title: string, body: string): void {
  const win = window.open('', '_blank', 'width=420,height=700');
  if (!win) return;
  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: 'Courier New', Courier, monospace; font-size: 12px; color: #111; margin: 0; padding: 12px; width: 80mm; }
    h1 { font-size: 17px; margin: 0 0 4px; text-align: center; }
    .muted { color: #555; }
    .center { text-align: center; }
    .row { display: flex; justify-content: space-between; gap: 8px; }
    .divider { border-top: 1px dashed #999; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 3px 0; text-align: left; vertical-align: top; }
    th { border-bottom: 1px solid #999; font-size: 11px; }
    td.qty, th.qty { text-align: center; width: 34px; }
    td.amount, th.amount { text-align: right; width: 68px; }
    .total { font-size: 15px; font-weight: bold; }
    .footer { margin-top: 10px; text-align: center; font-size: 11px; }
    .dev-credit { margin-top: 6px; text-align: center; font-size: 10px; color: #777; }
    @page { margin: 0; }
  </style>
</head>
<body>${body}</body>
</html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
    win.close();
  }, 250);
}

export function printReceipt(sale: any, settings: PrintSettings = {}): void {
  const items = sale.items ?? [];
  const rows = items
    .map(
      (item: any) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td class="qty">${Number(item.quantity || 0)}</td>
        <td class="amount">${formatCurrency(Number(item.unitPrice || 0))}</td>
        <td class="amount">${formatCurrency(Number(item.lineTotal || 0))}</td>
      </tr>`,
    )
    .join('');

  const body = `
    <h1>${escapeHtml(settings.shopName || 'POS for Everything')}</h1>
    <div class="center muted">
      ${settings.shopAddress ? `${escapeHtml(settings.shopAddress)}<br/>` : ''}
      ${settings.shopPhone ? `${escapeHtml(settings.shopPhone)}<br/>` : ''}
      ${settings.taxId ? `Tax ID: ${escapeHtml(settings.taxId)}` : ''}
    </div>
    <div class="divider"></div>
    <div class="row"><span>Invoice</span><strong>${escapeHtml(sale.invoiceNo)}</strong></div>
    <div class="row"><span>Date</span><span>${escapeHtml(formatDateTime(sale.createdAt))}</span></div>
    <div class="row"><span>Customer</span><span>${escapeHtml(sale.customerName || 'Walk-in Customer')}</span></div>
    <div class="row"><span>Cashier</span><span>${escapeHtml(sale.cashierName || 'Cashier')}</span></div>
    <div class="divider"></div>
    <table>
      <thead><tr><th>Item</th><th class="qty">Qty</th><th class="amount">Price</th><th class="amount">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="divider"></div>
    <div class="row"><span>Subtotal</span><span>${formatCurrency(Number(sale.subtotal || 0))}</span></div>
    ${Number(sale.discountAmount || 0) ? `<div class="row"><span>Discount</span><span>-${formatCurrency(Number(sale.discountAmount))}</span></div>` : ''}
    ${Number(sale.taxAmount || 0) ? `<div class="row"><span>Tax</span><span>${formatCurrency(Number(sale.taxAmount))}</span></div>` : ''}
    <div class="row total"><span>Total</span><span>${formatCurrency(Number(sale.grandTotal || 0))}</span></div>
    <div class="row"><span>Paid (${escapeHtml(sale.paymentType || 'Cash')})</span><span>${formatCurrency(Number(sale.amountPaid || 0))}</span></div>
    ${(Number(sale.changeDue || 0) > 0 && sale.paymentType !== 'Credit') ? `<div class="row"><span>Change</span><span>${formatCurrency(Number(sale.changeDue))}</span></div>` : ''}
    ${Number(sale.balanceDue || 0) ? `<div class="row"><span>Balance due</span><span>${formatCurrency(Number(sale.balanceDue))}</span></div>` : ''}
    ${sale.note ? `<div class="divider"></div><div class="muted">Note: ${escapeHtml(sale.note)}</div>` : ''}
    <div class="footer">
      ${escapeHtml(settings.receiptHeader || '')}
      <br/>
      ${escapeHtml(settings.receiptFooter || 'Thank you for your business!')}
      <br/><br/>
      ${escapeHtml(settings.shopEmail || '')}
      <div class="dev-credit">Designed and Developed By AMi</div>
    </div>
  `;

  openPrintWindow(`Receipt ${sale.invoiceNo}`, body);
}

export function printPurchaseOrder(purchase: any, settings: PrintSettings = {}): void {
  const items = purchase.items ?? [];
  const rows = items
    .map(
      (item: any) => `<tr>
        <td>${escapeHtml(item.name)}</td>
        <td class="qty">${Number(item.quantity || 0)}</td>
        <td class="amount">${formatCurrency(Number(item.unitCost || 0))}</td>
        <td class="amount">${formatCurrency(Number(item.lineTotal || 0))}</td>
      </tr>`,
    )
    .join('');

  const body = `
    <h1>${escapeHtml(settings.shopName || 'POS for Everything')}</h1>
    <div class="center muted">Purchase Order</div>
    <div class="divider"></div>
    <div class="row"><span>PO Number</span><strong>${escapeHtml(purchase.poNumber)}</strong></div>
    <div class="row"><span>Date</span><span>${escapeHtml(formatDateTime(purchase.createdAt))}</span></div>
    <div class="row"><span>Supplier</span><span>${escapeHtml(purchase.supplierName || '-')}</span></div>
    <div class="row"><span>Status</span><span>${escapeHtml(purchase.status || '-')}</span></div>
    <div class="divider"></div>
    <table>
      <thead><tr><th>Item</th><th class="qty">Qty</th><th class="amount">Cost</th><th class="amount">Total</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="divider"></div>
    <div class="row total"><span>Total</span><span>${formatCurrency(Number(purchase.grandTotal || 0))}</span></div>
    ${purchase.note ? `<div class="divider"></div><div class="muted">Note: ${escapeHtml(purchase.note)}</div>` : ''}
    <div class="divider"></div>
    <div class="footer">
      ${escapeHtml(settings.receiptFooter || 'Thank you for your business!')}
      <div class="dev-credit">Designed and Developed By AMi</div>
    </div>
  `;

  openPrintWindow(`PO ${purchase.poNumber}`, body);
}
