/**
 * Database Connection Manager
 * Manages database provider lifecycle for the backend
 */

import { dbFactory, createDatabaseProvider, disconnectAllProviders } from '@pospro/database';
import type { DatabaseProvider, DatabaseProviderInterface, DatabaseConfig } from '@pospro/database';
import { DatabaseProvider as DatabaseProviderEnum } from '@pospro/core';
import { databaseConfig } from '../config';
import { getActiveSqlitePath } from './runtime-config';
import { logger } from '../services/logger';

let currentProvider: DatabaseProviderInterface | null = null;
let currentProviderType: DatabaseProvider | null = null;

// ============================================================================
// Connection Management
// ============================================================================

export async function initializeDatabase(): Promise<DatabaseProviderInterface> {
  const providerType = databaseConfig.provider;
  // Runtime override (user-chosen data file path) wins over the env default
  const effectiveConfig: DatabaseConfig =
    providerType === DatabaseProviderEnum.SQLITE
      ? { ...databaseConfig, sqlitePath: getActiveSqlitePath() }
      : databaseConfig;
  
  logger.info(`Initializing database provider: ${providerType}`);
  
  // Validate config
  const validation = validateConfig(providerType, effectiveConfig);
  if (!validation.valid) {
    const error = `Invalid database configuration: ${validation.errors.join(', ')}`;
    logger.error(error);
    throw new Error(error);
  }
  
  try {
    currentProvider = await createDatabaseProvider(providerType, effectiveConfig);
    currentProviderType = providerType;
    
    logger.info(`Database provider ${providerType} initialized successfully (${providerType === DatabaseProviderEnum.SQLITE ? getActiveSqlitePath() : 'remote'})`);
    return currentProvider;
  } catch (error) {
    logger.error(`Failed to initialize database provider ${providerType}:`, error as Record<string, unknown>);
    throw error;
  }
}

export async function switchDatabaseProvider(
  newProviderType: DatabaseProvider,
  newConfig: DatabaseConfig
): Promise<DatabaseProviderInterface> {
  logger.info(`Switching database provider from ${currentProviderType} to ${newProviderType}`);
  
  // Disconnect current provider
  if (currentProvider) {
    await currentProvider.disconnect();
    currentProvider = null;
    currentProviderType = null;
  }
  
  // Validate new config
  const validation = validateConfig(newProviderType, newConfig);
  if (!validation.valid) {
    const error = `Invalid database configuration: ${validation.errors.join(', ')}`;
    logger.error(error);
    throw new Error(error);
  }
  
  try {
    currentProvider = await createDatabaseProvider(newProviderType, newConfig);
    currentProviderType = newProviderType;
    
    logger.info(`Database provider switched to ${newProviderType} successfully`);
    return currentProvider;
  } catch (error) {
    logger.error(`Failed to switch to database provider ${newProviderType}:`, error as Record<string, unknown>);
    throw error;
  }
}

export function getDatabaseProvider(): DatabaseProviderInterface | null {
  return currentProvider;
}

/**
 * Returns a proxy that resolves the active provider at request time.
 * Route modules are imported before the database is initialized, so capturing
 * the provider at module scope would always yield `null`.
 */
export function lazyDatabaseProvider(): DatabaseProviderInterface {
  return new Proxy({} as DatabaseProviderInterface, {
    get(_target, property) {
      if (!currentProvider) {
        throw new Error('Database provider is not initialized');
      }
      const value = (currentProvider as unknown as Record<string | symbol, unknown>)[property];
      return typeof value === 'function' ? value.bind(currentProvider) : value;
    },
  });
}

export function getCurrentProviderType(): DatabaseProvider | null {
  return currentProviderType;
}

export function isDatabaseConnected(): boolean {
  return currentProvider?.isConnected() || false;
}

export async function disconnectDatabase(): Promise<void> {
  if (currentProvider) {
    await currentProvider.disconnect();
    currentProvider = null;
    currentProviderType = null;
    logger.info('Database disconnected');
  }
}

export async function healthCheck(): Promise<{ healthy: boolean; provider: DatabaseProvider | null; latencyMs: number }> {
  if (!currentProvider) {
    return { healthy: false, provider: null, latencyMs: 0 };
  }
  
  const result = await currentProvider.healthCheck();
  return {
    healthy: result.healthy,
    provider: currentProviderType,
    latencyMs: result.latencyMs,
  };
}

// ============================================================================
// Validation
// ============================================================================

function validateConfig(provider: DatabaseProvider, config: DatabaseConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  switch (provider) {
    case 'sqlite':
      if (!config.sqlitePath) {
        errors.push('sqlitePath is required');
      }
      break;
    case 'supabase':
      if (!config.supabaseUrl) {
        errors.push('supabaseUrl is required');
      }
      if (!config.supabaseAnonKey) {
        errors.push('supabaseAnonKey is required');
      }
      break;
    case 'turso':
      if (!config.tursoUrl) {
        errors.push('tursoUrl is required');
      }
      if (!config.tursoToken) {
        errors.push('tursoToken is required');
      }
      break;
    case 'azuresql':
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
  
  return { valid: errors.length === 0, errors };
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

export async function gracefulShutdown(): Promise<void> {
  logger.info('Shutting down database connections...');
  await disconnectDatabase();
  await disconnectAllProviders();
  logger.info('Database connections closed');
}

// Handle process signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);