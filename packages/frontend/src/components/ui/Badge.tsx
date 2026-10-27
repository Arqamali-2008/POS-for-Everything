import { HTMLAttributes, forwardRef } from 'react';
import { cn } from '../../utils/helpers';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  dot?: boolean;
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', dot = false, children, ...props }, ref) => {
    const variants = {
      default: 'bg-secondary-100 text-secondary-800 dark:bg-secondary-800 dark:text-secondary-200',
      success: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      warning: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
      info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      outline: 'bg-transparent border border-secondary-300 text-secondary-700 dark:border-secondary-600 dark:text-secondary-300',
    };

    const sizes = {
      sm: 'px-2 py-0.5 text-xs gap-1',
      md: 'px-2.5 py-1 text-sm gap-1.5',
      lg: 'px-3 py-1.5 text-base gap-2',
    };

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center font-medium rounded-full',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      >
        {dot && (
          <span className={cn('rounded-full', {
            'bg-secondary-500': variant === 'default',
            'bg-green-500': variant === 'success',
            'bg-yellow-500': variant === 'warning',
            'bg-red-500': variant === 'danger',
            'bg-blue-500': variant === 'info',
            'bg-secondary-400': variant === 'outline',
          })} style={{ width: size === 'sm' ? 6 : size === 'md' ? 8 : 10, height: size === 'sm' ? 6 : size === 'md' ? 8 : 10 }} />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = 'Badge';

export interface StatusBadgeProps {
  status: string;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'outline';
  size?: 'sm' | 'md' | 'lg';
}

const statusVariants: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  // Sales statuses
  Completed: 'success',
  Pending: 'warning',
  Cancelled: 'danger',
  Refunded: 'danger',
  Partial: 'warning',
  Held: 'info',
  
  // Purchase statuses
  Ordered: 'info',
  Received: 'success',
  Returned: 'danger',
  
  // Cheque statuses
  Cleared: 'success',
  Bounced: 'danger',
  Postdated: 'warning',
  
  // Loan statuses
  Active: 'info',
  Paid: 'success',
  Overdue: 'danger',
  Defaulted: 'danger',
  Restructured: 'warning',
  
  // Sync statuses
  connected: 'success',
  syncing: 'warning',
  synced: 'success',
  error: 'danger',
  conflict: 'warning',
  disconnected: 'default',
  
  // Payment types
  Cash: 'success',
  Card: 'info',
  UPI: 'info',
  Credit: 'warning',
  
  // General
  active: 'success',
  inactive: 'default',
  enabled: 'success',
  disabled: 'default',
  online: 'success',
  offline: 'danger',
};

export function StatusBadge({ status, variant, size = 'md' }: StatusBadgeProps) {
  const resolvedVariant = variant || statusVariants[status] || 'default';
  const label = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase().replace(/_/g, ' ');
  
  return <Badge variant={resolvedVariant} size={size}>{label}</Badge>;
}