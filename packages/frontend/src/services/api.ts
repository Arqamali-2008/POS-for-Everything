import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { getErrorMessage } from '../utils/helpers';
import { localStorageClient } from './localStorageClient';
import type { ApiResponse } from './apiTypes';
import { useAuthStore } from '../stores/authStore';

/**
 * Data mode
 * ---------
 * `local` (default): every business record is stored in the browser's
 * localStorage and no backend is required.
 * `api`: use the Express backend (`VITE_API_URL`) instead.
 */
export const dataMode = (import.meta.env.VITE_DATA_MODE || 'local').toLowerCase();
export const isLocalStorageMode = dataMode !== 'api';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';
const AUTH_STORAGE_KEY = 'ami-pos-auth';

const api: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

interface PersistedAuthState {
  accessToken?: string | null;
  refreshToken?: string | null;
}

function readPersistedAuth(): PersistedAuthState {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return (parsed?.state ?? parsed ?? {}) as PersistedAuthState;
  } catch {
    return {};
  }
}

function writePersistedTokens(accessToken: string, refreshToken: string): void {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    const state = (parsed.state ?? parsed) as PersistedAuthState;
    parsed.state = { ...state, accessToken, refreshToken };
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // Storage is optional; token refresh will still work for the current session.
  }
}

class ApiError extends Error {
  code?: string;
  status?: number;
  details?: unknown;

  constructor(message: string, options?: { code?: string; status?: number; details?: unknown }) {
    super(message);
    this.name = 'ApiError';
    this.code = options?.code;
    this.status = options?.status;
    this.details = options?.details;
  }
}

// Request interceptor for auth
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = readPersistedAuth().accessToken;
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = readPersistedAuth().refreshToken;
      if (!refreshToken) return null;
      const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
      const { accessToken, refreshToken: newRefreshToken } = response.data.data;
      writePersistedTokens(accessToken, newRefreshToken);
      useAuthStore.setState({ accessToken, refreshToken: newRefreshToken });
      return accessToken as string;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const accessToken = await refreshAccessToken();
        if (accessToken) {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          }
          return api(originalRequest);
        }
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        useAuthStore.getState().clearAuth();
        window.location.href = '/login';
      }
    }

    if (!error.response) {
      return Promise.reject(new ApiError('Network error. Please check your connection.', { code: 'NETWORK_ERROR' }));
    }

    return Promise.reject(new ApiError(getErrorMessage(error.response.data), {
      code: (error.response.data as any)?.code || 'API_ERROR',
      status: error.response.status,
      details: (error.response.data as any)?.details,
    }));
  },
);

async function request<T = any>(promise: Promise<{ data: any }>): Promise<ApiResponse<T>> {
  const response = await promise;
  return response.data as ApiResponse<T>;
}

const remoteClient = {
  auth: {
    login: (credentials: { email: string; password: string; rememberMe?: boolean }) =>
      request(api.post('/auth/login', credentials)),
    register: (data: { email: string; password: string; fullName: string; role?: string }) =>
      request(api.post('/auth/register', data)),
    refresh: (refreshToken: string) => request(api.post('/auth/refresh', { refreshToken })),
    logout: () => request(api.post('/auth/logout')),
    me: () => request(api.get('/auth/me')),
    changePassword: (data: { currentPassword: string; newPassword: string }) =>
      request(api.post('/auth/change-password', data)),
    resetPassword: (email: string) => request(api.post('/auth/reset-password', { email })),
  },
  products: {
    list: (params?: Record<string, unknown>) => request(api.get('/products', { params })),
    get: (id: string) => request(api.get(`/products/${id}`)),
    getByBarcode: (barcode: string) => request(api.get(`/products/barcode/${barcode}`)),
    create: (data: Record<string, unknown>) => request(api.post('/products', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/products/${id}`, data)),
    delete: (id: string) => request(api.delete(`/products/${id}`)),
    restore: (id: string) => request(api.post(`/products/${id}/restore`)),
    bulk: (products: Record<string, unknown>[]) => request(api.post('/products/bulk', { products })),
  },
  categories: {
    list: (params?: Record<string, unknown>) => request(api.get('/categories', { params })),
    get: (id: string) => request(api.get(`/categories/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/categories', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/categories/${id}`, data)),
    delete: (id: string) => request(api.delete(`/categories/${id}`)),
  },
  customers: {
    list: (params?: Record<string, unknown>) => request(api.get('/customers', { params })),
    get: (id: string) => request(api.get(`/customers/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/customers', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/customers/${id}`, data)),
    delete: (id: string) => request(api.delete(`/customers/${id}`)),
    ledger: (id: string, params?: Record<string, unknown>) =>
      request(api.get(`/customers/${id}/ledger`, { params })),
    addPayment: (id: string, data: Record<string, unknown>) =>
      request(api.post(`/customers/${id}/payments`, data)),
    removePayment: (id: string, paymentId: string) =>
      request(api.delete(`/customers/${id}/payments/${paymentId}`)),
  },
  suppliers: {
    list: (params?: Record<string, unknown>) => request(api.get('/suppliers', { params })),
    get: (id: string) => request(api.get(`/suppliers/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/suppliers', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/suppliers/${id}`, data)),
    delete: (id: string) => request(api.delete(`/suppliers/${id}`)),
  },
  sales: {
    list: (params?: Record<string, unknown>) => request(api.get('/sales', { params })),
    get: (id: string) => request(api.get(`/sales/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/sales', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/sales/${id}`, data)),
    cancel: (id: string) => request(api.post(`/sales/${id}/cancel`)),
    complete: (id: string, data?: Record<string, any>) => request(api.post(`/sales/${id}/complete`, data ?? {})),
    refund: (id: string, data: Record<string, unknown>) => request(api.post(`/sales/${id}/refund`, data)),
  },
  purchases: {
    list: (params?: Record<string, unknown>) => request(api.get('/purchases', { params })),
    get: (id: string) => request(api.get(`/purchases/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/purchases', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/purchases/${id}`, data)),
    delete: (id: string) => request(api.delete(`/purchases/${id}`)),
    receive: (id: string, data: Record<string, unknown>) => request(api.post(`/purchases/${id}/receive`, data)),
  },
  expenses: {
    list: (params?: Record<string, unknown>) => request(api.get('/expenses', { params })),
    get: (id: string) => request(api.get(`/expenses/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/expenses', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/expenses/${id}`, data)),
    delete: (id: string) => request(api.delete(`/expenses/${id}`)),
    approve: (id: string) => request(api.post(`/expenses/${id}/approve`)),
  },
  cheques: {
    list: (params?: Record<string, unknown>) => request(api.get('/cheques', { params })),
    get: (id: string) => request(api.get(`/cheques/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/cheques', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/cheques/${id}`, data)),
    delete: (id: string) => request(api.delete(`/cheques/${id}`)),
    updateStatus: (id: string, status: string) => request(api.patch(`/cheques/${id}/status`, { status })),
  },
  loans: {
    list: (params?: Record<string, unknown>) => request(api.get('/loans', { params })),
    get: (id: string) => request(api.get(`/loans/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/loans', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/loans/${id}`, data)),
    delete: (id: string) => request(api.delete(`/loans/${id}`)),
    addPayment: (id: string, data: Record<string, unknown>) =>
      request(api.post(`/loans/${id}/payments`, data)),
  },
  inventory: {
    adjustments: {
      list: (params?: Record<string, unknown>) => request(api.get('/inventory/adjustments', { params })),
      create: (data: Record<string, unknown>) => request(api.post('/inventory/adjustments', data)),
      approve: (id: string) => request(api.post(`/inventory/adjustments/${id}/approve`)),
    },
    stockMovements: (params?: Record<string, unknown>) =>
      request(api.get('/inventory/stock-movements', { params })),
    setStock: (productId: string, newStock: number, reason?: string) =>
      request(api.post('/inventory/set-stock', { productId, newStock, reason })),
  },
  employees: {
    list: (params?: Record<string, unknown>) => request(api.get('/employees', { params })),
    get: (id: string) => request(api.get(`/employees/${id}`)),
    create: (data: Record<string, unknown>) => request(api.post('/employees', data)),
    update: (id: string, data: Record<string, unknown>) => request(api.put(`/employees/${id}`, data)),
    delete: (id: string) => request(api.delete(`/employees/${id}`)),
  },
  settings: {
    get: () => request(api.get('/settings')),
    getPublic: () => request(api.get('/settings/public')),
    update: (key: string, value: unknown) => request(api.put('/settings', { key, value })),
    bulkUpdate: (settings: Record<string, unknown>) => request(api.put('/settings/bulk', { settings })),
    exportData: () => request(api.get('/backup/export')),
    importData: (payload: Record<string, unknown>) => request(api.post('/backup/import', payload)),
    resetData: () => request(api.post('/backup/reset')),
  },
  sync: {
    status: () => request(api.get('/sync/status')),
    trigger: (config?: Record<string, unknown>) => request(api.post('/sync/trigger', config)),
    push: (tables?: string[]) => request(api.post('/sync/push', { tables })),
    pull: (tables?: string[]) => request(api.post('/sync/pull', { tables })),
    resolveConflict: (data: {
      table: string;
      recordId: string;
      resolution: string;
      localData?: any;
      remoteData?: any;
    }) => request(api.post('/sync/conflict/resolve', data)),
  },
  health: {
    check: () => request(api.get('/health')),
    detailed: () => request(api.get('/health/detailed')),
  },
  database: {
    info: () => request(api.get('/database')),
    testPath: (path: string) => request(api.post('/database/test', { path })),
    switchPath: (path: string) => request(api.post('/database/path', { path })),
    backup: () => request(api.post('/database/backup')),
  },
  stats: {
    dashboard: (params?: Record<string, unknown>) => request(api.get('/stats/dashboard', { params })),
    sales: (params?: Record<string, unknown>) => request(api.get('/stats/sales', { params })),
    inventory: () => request(api.get('/stats/inventory')),
    customers: (params?: Record<string, unknown>) => request(api.get('/stats/customers', { params })),
  },
};

type DatabaseService = typeof remoteClient.database;

/**
 * Admin-only data-file endpoints (view path, test path, switch to the shared
 * network .db, backup). `null` in local mode — the browser has no file access.
 */
export const databaseApi: DatabaseService | null = isLocalStorageMode ? null : remoteClient.database;

export const apiClient = (
  isLocalStorageMode ? localStorageClient : remoteClient
) as unknown as typeof localStorageClient;

export default apiClient;
