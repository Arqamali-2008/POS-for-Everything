/**
 * Runtime database path configuration
 *
 * The user can point the backend at any SQLite file (local drive, mapped
 * drive or UNC network share) from the Settings UI. The choice is persisted
 * in `data/runtime-config.json` next to the default DB folder so it survives
 * restarts, and takes precedence over the SQLITE_DB_PATH env default.
 */

import * as fs from 'fs';
import * as path from 'path';
import { databaseConfig } from '../config';
import { logger } from '../services/logger';

export interface RuntimeDbConfig {
  sqlitePath?: string;
}

const RUNTIME_CONFIG_FILE = path.join(databaseConfig.sqlitePath ? path.dirname(databaseConfig.sqlitePath) : './data', 'runtime-config.json');

function defaultSqlitePath(): string {
  return databaseConfig.sqlitePath || './data/pos.db';
}

export function readRuntimeConfig(): RuntimeDbConfig {
  try {
    if (fs.existsSync(RUNTIME_CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(RUNTIME_CONFIG_FILE, 'utf-8')) as RuntimeDbConfig;
      return parsed && typeof parsed === 'object' ? parsed : {};
    }
  } catch (error) {
    logger.warn('Failed to read runtime database config; using defaults', { error: error instanceof Error ? error.message : String(error) });
  }
  return {};
}

/** The SQLite path the server should currently use. */
export function getActiveSqlitePath(): string {
  const runtime = readRuntimeConfig();
  if (runtime.sqlitePath && typeof runtime.sqlitePath === 'string') {
    return runtime.sqlitePath;
  }
  return defaultSqlitePath();
}

export function setRuntimeSqlitePath(sqlitePath: string): void {
  const config: RuntimeDbConfig = { sqlitePath };
  fs.mkdirSync(path.dirname(RUNTIME_CONFIG_FILE), { recursive: true });
  fs.writeFileSync(RUNTIME_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  logger.info(`Runtime database path saved: ${sqlitePath} (${RUNTIME_CONFIG_FILE})`);
}

export function clearRuntimeSqlitePath(): void {
  try {
    if (fs.existsSync(RUNTIME_CONFIG_FILE)) fs.rmSync(RUNTIME_CONFIG_FILE);
  } catch (error) {
    logger.warn('Failed to clear runtime database config', { error: error instanceof Error ? error.message : String(error) });
  }
}
