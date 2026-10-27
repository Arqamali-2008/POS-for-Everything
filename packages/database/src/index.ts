/**
 * @pospro/database - Database abstraction layer with multi-provider support
 * Main entry point for the database package
 */

// Interfaces
export * from './providers/interfaces';

// Providers
export { SQLiteProvider } from './providers/sqlite-provider';
export { SupabaseProvider } from './providers/supabase-provider';
export { TursoProvider } from './providers/turso-provider';
export { AzureSqlProvider } from './providers/azuresql-provider';

// Factory
export {
  DatabaseProviderFactory,
  dbFactory,
  createDatabaseProvider,
  getDatabaseProvider,
  getDefaultDatabaseConfig,
  disconnectAllProviders,
} from './providers/factory';

// Re-export core types
export type {
  DatabaseProvider,
  DatabaseConfig,
  SyncConfig,
  SyncResult,
  SyncError,
  HealthCheckResult,
  ProviderFeatures,
  QueryParams,
  QueryFilter,
  SortOption,
  BatchOperation,
  BatchResult,
  RealtimeSubscription,
} from './providers/interfaces';