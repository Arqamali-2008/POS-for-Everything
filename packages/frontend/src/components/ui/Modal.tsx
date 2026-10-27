import { Fragment, ReactNode, useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/helpers';
import { Button } from './Button';

const openModals: string[] = [];

function isTopmostModal(id: string) {
  return openModals[openModals.length - 1] === id;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  showCloseButton?: boolean;
  footer?: ReactNode;
}

export function Modal({
  isOpen,
  onClose,
  title,
  description,
  children,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  footer,
}: ModalProps) {
  const sizes = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    full: 'max-w-4xl',
  };

  const modalId = useId();
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && closeOnEscape && isTopmostModal(modalId)) {
      onClose();
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    openModals.push(modalId);
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button',
      );
      target?.focus();
    }, 30);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      const index = openModals.indexOf(modalId);
      if (index !== -1) openModals.splice(index, 1);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.clearTimeout(focusTimer);
      restoreFocusRef.current?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, closeOnEscape, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && closeOnOverlayClick) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <Fragment>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={handleOverlayClick}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
      >
        <div
          ref={panelRef}
          className={cn(
            'relative w-full bg-white dark:bg-secondary-800 rounded-xl shadow-elevated animate-scale-in',
            sizes[size]
          )}
          data-enter-nav
          onClick={(e) => e.stopPropagation()}
        >
          {(title || showCloseButton) && (
            <div className="flex items-start justify-between gap-4 p-6 border-b border-secondary-200 dark:border-secondary-700">
              <div>
                {title && (
                  <h2 id={titleId} className="text-lg font-semibold text-secondary-900 dark:text-secondary-100">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descriptionId} className="mt-1 text-sm text-secondary-500 dark:text-secondary-400">
                    {description}
                  </p>
                )}
              </div>
              {showCloseButton && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  aria-label="Close modal"
                  className="text-secondary-400 hover:text-secondary-600 dark:hover:text-secondary-300"
                >
                  <X className="h-5 w-5" />
                </Button>
              )}
            </div>
          )}
          <div className="p-6">
            {children}
          </div>
          {footer && (
            <div className="flex items-center justify-end gap-3 p-6 border-t border-secondary-200 dark:border-secondary-700">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Fragment>
  );
}

export interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  loading = false,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    if (loading) return;
    try {
      await onConfirm();
    } finally {
      onClose();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={(
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {cancelText}
          </Button>
          <Button variant={variant} onClick={handleConfirm} loading={loading}>
            {confirmText}
          </Button>
        </div>
      )}
    >
      <p className="text-secondary-600 dark:text-secondary-400">{message}</p>
    </Modal>
  );
}

export interface AlertDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmText?: string;
}

export function AlertDialog({
  isOpen,
  onClose,
  title,
  message,
  confirmText = 'OK',
}: AlertDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={(
        <div className="flex justify-end">
          <Button onClick={onClose}>{confirmText}</Button>
        </div>
      )}
    >
      <p className="text-secondary-600 dark:text-secondary-400">{message}</p>
    </Modal>
  );
}