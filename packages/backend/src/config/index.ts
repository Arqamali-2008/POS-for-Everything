/**
 * Backend Configuration
 * Centralized configuration management with validation
 */

import * as dotenv from 'dotenv';
import { z } from 'zod';
import type { DatabaseProvider, DatabaseConfig, ServerConfig, SyncConfig, AppConfig } from '@pospro/core';
import { SyncDirection } from '@pospro/core';

// Load environment variables
dotenv.config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env.local' });

// ============================================================================
// Environment Schema
// ============================================================================

const envSchema = z.object({
  // Database
  DB_PROVIDER: z.enum(['sqlite', 'supabase', 'turso', 'azuresql']).default('sqlite'),
  
  // SQLite
  SQLITE_DB_PATH: z.string().default('./data/pos.db'),
  
  // Supabase
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_KEY: z.string().optional(),
  
  // Turso
  TURSO_DATABASE_URL: z.string().url().optional(),
  TURSO_AUTH_TOKEN: z.string().optional(),
  TURSO_SYNC_URL: z.string().url().optional(),
  
  // Azure SQL
  AZURE_SQL_SERVER: z.string().optional(),
  AZURE_SQL_DATABASE: z.string().optional(),
  AZURE_SQL_USER: z.string().optional(),
  AZURE_SQL_PASSWORD: z.string().optional(),
  AZURE_SQL_ENCRYPT: z.coerce.boolean().default(true),
  AZURE_SQL_TRUST_SERVER_CERT: z.coerce.boolean().default(false),
  
  // Server
  PORT: z.coerce.number().default(3000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  CORS_ORIGINS: z.string().default(''),
  
  // Auth
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  LOCAL_ADMIN_EMAIL: z.string().email().default('admin@pos.com'),
  LOCAL_ADMIN_PASSWORD: z.string().min(6).default('admin123'),
  SESSION_TIMEOUT_MS: z.coerce.number().default(900000),
  MAX_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  LOCKOUT_DURATION_MS: z.coerce.number().default(900000),
  
  // Sync
  SYNC_ENABLED: z.coerce.boolean().default(false),
  SYNC_INTERVAL_MS: z.coerce.number().default(30000),
  SYNC_BATCH_SIZE: z.coerce.number().default(100),
  SYNC_MAX_RETRIES: z.coerce.number().default(3),
  SYNC_RETRY_DELAY_MS: z.coerce.number().default(5000),
  SYNC_CONFLICT_RESOLUTION: z.enum(['local_wins', 'remote_wins', 'last_write_wins', 'manual', 'merge']).default('last_write_wins'),
  
  // Features
  FEATURE_MULTI_BRANCH: z.coerce.boolean().default(false),
  FEATURE_LOYALTY: z.coerce.boolean().default(false),
  FEATURE_CREDIT_SALES: z.coerce.boolean().default(true),
  FEATURE_PURCHASES: z.coerce.boolean().default(true),
  FEATURE_EXPENSES: z.coerce.boolean().default(true),
  FEATURE_CHEQUES: z.coerce.boolean().default(true),
  FEATURE_LOANS: z.coerce.boolean().default(true),
  FEATURE_INVENTORY_ADJUSTMENTS: z.coerce.boolean().default(true),
  FEATURE_DAILY_RECONCILIATION: z.coerce.boolean().default(true),
  FEATURE_HELD_BILLS: z.coerce.boolean().default(true),
  FEATURE_BARCODE_SCANNING: z.coerce.boolean().default(true),
  FEATURE_VOICE_COMMANDS: z.coerce.boolean().default(false),
  FEATURE_QR_BACKUP: z.coerce.boolean().default(true),
  FEATURE_PRINT_QUEUE: z.coerce.boolean().default(true),
  FEATURE_REALTIME_SYNC: z.coerce.boolean().default(true),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  
  // Request Limits
  BODY_SIZE_LIMIT: z.string().default('50mb'),
  REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),
});

// ============================================================================
// Parse & Validate Environment
// ============================================================================

const env = envSchema.parse(process.env);

// ============================================================================
// Build Configuration Objects
// ============================================================================

export const databaseConfig: DatabaseConfig = {
  provider: env.DB_PROVIDER as DatabaseProvider,
  
  // SQLite
  sqlitePath: env.SQLITE_DB_PATH,
  
  // Supabase
  supabaseUrl: env.SUPABASE_URL,
  supabaseAnonKey: env.SUPABASE_ANON_KEY,
  supabaseServiceKey: env.SUPABASE_SERVICE_KEY,
  
  // Turso
  tursoUrl: env.TURSO_DATABASE_URL,
  tursoToken: env.TURSO_AUTH_TOKEN,
  tursoSyncUrl: env.TURSO_SYNC_URL,
  
  // Azure SQL
  azureServer: env.AZURE_SQL_SERVER,
  azureDatabase: env.AZURE_SQL_DATABASE,
  azureUser: env.AZURE_SQL_USER,
  azurePassword: env.AZURE_SQL_PASSWORD,
  azureEncrypt: env.AZURE_SQL_ENCRYPT,
  azureTrustServerCertificate: env.AZURE_SQL_TRUST_SERVER_CERT,
  
  // Common
  poolSize: 10,
  connectionTimeout: 30000,
  queryTimeout: 30000,
  enableLogging: env.NODE_ENV === 'development',
};

export const serverConfig: ServerConfig = {
  port: env.PORT,
  host: env.HOST,
  corsOrigins: env.CORS_ORIGINS.split(',').filter(Boolean).concat(env.FRONTEND_URL),
  jwtSecret: env.JWT_SECRET || (env.NODE_ENV === "production" ? (() => { throw new Error("JWT_SECRET is required in production"); })() : "dev-secret-change-in-production-min-32-chars-long!!"),
  jwtExpiresIn: env.JWT_EXPIRES_IN,
  refreshTokenExpiresIn: env.REFRESH_TOKEN_EXPIRES_IN,
  rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS,
  rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  bodySizeLimit: env.BODY_SIZE_LIMIT,
  requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
};

export const syncConfig: SyncConfig = {
  enabled: env.SYNC_ENABLED,
  intervalMs: env.SYNC_INTERVAL_MS,
  batchSize: env.SYNC_BATCH_SIZE,
  maxRetries: env.SYNC_MAX_RETRIES,
  retryDelayMs: env.SYNC_RETRY_DELAY_MS,
  conflictResolution: env.SYNC_CONFLICT_RESOLUTION as any,
  tables: [], // Will be populated dynamically
  direction: SyncDirection.BIDIRECTIONAL,
};

export const appConfig: AppConfig = {
  database: databaseConfig,
  server: serverConfig,
  sync: syncConfig,
  auth: {
    localAdminEmail: env.LOCAL_ADMIN_EMAIL,
    localAdminPassword: env.LOCAL_ADMIN_PASSWORD,
    supabaseEnabled: !!env.SUPABASE_URL && !!env.SUPABASE_ANON_KEY,
    sessionTimeoutMs: env.SESSION_TIMEOUT_MS,
    maxLoginAttempts: env.MAX_LOGIN_ATTEMPTS,
    lockoutDurationMs: env.LOCKOUT_DURATION_MS,
  },
  features: {
    multiBranch: env.FEATURE_MULTI_BRANCH,
    loyaltyProgram: env.FEATURE_LOYALTY,
    creditSales: env.FEATURE_CREDIT_SALES,
    purchaseManagement: env.FEATURE_PURCHASES,
    expenseTracking: env.FEATURE_EXPENSES,
    chequeManagement: env.FEATURE_CHEQUES,
    loanTracking: env.FEATURE_LOANS,
    inventoryAdjustments: env.FEATURE_INVENTORY_ADJUSTMENTS,
    dailyReconciliation: env.FEATURE_DAILY_RECONCILIATION,
    heldBills: env.FEATURE_HELD_BILLS,
    barcodeScanning: env.FEATURE_BARCODE_SCANNING,
    voiceCommands: env.FEATURE_VOICE_COMMANDS,
    qrBackup: env.FEATURE_QR_BACKUP,
    printQueue: env.FEATURE_PRINT_QUEUE,
    realtimeSync: env.FEATURE_REALTIME_SYNC,
  },
};

// ============================================================================
// Validation Helpers
// ============================================================================

export function validateDatabaseConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  switch (databaseConfig.provider) {
    case 'sqlite':
      if (!databaseConfig.sqlitePath) {
        errors.push('SQLITE_DB_PATH is required for SQLite provider');
      }
      break;
    case 'supabase':
      if (!databaseConfig.supabaseUrl) {
        errors.push('SUPABASE_URL is required for Supabase provider');
      }
      if (!databaseConfig.supabaseAnonKey) {
        errors.push('SUPABASE_ANON_KEY is required for Supabase provider');
      }
      break;
    case 'turso':
      if (!databaseConfig.tursoUrl) {
        errors.push('TURSO_DATABASE_URL is required for Turso provider');
      }
      if (!databaseConfig.tursoToken) {
        errors.push('TURSO_AUTH_TOKEN is required for Turso provider');
      }
      break;
    case 'azuresql':
      if (!databaseConfig.azureServer) {
        errors.push('AZURE_SQL_SERVER is required for Azure SQL provider');
      }
      if (!databaseConfig.azureDatabase) {
        errors.push('AZURE_SQL_DATABASE is required for Azure SQL provider');
      }
      if (!databaseConfig.azureUser) {
        errors.push('AZURE_SQL_USER is required for Azure SQL provider');
      }
      if (!databaseConfig.azurePassword) {
        errors.push('AZURE_SQL_PASSWORD is required for Azure SQL provider');
      }
      break;
  }
  
  return { valid: errors.length === 0, errors };
}

export function isDevelopment(): boolean {
  return env.NODE_ENV === 'development';
}

export function isProduction(): boolean {
  return env.NODE_ENV === 'production';
}

export function isTest(): boolean {
  return env.NODE_ENV === 'test';
}

// ============================================================================
// Export all config
// ============================================================================

export default {
  env,
  database: databaseConfig,
  server: serverConfig,
  sync: syncConfig,
  app: appConfig,
  validateDatabaseConfig,
  isDevelopment,
  isProduction,
  isTest,
};

