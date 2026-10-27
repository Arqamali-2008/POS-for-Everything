function escapeCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns?: string[]): string {
  if (rows.length === 0) return '';
  const keys = columns ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const header = keys.map(escapeCell).join(',');
  const body = rows.map((row) => keys.map((key) => escapeCell(row[key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>, columns?: string[]): void {
  const csv = toCsv(rows, columns);
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
