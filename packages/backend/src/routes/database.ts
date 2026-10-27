/**
 * Database Routes
 *
 * Lets an admin choose the SQLite data file (local drive, mapped drive or
 * UNC network share) at runtime, test it, switch to it and back it up.
 * The backend is the ONLY process that touches the .db file — all other
 * PCs talk to this server over HTTP, so a single .db on a network share
 * is safe to use as the shared POS database.
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateToken, requireAdmin, validateBody } from '../middleware/auth';
import { logger } from '../services/logger';
import { lazyDatabaseProvider, switchDatabaseProvider, getDatabaseProvider, getCurrentProviderType } from '../db/connection';
import { getActiveSqlitePath, setRuntimeSqlitePath, readRuntimeConfig } from '../db/runtime-config';
import { databaseConfig } from '../config';
import { DatabaseProvider } from '@pospro/core';
import type { DatabaseConfig } from '@pospro/core';

const router = Router();

const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');

function isUncPath(p: string): boolean {
  return p.startsWith('\\\\') || p.startsWith('//');
}

function dbFileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

/** Verify a path can host the data file without touching the real file. */
function testPath(candidate: string): { ok: boolean; error?: string } {
  try {
    const resolved = path.resolve(candidate);
    const dir = path.dirname(resolved);
    const fileName = path.basename(resolved);

    if (!fileName || fileName === '.' || fileName === path.sep) {
      return { ok: false, error: 'Path must point to a file (e.g. \\\\SERVER\\pos\\posdata.db or D:\\pos\\posdata.db)' };
    }

    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch {
        return { ok: false, error: `Folder "${dir}" does not exist and could not be created (check share permissions)` };
      }
    }

    // Writability probe (temp file inside the target folder)
    const probe = path.join(dir, `.__posdb_test_${Date.now()}.tmp`);
    try {
      fs.writeFileSync(probe, 'ok');
      fs.rmSync(probe, { force: true });
    } catch {
      return { ok: false, error: `Folder "${dir}" is not writable (check network share permissions)` };
    }

    // If a file already exists there, make sure it is a SQLite database
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        return { ok: false, error: 'Path points to a folder, not a file' };
      }
      const head = Buffer.alloc(16);
      const fd = fs.openSync(resolved, 'r');
      try {
        fs.readSync(fd, head, 0, 16, 0);
      } finally {
        fs.closeSync(fd);
      }
      if (!head.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)) {
        return { ok: false, error: 'Existing file is not a SQLite database' };
      }
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Failed to test path' };
  }
}

const pathSchema = z.object({ path: z.string().min(1).max(500) });

// ---------------------------------------------------------------------------
// Info
// ---------------------------------------------------------------------------

router.get('/', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
  try {
    const activePath = getActiveSqlitePath();
    const exists = fs.existsSync(activePath);
    let journalMode: string | null = null;
    try {
      const provider = getDatabaseProvider() as unknown as { getDb?: () => { prepare: (s: string) => { get: () => any } } };
      if (provider?.getDb) {
        const row = provider.getDb().prepare('PRAGMA journal_mode').get();
        journalMode = row ? String(Object.values(row)[0]) : null;
      }
    } catch {
      journalMode = null;
    }

    res.json({
      success: true,
      data: {
        path: activePath,
        isNetworkPath: isUncPath(activePath),
        exists,
        sizeBytes: exists ? dbFileSize(activePath) : 0,
        provider: getCurrentProviderType(),
        journalMode,
        runtimeOverride: readRuntimeConfig().sqlitePath ?? null,
        envDefault: databaseConfig.sqlitePath ?? null,
        requiresRestart: false,
      },
    });
  } catch (error) {
    logger.error('Failed to read database info', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Failed to read database info', code: 'DB_INFO_FAILED' });
  }
});

// ---------------------------------------------------------------------------
// Test a path (no state change)
// ---------------------------------------------------------------------------

router.post('/test', authenticateToken, requireAdmin, validateBody(pathSchema as never), async (req: Request, res: Response) => {
  const { path: candidate } = req.body as { path: string };
  const result = testPath(candidate);
  res.json({
    success: result.ok,
    data: { path: candidate, isNetworkPath: isUncPath(candidate), exists: fs.existsSync(candidate), ok: result.ok },
    error: result.ok ? undefined : result.error,
    code: result.ok ? undefined : 'PATH_INVALID',
  });
});

// ---------------------------------------------------------------------------
// Switch to a new path (live reconnect, no restart needed)
// ---------------------------------------------------------------------------

router.post('/path', authenticateToken, requireAdmin, validateBody(pathSchema as never), async (req: Request, res: Response) => {
  const { path: candidate } = req.body as { path: string };
  const previousPath = getActiveSqlitePath();

  const test = testPath(candidate);
  if (!test.ok) {
    res.status(400).json({ success: false, error: test.error, code: 'PATH_INVALID' });
    return;
  }

  try {
    const newConfig: DatabaseConfig = { ...databaseConfig, sqlitePath: candidate };
    await switchDatabaseProvider(DatabaseProvider.SQLITE, newConfig);
    setRuntimeSqlitePath(candidate);
    logger.info(`Database file switched: ${previousPath} -> ${candidate}`);
    res.json({
      success: true,
      message: 'Database switched successfully',
      data: { path: candidate, previousPath, isNetworkPath: isUncPath(candidate) },
    });
  } catch (error) {
    // Try to restore the previous database so the server keeps working
    try {
      const restoreConfig: DatabaseConfig = { ...databaseConfig, sqlitePath: previousPath };
      await switchDatabaseProvider(DatabaseProvider.SQLITE, restoreConfig);
      logger.warn(`Switch to ${candidate} failed; restored previous database`, { error: error instanceof Error ? error.message : String(error) });
    } catch (restoreError) {
      logger.fatal('Failed to restore previous database after failed switch', {}, restoreError instanceof Error ? restoreError : undefined);
    }
    res.status(500).json({
      success: false,
      error: `Failed to open database at "${candidate}": ${error instanceof Error ? error.message : 'Unknown error'}`,
      code: 'DB_SWITCH_FAILED',
    });
  }
});

// ---------------------------------------------------------------------------
// Backup (checkpoint WAL, then copy the file)
// ---------------------------------------------------------------------------

router.post('/backup', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
  const activePath = getActiveSqlitePath();
  if (!fs.existsSync(activePath)) {
    res.status(404).json({ success: false, error: 'Database file not found', code: 'DB_NOT_FOUND' });
    return;
  }
  try {
    const provider = getDatabaseProvider() as unknown as { getDb?: () => { exec: (sql: string) => void } };
    provider?.getDb?.().exec('PRAGMA wal_checkpoint(TRUNCATE)');

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const parsed = path.parse(activePath);
    const backupPath = path.join(parsed.dir, `${parsed.name}.backup-${stamp}${parsed.ext || '.db'}`);
    fs.copyFileSync(activePath, backupPath);
    logger.info(`Database backup created: ${backupPath}`);
    res.json({ success: true, message: 'Backup created', data: { backupPath, sizeBytes: dbFileSize(backupPath) } });
  } catch (error) {
    logger.error('Database backup failed', {}, error instanceof Error ? error : undefined);
    res.status(500).json({ success: false, error: 'Backup failed — check folder permissions', code: 'DB_BACKUP_FAILED' });
  }
});


export default router;
