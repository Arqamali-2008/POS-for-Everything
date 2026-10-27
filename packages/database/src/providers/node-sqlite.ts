/**
 * Minimal synchronous SQLite adapter built on Node's built-in `node:sqlite`
 * module. This avoids native npm add-ons (such as better-sqlite3) that require
 * a C++ toolchain on Windows.
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite';

export type SqliteValue = string | number | bigint | null | Uint8Array;

export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqliteStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): SqliteRunResult;
}

function normalizeParams(params: unknown[]): SqliteValue[] {
  return params.map((value) => {
    if (value === undefined || value === null) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value;
    if (value instanceof Uint8Array) return value;
    return JSON.stringify(value);
  });
}

function normalizeRow(row: unknown): unknown {
  if (!row || typeof row !== 'object') return row;
  return Object.fromEntries(Object.entries(row as Record<string, unknown>));
}

export class NodeSqliteDatabase {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
  }

  prepare(sql: string): SqliteStatement {
    const statement: StatementSync = this.db.prepare(sql);
    return {
      all: (...params: unknown[]) =>
        statement.all(...normalizeParams(params)).map((row) => normalizeRow(row)),
      get: (...params: unknown[]) => normalizeRow(statement.get(...normalizeParams(params))),
      run: (...params: unknown[]) => {
        const result = statement.run(...normalizeParams(params));
        return {
          changes: Number(result.changes),
          lastInsertRowid: result.lastInsertRowid,
        };
      },
    };
  }

  exec(sql: string): void {
    this.db.exec(sql);
  }

  pragma(statement: string): void {
    this.db.exec(`PRAGMA ${statement}`);
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(callback: () => T): T {
    this.db.exec('BEGIN TRANSACTION');
    try {
      const result = callback();
      this.db.exec('COMMIT');
      return result;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}
