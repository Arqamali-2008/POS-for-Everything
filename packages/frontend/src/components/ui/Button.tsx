import { forwardRef, ButtonHTMLAttributes } from 'react';
import { cn } from '../../utils/helpers';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'success';
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'icon';
  loading?: boolean;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ 
    className, 
    variant = 'primary', 
    size = 'md', 
    loading = false, 
    fullWidth = false,
    disabled, 
    children, 
    ...props 
  }, ref) => {
    const baseStyles = `
      inline-flex items-center justify-center font-medium rounded-lg transition-all duration-200
      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
      disabled:opacity-50 disabled:cursor-not-allowed
      active:scale-[0.98]
    `;

    const variants = {
      primary: 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm',
      secondary: 'bg-secondary-100 text-secondary-900 hover:bg-secondary-200 dark:bg-secondary-800 dark:text-secondary-100 dark:hover:bg-secondary-700',
      outline: 'border-2 border-primary-600 text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20',
      ghost: 'text-secondary-700 hover:bg-secondary-100 dark:text-secondary-300 dark:hover:bg-secondary-800',
      danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
      success: 'bg-green-600 text-white hover:bg-green-700 shadow-sm',
    };

    const sizes = {
      sm: 'px-3 py-1.5 text-sm gap-1.5',
      md: 'px-4 py-2 text-base gap-2',
      lg: 'px-6 py-3 text-lg gap-2',
      xl: 'px-8 py-4 text-xl gap-3',
      icon: 'p-2',
    };

    return (
      <button
        ref={ref}
        className={cn(
          baseStyles,
          variants[variant],
          sizes[size],
          fullWidth && 'w-full',
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
              fill="none"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';