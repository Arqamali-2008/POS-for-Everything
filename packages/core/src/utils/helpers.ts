/**
 * Utility Functions for AMi POS
 * Shared helpers used across frontend, backend, and database layers
 */

import { v4 as uuidv4 } from 'uuid';
import { UnitType } from '../constants/enums';
import type { PaymentType, CurrencyCode } from '../constants/enums';

// ============================================================================
// ID Generation
// ============================================================================

/**
 * Generate a UUID v4
 */
export function generateId(): string {
  return uuidv4();
}

/**
 * Generate a prefixed ID for human-readable identifiers
 * Format: PREFIX_timestamp_random
 */
export function generatePrefixedId(prefix: string): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}_${timestamp}_${random}`;
}

/**
 * Generate invoice number with prefix
 */
export function generateInvoiceNumber(prefix: string = 'INV', startNumber: number = 1): string {
  const paddedNumber = String(startNumber).padStart(6, '0');
  return `${prefix}-${paddedNumber}`;
}

/**
 * Generate PO number with prefix
 */
export function generatePONumber(prefix: string = 'PO', startNumber: number = 1): string {
  const paddedNumber = String(startNumber).padStart(6, '0');
  return `${prefix}-${paddedNumber}`;
}

/**
 * Generate item code
 */
export function generateItemCode(categoryPrefix: string = 'ITM', sequence: number = 1): string {
  return `${categoryPrefix}${String(sequence).padStart(6, '0')}`;
}

/**
 * Generate sales code for employees
 */
export function generateSalesCode(prefix: string = 'EMP', sequence: number = 1): string {
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

// ============================================================================
// Date & Time
// ============================================================================

/**
 * Get current ISO timestamp
 */
export function nowISO(): string {
  return new Date().toISOString();
}

/**
 * Get current date string (YYYY-MM-DD)
 */
export function todayISO(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date, format: 'short' | 'long' | 'iso' = 'short'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (format === 'iso') {
    return d.toISOString();
  }
  
  const options: Intl.DateTimeFormatOptions = format === 'short'
    ? { day: '2-digit', month: '2-digit', year: 'numeric' }
    : { day: '2-digit', month: 'short', year: 'numeric' };
  
  return d.toLocaleDateString('en-GB', options);
}

/**
 * Format time for display
 */
export function formatTime(date: string | Date, format: '12h' | '24h' = '24h'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  
  if (format === '12h') {
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Format date and time for display
 */
export function formatDateTime(date: string | Date, options?: { dateFormat?: 'short' | 'long'; timeFormat?: '12h' | '24h' }): string {
  return `${formatDate(date, options?.dateFormat)} ${formatTime(date, options?.timeFormat)}`;
}

/**
 * Get start of day
 */
export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Get end of day
 */
export function endOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Add days to date
 */
export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Get days between two dates
 */
export function daysBetween(start: Date, end: Date): number {
  const diff = end.getTime() - start.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Check if date is today
 */
export function isToday(date: string | Date): boolean {
  const d = typeof date === 'string' ? new Date(date) : date;
  const today = new Date();
  return d.toDateString() === today.toDateString();
}

// ============================================================================
// Number & Currency Formatting
// ============================================================================

/**
 * Round to specified decimal places
 */
export function round(value: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Format currency for display
 */
export function formatCurrency(
  amount: number,
  currency: string = 'LKR',
  symbol: string = 'Rs.',
  decimals: number = 2
): string {
  const rounded = round(amount, decimals);
  const formatted = rounded.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  
  return `${symbol} ${formatted}`;
}

/**
 * Parse currency string to number
 */
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[^\d.-]/g, '')) || 0;
}

/**
 * Calculate percentage
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return round((value / total) * 100, 2);
}

/**
 * Calculate discount amount
 */
export function calculateDiscount(amount: number, discountPercent: number): number {
  return round(amount * (discountPercent / 100), 2);
}

/**
 * Calculate tax amount
 */
export function calculateTax(amount: number, taxRate: number, inclusive: boolean = false): number {
  if (inclusive) {
    // Tax is included in the amount
    return round(amount - (amount / (1 + taxRate / 100)), 2);
  }
  // Tax is added on top
  return round(amount * (taxRate / 100), 2);
}

/**
 * Calculate grand total with discount and tax
 */
export function calculateGrandTotal(
  subtotal: number,
  discountPercent: number,
  taxRate: number,
  taxInclusive: boolean = false
): { discountAmount: number; taxableAmount: number; taxAmount: number; grandTotal: number } {
  const discountAmount = calculateDiscount(subtotal, discountPercent);
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = calculateTax(taxableAmount, taxRate, taxInclusive);
  const grandTotal = taxInclusive ? taxableAmount : taxableAmount + taxAmount;
  
  return {
    discountAmount: round(discountAmount),
    taxableAmount: round(taxableAmount),
    taxAmount: round(taxAmount),
    grandTotal: round(grandTotal),
  };
}

// ============================================================================
// Unit Conversion
// ============================================================================

const UNIT_CONVERSIONS: Record<UnitType, { baseUnit: UnitType; factor: number }> = {
  [UnitType.PCS]: { baseUnit: UnitType.PCS, factor: 1 },
  [UnitType.KG]: { baseUnit: UnitType.G, factor: 1000 },
  [UnitType.G]: { baseUnit: UnitType.G, factor: 1 },
  [UnitType.L]: { baseUnit: UnitType.ML, factor: 1000 },
  [UnitType.ML]: { baseUnit: UnitType.ML, factor: 1 },
  [UnitType.M]: { baseUnit: UnitType.CM, factor: 100 },
  [UnitType.CM]: { baseUnit: UnitType.CM, factor: 1 },
  [UnitType.BOX]: { baseUnit: UnitType.PCS, factor: 1 }, // Configurable per product
  [UnitType.PACK]: { baseUnit: UnitType.PCS, factor: 1 }, // Configurable per product
  [UnitType.DOZEN]: { baseUnit: UnitType.PCS, factor: 12 },
};

/**
 * Convert quantity between units
 */
export function convertUnit(
  quantity: number,
  fromUnit: UnitType,
  toUnit: UnitType,
  customFactor?: number // For BOX, PACK, etc.
): number {
  if (fromUnit === toUnit) return quantity;
  
  const fromConv = UNIT_CONVERSIONS[fromUnit];
  const toConv = UNIT_CONVERSIONS[toUnit];
  
  // Convert to base unit first
  let baseQuantity: number;
  if (fromUnit === UnitType.BOX || fromUnit === UnitType.PACK) {
    baseQuantity = quantity * (customFactor || 1);
  } else {
    baseQuantity = quantity * fromConv.factor;
  }
  
  // Convert from base unit to target unit
  if (toUnit === UnitType.BOX || toUnit === UnitType.PACK) {
    return baseQuantity / (customFactor || 1);
  }
  
  return baseQuantity / toConv.factor;
}

/**
 * Get display unit for quantity
 */
export function getDisplayUnit(quantity: number, unit: UnitType): { value: number; unit: UnitType } {
  if (unit === UnitType.G && quantity >= 1000) {
    return { value: round(quantity / 1000, 3), unit: UnitType.KG };
  }
  if (unit === UnitType.ML && quantity >= 1000) {
    return { value: round(quantity / 1000, 3), unit: UnitType.L };
  }
  if (unit === UnitType.CM && quantity >= 100) {
    return { value: round(quantity / 100, 2), unit: UnitType.M };
  }
  return { value: quantity, unit };
}

// ============================================================================
// String Utilities
// ============================================================================

/**
 * Generate slug from string
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Truncate string with ellipsis
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter of each word
 */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Mask sensitive data (phone, email, card)
 */
export function maskString(value: string, visibleStart: number = 3, visibleEnd: number = 2): string {
  if (value.length <= visibleStart + visibleEnd) return value;
  const masked = '*'.repeat(value.length - visibleStart - visibleEnd);
  return value.slice(0, visibleStart) + masked + value.slice(-visibleEnd);
}

/**
 * Validate phone number (Sri Lankan format)
 */
export function validatePhone(phone: string): boolean {
  const cleaned = phone.replace(/\D/g, '');
  // Sri Lankan mobile: 07X XXXXXXX or 947X XXXXXXX
  // Landline: 0XX XXXXXXX
  return /^(?:\+?94|0)?(?:7[0-9]|11|21|23|24|25|26|27|31|32|33|34|35|36|37|38|41|45|47|51|52|54|55|57|63|65|66|67|81|91)[0-9]{7}$/.test(cleaned);
}

/**
 * Validate email
 */
export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate GSTIN (Indian format - adapt as needed)
 */
export function validateGSTIN(gstin: string): boolean {
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.toUpperCase());
}

// ============================================================================
// Array & Object Utilities
// ============================================================================

/**
 * Group array by key
 */
export function groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
  return array.reduce((groups, item) => {
    const groupKey = String(item[key]);
    if (!groups[groupKey]) groups[groupKey] = [];
    groups[groupKey].push(item);
    return groups;
  }, {} as Record<string, T[]>);
}

/**
 * Sort array by multiple keys
 */
export function sortBy<T>(array: T[], keys: Array<{ key: keyof T; order?: 'asc' | 'desc' }>): T[] {
  return [...array].sort((a, b) => {
    for (const { key, order = 'asc' } of keys) {
      const aVal = a[key];
      const bVal = b[key];
      
      if (aVal < bVal) return order === 'asc' ? -1 : 1;
      if (aVal > bVal) return order === 'asc' ? 1 : -1;
    }
    return 0;
  });
}

/**
 * Remove duplicates from array by key
 */
export function uniqueBy<T>(array: T[], key: keyof T): T[] {
  const seen = new Set();
  return array.filter(item => {
    const k = item[key];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * Chunk array into smaller arrays
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Deep clone object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Deep merge objects
 */
export function deepMerge<T extends Record<string, unknown>>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  for (const key of Object.keys(source) as (keyof T)[]) {
    const sourceValue = source[key];
    const targetValue = target[key];
    
    if (
      sourceValue !== null &&
      typeof sourceValue === 'object' &&
      !Array.isArray(sourceValue) &&
      targetValue !== null &&
      typeof targetValue === 'object' &&
      !Array.isArray(targetValue)
    ) {
      (result as Record<string, unknown>)[key as string] = deepMerge(targetValue as Record<string, unknown>, sourceValue as Record<string, unknown>);
    } else if (sourceValue !== undefined) {
      (result as Record<string, unknown>)[key as string] = sourceValue;
    }
  }
  
  return result;
}

/**
 * Pick keys from object
 */
export function pick<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (key in obj) result[key] = obj[key];
  }
  return result;
}

/**
 * Omit keys from object
 */
export function omit<T extends Record<string, unknown>, K extends keyof T>(
  obj: T,
  keys: K[]
): Omit<T, K> {
  const result = { ...obj };
  for (const key of keys) {
    delete result[key];
  }
  return result;
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate required fields
 */
export function validateRequired<T extends Record<string, unknown>>(
  obj: T,
  fields: (keyof T)[]
): { valid: boolean; missing: string[] } {
  const missing = fields.filter(field => !obj[field] || (typeof obj[field] === 'string' && !obj[field].toString().trim()));
  return { valid: missing.length === 0, missing: missing as string[] };
}

/**
 * Validate numeric range
 */
export function validateRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Validate positive number
 */
export function validatePositive(value: number): boolean {
  return value > 0;
}

/**
 * Validate non-negative number
 */
export function validateNonNegative(value: number): boolean {
  return value >= 0;
}

// ============================================================================
// LocalStorage / IndexedDB Helpers (Frontend)
// ============================================================================

/**
 * Safe localStorage getter
 */
export function getLocalStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Safe localStorage setter
 */
export function setLocalStorage<T>(key: string, value: T): boolean {
  if (typeof window === 'undefined') return false;
  
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Remove from localStorage
 */
export function removeLocalStorage(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}

/**
 * Clear all app localStorage
 */
export function clearAppStorage(prefix: string = 'ami_pos_'): void {
  if (typeof window === 'undefined') return;
  
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

// ============================================================================
// Debounce & Throttle
// ============================================================================

/**
 * Debounce function
 */
export function debounce<T extends (...args: unknown[]) => unknown>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle function
 */
export function throttle<T extends (...args: unknown[]) => unknown>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => (inThrottle = false), limit);
    }
  };
}

// ============================================================================
// Error Handling
// ============================================================================

/**
 * Create standardized error
 */
export function createError(code: string, message: string, details?: unknown): Error & { code: string; details?: unknown } {
  const error = new Error(message) as Error & { code: string; details?: unknown };
  error.code = code;
  error.details = details;
  return error;
}

/**
 * Check if error is a specific code
 */
export function isErrorCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && (error as { code: string }).code === code;
}

/**
 * Safe async wrapper
 */
export async function safeAsync<T>(
  promise: Promise<T>
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const data = await promise;
    return { data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

// ============================================================================
// Environment Helpers
// ============================================================================

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return process.env.NODE_ENV === 'development';
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Check if running in test
 */
export function isTest(): boolean {
  return process.env.NODE_ENV === 'test';
}

/**
 * Check if running in browser
 */
export function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Check if running in Node.js
 */
export function isNode(): boolean {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null;
}

/**
 * Get environment variable with default
 */
export function getEnv(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

/**
 * Get environment variable as number
 */
export function getEnvNumber(key: string, defaultValue: number = 0): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) : defaultValue;
}

/**
 * Get environment variable as boolean
 */
export function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

// ============================================================================
// Color Utilities
// ============================================================================

/**
 * Generate color from string (for avatars, categories, etc.)
 */
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

/**
 * Get contrasting text color (black or white) for background
 */
export function getContrastColor(hexColor: string): '#000000' | '#FFFFFF' {
  const r = parseInt(hexColor.slice(1, 3), 16);
  const g = parseInt(hexColor.slice(3, 5), 16);
  const b = parseInt(hexColor.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#FFFFFF';
}

// ============================================================================
// Export all utilities
// ============================================================================

export const utils = {
  // ID Generation
  generateId,
  generatePrefixedId,
  generateInvoiceNumber,
  generatePONumber,
  generateItemCode,
  generateSalesCode,
  
  // Date & Time
  nowISO,
  todayISO,
  formatDate,
  formatTime,
  formatDateTime,
  startOfDay,
  endOfDay,
  addDays,
  daysBetween,
  isToday,
  
  // Number & Currency
  round,
  formatCurrency,
  parseCurrency,
  calculatePercentage,
  calculateDiscount,
  calculateTax,
  calculateGrandTotal,
  
  // Unit Conversion
  convertUnit,
  getDisplayUnit,
  
  // String
  slugify,
  truncate,
  titleCase,
  maskString,
  validatePhone,
  validateEmail,
  validateGSTIN,
  
  // Array & Object
  groupBy,
  sortBy,
  uniqueBy,
  chunk,
  deepClone,
  deepMerge,
  pick,
  omit,
  
  // Validation
  validateRequired,
  validateRange,
  validatePositive,
  validateNonNegative,
  
  // Storage
  getLocalStorage,
  setLocalStorage,
  removeLocalStorage,
  clearAppStorage,
  
  // Timing
  debounce,
  throttle,
  
  // Error Handling
  createError,
  isErrorCode,
  safeAsync,
  
  // Environment
  isDevelopment,
  isProduction,
  isTest,
  isBrowser,
  isNode,
  getEnv,
  getEnvNumber,
  getEnvBoolean,
  
  // Color
  stringToColor,
  getContrastColor,
};