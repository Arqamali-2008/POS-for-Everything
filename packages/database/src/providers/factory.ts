/**
 * Database Provider Factory
 * Creates and manages database provider instances
 */

import { DatabaseProvider } from '@pospro/core';
import type {
  DatabaseConfig,
  DatabaseProviderInterface,
  DatabaseFactory,
} from './interfaces';
import { SQLiteProvider } from './sqlite-provider';
import { SupabaseProvider } from './supabase-provider';
import { TursoProvider } from './turso-provider';
import { AzureSqlProvider } from './azuresql-provider';

// ============================================================================
// Provider Factory Implementation
// ============================================================================

export class DatabaseProviderFactory implements DatabaseFactory {
  private static instance: DatabaseProviderFactory;
  private providers: Map<DatabaseProvider, DatabaseProviderInterface> = new Map();
  private defaultConfigs: Map<DatabaseProvider, DatabaseConfig> = new Map();

  private constructor() {
    this.initializeDefaultConfigs();
  }

  static getInstance(): DatabaseProviderFactory {
    if (!DatabaseProviderFactory.instance) {
      DatabaseProviderFactory.instance = new DatabaseProviderFactory();
    }
    return DatabaseProviderFactory.instance;
  }

  private initializeDefaultConfigs(): void {
    // SQLite default config
    this.defaultConfigs.set(DatabaseProvider.SQLITE, {
      provider: DatabaseProvider.SQLITE,
      sqlitePath: './data/pos.db',
      poolSize: 1,
      connectionTimeout: 30000,
      queryTimeout: 30000,
      enableLogging: false,
    });

    // Supabase default config
    this.defaultConfigs.set(DatabaseProvider.SUPABASE, {
      provider: DatabaseProvider.SUPABASE,
      supabaseUrl: '',
      supabaseAnonKey: '',
      supabaseServiceKey: '',
      poolSize: 10,
      connectionTimeout: 30000,
      queryTimeout: 30000,
      enableLogging: false,
    });

    // Turso default config
    this.defaultConfigs.set(DatabaseProvider.TURSO, {
      provider: DatabaseProvider.TURSO,
      tursoUrl: '',
      tursoToken: '',
      tursoSyncUrl: '',
      poolSize: 10,
      connectionTimeout: 30000,
      queryTimeout: 30000,
      enableLogging: false,
    });

    // Azure SQL default config
    this.defaultConfigs.set(DatabaseProvider.AZURE_SQL, {
      provider: DatabaseProvider.AZURE_SQL,
      azureServer: '',
      azureDatabase: '',
      azureUser: '',
      azurePassword: '',
      azureEncrypt: true,
      azureTrustServerCertificate: false,
      poolSize: 10,
      connectionTimeout: 30000,
      queryTimeout: 30000,
      enableLogging: false,
    });
  }

  async createProvider(provider: DatabaseProvider, config: DatabaseConfig): Promise<DatabaseProviderInterface> {
    // Merge with defaults
    const defaultConfig = this.defaultConfigs.get(provider) || {};
    const mergedConfig = { ...defaultConfig, ...config } as DatabaseConfig;

    // Validate config
    const validation = this.validateConfig(provider, mergedConfig);
    if (!validation.valid) {
      throw new Error(`Invalid ${provider} configuration: ${validation.errors.join(', ')}`);
    }

    let providerInstance: DatabaseProviderInterface;

    switch (provider) {
      case DatabaseProvider.SQLITE:
        providerInstance = new SQLiteProvider();
        break;
      case DatabaseProvider.SUPABASE:
        providerInstance = new SupabaseProvider();
        break;
      case DatabaseProvider.TURSO:
        providerInstance = new TursoProvider();
        break;
      case DatabaseProvider.AZURE_SQL:
        providerInstance = new AzureSqlProvider();
        break;
      default:
        throw new Error(`Unknown database provider: ${provider}`);
    }

    await providerInstance.connect(mergedConfig);
    this.providers.set(provider, providerInstance);

    return providerInstance;
  }

  getProvider(provider: DatabaseProvider): DatabaseProviderInterface | undefined {
    return this.providers.get(provider);
  }

  getDefaultConfig(provider: DatabaseProvider): DatabaseConfig {
    return this.defaultConfigs.get(provider) || { provider } as DatabaseConfig;
  }

  validateConfig(provider: DatabaseProvider, config: DatabaseConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    switch (provider) {
      case DatabaseProvider.SQLITE:
        if (!config.sqlitePath) {
          errors.push('sqlitePath is required');
        }
        break;

      case DatabaseProvider.SUPABASE:
        if (!config.supabaseUrl) {
          errors.push('supabaseUrl is required');
        }
        if (!config.supabaseAnonKey) {
          errors.push('supabaseAnonKey is required');
        }
        break;

      case DatabaseProvider.TURSO:
        if (!config.tursoUrl) {
          errors.push('tursoUrl is required');
        }
        if (!config.tursoToken) {
          errors.push('tursoToken is required');
        }
        break;

      case DatabaseProvider.AZURE_SQL:
        if (!config.azureServer) {
          errors.push('azureServer is required');
        }
        if (!config.azureDatabase) {
          errors.push('azureDatabase is required');
        }
        if (!config.azureUser) {
          errors.push('azureUser is required');
        }
        if (!config.azurePassword) {
          errors.push('azurePassword is required');
        }
        break;
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async disconnectAll(): Promise<void> {
    for (const [provider, instance] of this.providers) {
      try {
        await instance.disconnect();
      } catch (error) {
        console.error(`Error disconnecting ${provider}:`, error);
      }
    }
    this.providers.clear();
  }

  getActiveProviders(): DatabaseProvider[] {
    return Array.from(this.providers.keys());
  }

  isProviderActive(provider: DatabaseProvider): boolean {
    const instance = this.providers.get(provider);
    return instance?.isConnected() || false;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const dbFactory = DatabaseProviderFactory.getInstance();

// ============================================================================
// Convenience Functions
// ============================================================================

export async function createDatabaseProvider(
  provider: DatabaseProvider,
  config: DatabaseConfig
): Promise<DatabaseProviderInterface> {
  return dbFactory.createProvider(provider, config);
}

export function getDatabaseProvider(provider: DatabaseProvider): DatabaseProviderInterface | undefined {
  return dbFactory.getProvider(provider);
}

export function getDefaultDatabaseConfig(provider: DatabaseProvider): DatabaseConfig {
  return dbFactory.getDefaultConfig(provider);
}

export async function disconnectAllProviders(): Promise<void> {
  return dbFactory.disconnectAll();
}