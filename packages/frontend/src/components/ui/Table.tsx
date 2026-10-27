import { useMemo, type ReactNode } from 'react';
import { cn } from '../../utils/helpers';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  accessor: string | number | symbol | ((row: T) => ReactNode);
  width?: string;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (value: any, row: T) => ReactNode;
  className?: string;
}

export interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyAccessor: keyof T | ((row: T) => string);
  loading?: boolean;
  emptyMessage?: string;
  rowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
  striped?: boolean;
  hoverable?: boolean;
  compact?: boolean;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  onSort?: (key: string, order: 'asc' | 'desc') => void;
}

const ALIGN_CLASS: Record<'left' | 'center' | 'right', string> = {
  left: 'text-left',
  center: 'text-center',
  right: 'text-right',
};

const HEADER_JUSTIFY: Record<'left' | 'center' | 'right', string> = {
  left: '',
  center: 'justify-center',
  right: 'justify-end',
};

export function Table<T>({
  columns,
  data,
  keyAccessor,
  loading = false,
  emptyMessage = 'No data available',
  rowClassName,
  onRowClick,
  striped = true,
  hoverable = true,
  compact = false,
  sortBy,
  sortOrder,
  onSort,
}: TableProps<T>) {
  const getRowKey = (row: T) => 
    typeof keyAccessor === 'function' ? keyAccessor(row) : String(row[keyAccessor]);

  const handleSort = (key: string) => {
    if (!onSort) return;
    const newOrder = sortBy === key && sortOrder === 'asc' ? 'desc' : 'asc';
    onSort(key, newOrder);
  };

  const SortIcon = ({ columnKey }: { columnKey: string }) => {
    if (sortBy !== columnKey) return <ChevronsUpDown className="h-4 w-4 text-secondary-400" />;
    return sortOrder === 'asc'
      ? <ChevronUp className="h-4 w-4 text-primary-600" />
      : <ChevronDown className="h-4 w-4 text-primary-600" />;
  };

  const alignClass = (col: Column<T>) => (col.align ? ALIGN_CLASS[col.align] : '');

  if (loading) {
    return (
      <div className="overflow-x-auto rounded-lg border border-secondary-200 dark:border-secondary-700">
        <table className="w-full">
          <thead>
            <tr className="border-b border-secondary-200 dark:border-secondary-700">
              {columns.map((col) => (
                <th key={col.key} className={cn('px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider', compact && 'py-2', alignClass(col), col.className)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-secondary-200 dark:border-secondary-700">
                {columns.map((col) => (
                  <td key={col.key} className={cn('px-4 py-3', compact && 'py-2', alignClass(col))}>
                    <div className="h-4 bg-secondary-200 dark:bg-secondary-700 rounded animate-pulse" style={{ width: '60%' }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="rounded-lg border border-secondary-200 dark:border-secondary-700 p-12 text-center">
        <p className="text-secondary-500 dark:text-secondary-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-secondary-200 dark:border-secondary-700">
      <table className="w-full" role="grid">
        <thead>
          <tr className="border-b border-secondary-200 dark:border-secondary-700 bg-secondary-50 dark:bg-secondary-800/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn(
                  'px-4 py-3 text-left text-xs font-medium text-secondary-500 dark:text-secondary-400 uppercase tracking-wider',
                  alignClass(col),
                  col.sortable && 'cursor-pointer select-none hover:bg-secondary-100 dark:hover:bg-secondary-700/50',
                  col.className
                )}
                style={{ width: col.width }}
                onClick={() => col.sortable && handleSort(col.key)}
                scope="col"
              >
                <div className={cn('flex items-center gap-1', HEADER_JUSTIFY[col.align ?? 'left'])}>
                  {col.header}
                  {col.sortable && <SortIcon columnKey={col.key} />}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-secondary-200 dark:divide-secondary-700">
          {data.map((row, rowIndex) => {
            const rowKey = getRowKey(row);
            const isClickable = !!onRowClick;
            
            return (
              <tr
                key={rowKey}
                className={cn(
                  'transition-colors',
                  striped && rowIndex % 2 === 1 && 'bg-secondary-50 dark:bg-secondary-800/50',
                  hoverable && isClickable && 'hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer',
                  rowClassName?.(row)
                )}
                onClick={(e) => {
                  if (!isClickable) return;
                  if ((e.target as HTMLElement).closest('button, a, input, select')) return;
                  onRowClick(row);
                }}
                role={isClickable ? 'button' : undefined}
                tabIndex={isClickable ? 0 : undefined}
                onKeyDown={(e) => isClickable && (e.key === 'Enter' || e.key === ' ') && onRowClick(row)}
              >
                {columns.map((col) => {
                  const value = typeof col.accessor === 'function' 
                    ? col.accessor(row) 
                    : row[col.accessor as keyof T];
                  
                  return (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 text-sm text-secondary-900 dark:text-secondary-100',
                        compact && 'py-2',
                        alignClass(col),
                        col.className
                      )}
                      style={{ width: col.width }}
                    >
                      {col.render ? col.render(value, row) : value as ReactNode}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
}

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  showPageSizeSelector = true,
}: PaginationProps) {
  const pages = useMemo(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    if (currentPage <= 4) {
      return [1, 2, 3, 4, 5, '...', totalPages];
    }
    
    if (currentPage >= totalPages - 3) {
      return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    }
    
    return [1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages];
  }, [currentPage, totalPages]);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-t border-secondary-200 dark:border-secondary-700">
      <div className="text-sm text-secondary-600 dark:text-secondary-400">
        Showing {Math.min((currentPage - 1) * pageSize + 1, totalItems)} to {Math.min(currentPage * pageSize, totalItems)} of {totalItems} results
      </div>
      
      <div className="flex items-center gap-2">
        {showPageSizeSelector && onPageSizeChange && (
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 px-2 text-sm border border-secondary-300 dark:border-secondary-600 rounded-lg bg-white dark:bg-secondary-800"
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size} per page
              </option>
            ))}
          </select>
        )}
        
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg text-secondary-600 hover:bg-secondary-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-secondary-400 dark:hover:bg-secondary-700"
            aria-label="First page"
          >
            ««
          </button>
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="p-2 rounded-lg text-secondary-600 hover:bg-secondary-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-secondary-400 dark:hover:bg-secondary-700"
            aria-label="Previous page"
          >
            «
          </button>
          
          {pages.map((page, index) => 
            page === '...' ? (
              <span key={`ellipsis-${index}`} className="px-2 text-secondary-400">...</span>
            ) : (
              <button
                key={page}
                onClick={() => onPageChange(page as number)}
                className={cn(
                  'w-8 h-8 rounded-lg text-sm font-medium transition-colors',
                  currentPage === page
                    ? 'bg-primary-600 text-white'
                    : 'text-secondary-600 hover:bg-secondary-100 dark:text-secondary-400 dark:hover:bg-secondary-700'
                )}
                aria-label={`Page ${page}`}
                aria-current={currentPage === page ? 'page' : undefined}
              >
                {page}
              </button>
            )
          )}
          
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg text-secondary-600 hover:bg-secondary-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-secondary-400 dark:hover:bg-secondary-700"
            aria-label="Next page"
          >
            »
          </button>
          <button
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="p-2 rounded-lg text-secondary-600 hover:bg-secondary-100 disabled:opacity-50 disabled:cursor-not-allowed dark:text-secondary-400 dark:hover:bg-secondary-700"
            aria-label="Last page"
          >
            »»
          </button>
        </div>
      </div>
    </div>
  );
}