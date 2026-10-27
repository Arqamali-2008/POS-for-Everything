import { forwardRef, InputHTMLAttributes, TextareaHTMLAttributes, SelectHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../utils/helpers';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, fullWidth = true, id, leftIcon, rightIcon, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {leftIcon && (
            <span className="absolute left-3 flex items-center pointer-events-none text-secondary-400">
              {leftIcon}
            </span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={cn(
              'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-base text-secondary-900',
              'placeholder:text-secondary-400',
              'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
              'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary-50 dark:disabled:bg-secondary-800',
              'dark:bg-secondary-800 dark:border-secondary-600 dark:text-secondary-100 dark:placeholder:text-secondary-500',
              error && 'border-red-500 focus:ring-red-500',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {rightIcon && (
            <span className="absolute right-3 flex items-center pointer-events-none text-secondary-400">
              {rightIcon}
            </span>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="text-sm text-secondary-500 dark:text-secondary-400">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, hint, fullWidth = true, id, ...props }, ref) => {
    const textareaId = id || label?.toLowerCase().replace(/\s+/g, '-');
    
    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          className={cn(
            'flex min-h-[80px] w-full rounded-lg border bg-white px-3 py-2 text-base text-secondary-900',
            'placeholder:text-secondary-400',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary-50 dark:disabled:bg-secondary-800',
            'dark:bg-secondary-800 dark:border-secondary-600 dark:text-secondary-100 dark:placeholder:text-secondary-500',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${textareaId}-hint`} className="text-sm text-secondary-500 dark:text-secondary-400">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  fullWidth?: boolean;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, hint, fullWidth = true, options, placeholder, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');
    
    return (
      <div className={cn('flex flex-col gap-1.5', fullWidth && 'w-full')}>
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-secondary-700 dark:text-secondary-300">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'flex h-10 w-full rounded-lg border bg-white px-3 py-2 text-base text-secondary-900',
            'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50 disabled:bg-secondary-50 dark:disabled:bg-secondary-800',
            'dark:bg-secondary-800 dark:border-secondary-600 dark:text-secondary-100',
            error && 'border-red-500 focus:ring-red-500',
            className
          )}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <p id={`${selectId}-error`} className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${selectId}-hint`} className="text-sm text-secondary-500 dark:text-secondary-400">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  error?: string;
  fullWidth?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, error, fullWidth = false, id, ...props }, ref) => {
    const checkboxId = id || label.toLowerCase().replace(/\s+/g, '-');
    
    return (
      <div className={cn('flex items-start gap-2', fullWidth && 'w-full')}>
        <div className="flex items-center">
          <input
            ref={ref}
            type="checkbox"
            id={checkboxId}
            className={cn(
              'h-4 w-4 rounded border-secondary-300 text-primary-600',
              'focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
              'dark:border-secondary-600 dark:focus:ring-offset-secondary-900',
              error && 'border-red-500',
              className
            )}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${checkboxId}-error` : undefined}
            {...props}
          />
        </div>
        <label htmlFor={checkboxId} className="text-sm text-secondary-700 dark:text-secondary-300 cursor-pointer">
          {label}
        </label>
        {error && (
          <p id={`${checkboxId}-error`} className="text-sm text-red-500" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Checkbox.displayName = 'Checkbox';