/**
 * Database Provider Interfaces
 * Abstract interface that all database providers must implement
 */

import type {
  DatabaseProvider,
  SyncStatus,
  SyncDirection,
  ConflictResolution,
  DatabaseConfig,
} from '@pospro/core';
import type {
  QueryOptions,
  PaginatedResponse,
  ApiResponse,
  RealtimePayload,
  SyncLog,
  AuditLog,
  QueryFilter,
  SortOption,
  QueryParams,
} from '@pospro/core';

// Re-export the shared core types so provider modules can import them from here.
export type {
  DatabaseProvider,
  SyncStatus,
  SyncDirection,
  ConflictResolution,
  DatabaseConfig,
  QueryOptions,
  PaginatedResponse,
  ApiResponse,
  RealtimePayload,
  SyncLog,
  AuditLog,
  QueryFilter,
  SortOption,
  QueryParams,
};

// ============================================================================
// Core Types
// ============================================================================

export interface TransactionContext {
  // Provider-specific transaction context
  [key: string]: any;
}

export type TransactionCallback<T> = (tx: TransactionContext) => Promise<T>;

export interface RealtimeSubscription {
  unsubscribe: () => Promise<void>;
  table: string;
  callback: (payload: RealtimePayload) => void;
}

export interface SyncResult {
  success: boolean;
  pushed: number;
  pulled: number;
  conflicts: number;
  errors: SyncError[];
  durationMs: number;
}

export interface SyncError {
  table: string;
  recordId?: string;
  operation: 'create' | 'update' | 'delete';
  error: string;
  resolved: boolean;
  resolution?: ConflictResolution;
}

export interface HealthCheckResult {
  healthy: boolean;
  latencyMs: number;
  version?: string;
  details?: Record<string, unknown>;
}

// ============================================================================
// Database Provider Interface
// ============================================================================

export interface DatabaseProviderInterface {
  // Provider identification
  readonly provider: DatabaseProvider;
  readonly name: string;
  
  // Connection lifecycle
  connect(config: DatabaseConfig): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  healthCheck(): Promise<HealthCheckResult>;
  
  // Schema management
  createSchema(): Promise<void>;
  dropSchema(): Promise<void>;
  migrate(): Promise<void>;
  getMigrationStatus(): Promise<{ applied: number; pending: number }>;
  
  // Generic CRUD Operations
  findMany<T = any>(table: string, params?: QueryParams): Promise<T[]>;
  findFirst<T = any>(table: string, params?: QueryParams): Promise<T | null>;
  findById<T = any>(table: string, id: string): Promise<T | null>;
  count(table: string, filters?: QueryFilter[]): Promise<number>;

  create<T = any>(table: string, data: Record<string, any> & { id?: string }): Promise<T>;
  createMany<T = any>(table: string, data: Array<Record<string, any> & { id?: string }>): Promise<T[]>;

  update<T = any>(table: string, id: string, data: Record<string, any>): Promise<T>;
  updateMany<T = any>(table: string, filters: QueryFilter[], data: Record<string, any>): Promise<number>;
  
  delete(table: string, id: string): Promise<void>;
  deleteMany(table: string, filters: QueryFilter[]): Promise<number>;
  
  // Soft delete
  softDelete(table: string, id: string): Promise<void>;
  restore(table: string, id: string): Promise<void>;
  
  // Transactions
  transaction<T>(callback: TransactionCallback<T>): Promise<T>;
  
  // Batch operations
  batch(operations: BatchOperation[]): Promise<BatchResult[]>;
  
  // Real-time subscriptions
  subscribe(table: string, callback: (payload: RealtimePayload) => void): Promise<RealtimeSubscription>;
  unsubscribe(subscription: RealtimeSubscription): Promise<void>;
  
  // Sync (for cloud providers)
  sync?(config: SyncConfig): Promise<SyncResult>;
  getSyncStatus?(): Promise<SyncStatus>;
  getLastSyncTime?(): Promise<Date | null>;
  
  // Raw query access (for complex queries)
  rawQuery<T>(sql: string, params?: unknown[]): Promise<T[]>;
  rawExecute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: string }>;
  
  // Provider-specific features
  getProviderFeatures(): ProviderFeatures;
}

export interface SyncConfig {
  enabled: boolean;
  intervalMs: number;
  batchSize: number;
  maxRetries: number;
  retryDelayMs: number;
  conflictResolution: ConflictResolution;
  tables: string[];
  direction: SyncDirection;
}

export interface ProviderFeatures {
  realtime: boolean;
  transactions: boolean;
  batchOperations: boolean;
  softDelete: boolean;
  fullTextSearch: boolean;
  jsonQueries: boolean;
  sync: boolean;
  offlineSupport: boolean;
  migrations: boolean;
}

export interface BatchOperation {
  type: 'create' | 'update' | 'delete' | 'softDelete' | 'restore';
  table: string;
  id?: string;
  data?: Record<string, unknown>;
  filters?: QueryFilter[];
}

export interface BatchResult {
  success: boolean;
  operation: BatchOperation;
  result?: unknown;
  error?: string;
}

// ============================================================================
// Repository Interface (Higher-level abstraction)
// ============================================================================

export interface Repository<T extends { id: string }> {
  readonly tableName: string;
  
  // Basic CRUD
  findAll(params?: QueryParams): Promise<T[]>;
  findOne(params?: QueryParams): Promise<T | null>;
  findById(id: string): Promise<T | null>;
  findByIds(ids: string[]): Promise<T[]>;
  count(filters?: QueryFilter[]): Promise<number>;
  exists(id: string): Promise<boolean>;
  
  create(data: Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<T>;
  createMany(data: Array<Omit<T, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }>): Promise<T[]>;
  
  update(id: string, data: Partial<T>): Promise<T>;
  updateMany(filters: QueryFilter[], data: Partial<T>): Promise<number>;
  
  delete(id: string): Promise<void>;
  deleteMany(filters: QueryFilter[]): Promise<number>;
  softDelete(id: string): Promise<void>;
  restore(id: string): Promise<void>;
  
  // Pagination
  paginate(params: QueryParams & { page: number; pageSize: number }): Promise<PaginatedResponse<T>>;
  
  // Search
  search(query: string, fields: string[], params?: QueryParams): Promise<T[]>;
  
  // Real-time
  subscribe(callback: (payload: RealtimePayload<T>) => void): Promise<RealtimeSubscription>;
  
  // Sync
  getUnsynced(limit?: number): Promise<T[]>;
  markSynced(ids: string[]): Promise<void>;
  markUnsynced(ids: string[]): Promise<void>;
}

// ============================================================================
// Database Factory
// ============================================================================

export interface DatabaseFactory {
  createProvider(provider: DatabaseProvider, config: DatabaseConfig): Promise<DatabaseProviderInterface>;
  getDefaultConfig(provider: DatabaseProvider): DatabaseConfig;
  validateConfig(provider: DatabaseProvider, config: DatabaseConfig): { valid: boolean; errors: string[] };
}

// ============================================================================
// Connection Pool Interface
// ============================================================================

export interface ConnectionPool {
  acquire(): Promise<DatabaseConnection>;
  release(connection: DatabaseConnection): Promise<void>;
  drain(): Promise<void>;
  getStats(): PoolStats;
}

export interface DatabaseConnection {
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: string }>;
  beginTransaction(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): Promise<void>;
}

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
  used: number;
}

// ============================================================================
// Migration Interface
// ============================================================================

export interface Migration {
  version: string;
  name: string;
  up: (db: DatabaseConnection) => Promise<void>;
  down: (db: DatabaseConnection) => Promise<void>;
}

export interface MigrationRecord {
  version: string;
  name: string;
  appliedAt: Date;
  checksum: string;
}

export interface Migrator {
  getMigrations(): Migration[];
  getAppliedMigrations(): Promise<MigrationRecord[]>;
  applyMigrations(migrations?: Migration[]): Promise<MigrationRecord[]>;
  rollbackMigration(version: string): Promise<void>;
  getStatus(): Promise<{ applied: MigrationRecord[]; pending: Migration[] }>;
}