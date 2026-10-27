import { useCallback, useEffect } from 'react';
import { create } from 'zustand';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '../../utils/helpers';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  dismissible?: boolean;
}

interface ToastState {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearToasts: () => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  addToast: (toast) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const newToast: Toast = { ...toast, id };
    set((state) => ({ toasts: [...state.toasts, newToast] }));
    return id;
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((item) => item.id !== id) })),
  clearToasts: () => set({ toasts: [] }),
}));

export function useToast() {
  const addToast = useToastStore((state) => state.addToast);
  const removeToast = useToastStore((state) => state.removeToast);
  const clearToasts = useToastStore((state) => state.clearToasts);

  const toast = useCallback(
    (options: Omit<Toast, 'id'>) => addToast(options),
    [addToast],
  );

  const success = useCallback(
    (title: string, message?: string, options?: Partial<Toast>) =>
      addToast({ type: 'success', title, message, ...options }),
    [addToast],
  );

  const error = useCallback(
    (title: string, message?: string, options?: Partial<Toast>) =>
      addToast({ type: 'error', title, message, ...options }),
    [addToast],
  );

  const warning = useCallback(
    (title: string, message?: string, options?: Partial<Toast>) =>
      addToast({ type: 'warning', title, message, ...options }),
    [addToast],
  );

  const info = useCallback(
    (title: string, message?: string, options?: Partial<Toast>) =>
      addToast({ type: 'info', title, message, ...options }),
    [addToast],
  );

  return { toast, success, error, warning, info, removeToast, clearToasts };
}

function ToastItem({ toast, removeToast }: { toast: Toast; removeToast: (id: string) => void }) {
  const icons = {
    success: CheckCircle,
    error: AlertCircle,
    warning: AlertTriangle,
    info: Info,
  };

  const colors = {
    success: 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400',
    error: 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800 dark:bg-yellow-900/20 dark:border-yellow-800 dark:text-yellow-400',
    info: 'bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-900/20 dark:border-blue-800 dark:text-blue-400',
  };

  const Icon = icons[toast.type];
  const onClose = useCallback(() => removeToast(toast.id), [removeToast, toast.id]);

  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => onClose(), toast.duration || 5000);
      return () => clearTimeout(timer);
    }
  }, [toast, onClose]);

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border shadow-lg animate-slide-up',
        colors[toast.type],
      )}
      role="alert"
    >
      <div className="flex-shrink-0 mt-0.5">
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium">{toast.title}</p>
        {toast.message && <p className="mt-1 text-sm opacity-90">{toast.message}</p>}

        {toast.action && (
          <button
            onClick={() => {
              toast.action?.onClick();
              onClose();
            }}
            className="mt-2 text-sm font-medium underline hover:no-underline"
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {toast.dismissible !== false && (
        <button
          onClick={onClose}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4 opacity-50 hover:opacity-100" />
        </button>
      )}
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full"
      aria-live="polite"
      aria-atomic="true"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} removeToast={removeToast} />
      ))}
    </div>
  );
}

// Global toast helpers for non-React contexts
export const toast = {
  success: (title: string, message?: string) =>
    useToastStore.getState().addToast({ type: 'success', title, message }),
  error: (title: string, message?: string) =>
    useToastStore.getState().addToast({ type: 'error', title, message }),
  warning: (title: string, message?: string) =>
    useToastStore.getState().addToast({ type: 'warning', title, message }),
  info: (title: string, message?: string) =>
    useToastStore.getState().addToast({ type: 'info', title, message }),
};
