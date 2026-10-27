/**
 * Azure SQL Database Provider
 * Uses mssql (tedious) for Microsoft SQL Server / Azure SQL Database
 */

import sql, { ConnectionPool, Request, IResult } from 'mssql';
import { DatabaseProvider, SyncStatus } from '@pospro/core';
import type {
  DatabaseConfig,
  QueryParams,
  QueryFilter,
  SortOption,
  RealtimePayload,
  HealthCheckResult,
  SyncConfig,
  SyncResult,
  SyncError,
  ProviderFeatures,
  BatchOperation,
  BatchResult,
  RealtimeSubscription,
} from './interfaces';
import type { DatabaseProviderInterface } from './interfaces';
import { eq, and, or, like, ilike, inArray, isNull, isNotNull, gte, lte, gt, lt, desc, asc, sql as drizzleSql } from 'drizzle-orm';

// ============================================================================
// Azure SQL Provider Implementation
// ============================================================================

export class AzureSqlProvider implements DatabaseProviderInterface {
  readonly provider = DatabaseProvider.AZURE_SQL;
  readonly name = 'Azure SQL Database';
  
  private pool: ConnectionPool | null = null;
  private connected = false;
  private config: DatabaseConfig | null = null;
  private subscriptions: Map<string, RealtimeSubscription> = new Map();

  // Provider features
  readonly features: ProviderFeatures = {
    realtime: false, // SQL Server has Service Broker but complex to set up
    transactions: true,
    batchOperations: true,
    softDelete: true,
    fullTextSearch: true,
    jsonQueries: true, // SQL Server 2016+ supports JSON
    sync: false, // Would need custom implementation
    offlineSupport: false,
    migrations: true,
  };

  async connect(config: DatabaseConfig): Promise<void> {
    this.config = config;
    
    if (!config.azureServer || !config.azureDatabase || !config.azureUser || !config.azurePassword) {
      throw new Error('Azure SQL Server, Database, User, and Password are required');
    }
    
    const poolConfig: sql.config = {
      server: config.azureServer,
      database: config.azureDatabase,
      user: config.azureUser,
      password: config.azurePassword,
      options: {
        encrypt: config.azureEncrypt !== false, // Default true for Azure
        trustServerCertificate: config.azureTrustServerCertificate || false,
        enableArithAbort: true,
        connectTimeout: config.connectionTimeout || 30000,
        requestTimeout: config.queryTimeout || 30000,
      },
      pool: {
        max: config.poolSize || 10,
        min: 0,
        idleTimeoutMillis: 30000,
      },
    };
    
    this.pool = new ConnectionPool(poolConfig);
    
    // Handle pool events
    this.pool.on('error', (err) => {
      console.error('[Azure SQL] Pool error:', err);
      this.connected = false;
    });
    
    // Connect and test
    await this.pool.connect();
    await this.healthCheck();
    
    this.connected = true;
    console.log(`[Azure SQL] Connected to ${config.azureServer}/${config.azureDatabase}`);
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.pool !== null;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      if (!this.pool) throw new Error('Not connected');
      
      const result = await this.pool.request().query('SELECT 1 AS test');
      
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        version: 'Azure SQL Database',
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  getPool(): ConnectionPool {
    if (!this.pool) throw new Error('Azure SQL not connected');
    return this.pool;
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  async createSchema(): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    
    // Azure SQL uses different syntax - would need T-SQL scripts
    // This is a simplified version - full schema would be in a .sql file
    console.log('[Azure SQL] Schema creation should be done via SQL scripts');
  }

  async dropSchema(): Promise<void> {
    console.log('[Azure SQL] Schema drop should be done via SQL scripts');
  }

  async migrate(): Promise<void> {
    console.log('[Azure SQL] Migrations handled by EF Core or SQL scripts');
  }

  async getMigrationStatus(): Promise<{ applied: number; pending: number }> {
    return { applied: 0, pending: 0 };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private buildWhereClause(filters: QueryFilter[] = []): { sql: string; params: Record<string, unknown> } {
    if (filters.length === 0) return { sql: '', params: {} };
    
    const conditions: string[] = [];
    const params: Record<string, unknown> = {};
    
    for (let i = 0; i < filters.length; i++) {
      const filter = filters[i];
      const paramName = `param${i}`;
      
      switch (filter.operator) {
        case 'eq':
          conditions.push(`${filter.field} = @${paramName}`);
          params[paramName] = filter.value;
          break;
        case 'neq':
          conditions.push(`${filter.field} != @${paramName}`);
          params[paramName] = filter.value;
          break;
        case 'gt':
          conditions.push(`${filter.field} > @${paramName}`);
          params[paramName] = filter.value;
          break;
        case 'gte':
          conditions.push(`${filter.field} >= @${paramName}`);
          params[paramName] = filter.value;
          break;
        case 'lt':
          conditions.push(`${filter.field} < @${paramName}`);
          params[paramName] = filter.value;
          break;
        case 'lte':
          conditions.push(`${filter.field} <= @${paramName}`);
          params[paramName] = filter.value;
          break;
        case 'like':
          conditions.push(`${filter.field} LIKE @${paramName}`);
          params[paramName] = `%${filter.value}%`;
          break;
        case 'ilike':
          // SQL Server uses LIKE for case-insensitive by default with proper collation
          conditions.push(`${filter.field} LIKE @${paramName}`);
          params[paramName] = `%${filter.value}%`;
          break;
        case 'in':
          const inParams = (filter.value as unknown[]).map((_, idx) => `@${paramName}_${idx}`).join(',');
          conditions.push(`${filter.field} IN (${inParams})`);
          (filter.value as unknown[]).forEach((v, idx) => {
            params[`${paramName}_${idx}`] = v;
          });
          break;
        case 'notIn':
          const notInParams = (filter.value as unknown[]).map((_, idx) => `@${paramName}_${idx}`).join(',');
          conditions.push(`${filter.field} NOT IN (${notInParams})`);
          (filter.value as unknown[]).forEach((v, idx) => {
            params[`${paramName}_${idx}`] = v;
          });
          break;
        case 'isNull':
          conditions.push(`${filter.field} IS NULL`);
          break;
        case 'isNotNull':
          conditions.push(`${filter.field} IS NOT NULL`);
          break;
      }
    }
    
    return { sql: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
  }

  private buildOrderBy(sorts: SortOption[] = []): string {
    if (sorts.length === 0) return '';
    return `ORDER BY ${sorts.map(s => `${s.field} ${s.order.toUpperCase()}`).join(', ')}`;
  }

  private buildLimitOffset(limit?: number, offset?: number): string {
    let sql = '';
    if (offset) sql += ` OFFSET ${offset} ROWS`;
    if (limit) sql += ` FETCH NEXT ${limit} ROWS ONLY`;
    return sql;
  }

  private async executeQuery<T>(sqlText: string, params: Record<string, unknown> = {}): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected');
    
    const request = this.pool.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
    
    const result = await request.query(sqlText);
    return result.recordset as T[];
  }

  private async executeNonQuery(sqlText: string, params: Record<string, unknown> = {}): Promise<{ affectedRows: number; insertId?: string }> {
    if (!this.pool) throw new Error('Not connected');
    
    const request = this.pool.request();
    for (const [key, value] of Object.entries(params)) {
      request.input(key, value);
    }
    
    const result = await request.query(sqlText);
    return { affectedRows: result.rowsAffected[0] || 0 };
  }

  // ============================================================================
  // Generic CRUD Operations
  // ============================================================================

  async findMany<T>(table: string, params?: QueryParams): Promise<T[]> {
    const fields = params?.fields?.join(', ') || '*';
    const { sql: whereSql, params: whereParams } = this.buildWhereClause(params?.filters);
    const orderBy = this.buildOrderBy(params?.sorts);
    const limitOffset = this.buildLimitOffset(params?.limit, params?.offset);
    
    const sqlText = `SELECT ${fields} FROM ${table} ${whereSql} ${orderBy} ${limitOffset}`;
    return this.executeQuery<T>(sqlText, whereParams);
  }

  async findFirst<T = any>(table: string, params?: QueryParams): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...params, limit: 1 });
    return results[0] || null;
  }

  async findById<T>(table: string, id: string): Promise<T | null> {
    return this.findFirst<T>(table, { filters: [{ field: 'id', operator: 'eq', value: id }] });
  }

  async count(table: string, filters?: QueryFilter[]): Promise<number> {
    const { sql: whereSql, params } = this.buildWhereClause(filters);
    const sqlText = `SELECT COUNT(*) as count FROM ${table} ${whereSql}`;
    const result = await this.executeQuery<{ count: number }>(sqlText, params);
    return result[0]?.count || 0;
  }

  async create<T = any>(table: string, data: Record<string, any> & { id?: string }): Promise<T> {
    if (!this.pool) throw new Error('Not connected');
    
    const id = data.id || crypto.randomUUID();
    const now = new Date().toISOString();
    
    const fields = ['id', 'created_at', 'updated_at', ...Object.keys(data).filter(k => k !== 'id')];
    const paramNames = fields.map((_, i) => `@param${i}`);
    const values = [id, now, now, ...Object.values(data).filter((_, i) => Object.keys(data)[i] !== 'id')];
    
    const params: Record<string, unknown> = {};
    paramNames.forEach((name, i) => { params[name] = values[i]; });
    
    const sqlText = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${paramNames.join(', ')})`;
    await this.executeNonQuery(sqlText, params);
    
    return this.findById<T>(table, id) as Promise<T>;
  }

  async createMany<T = any>(table: string, data: Array<Record<string, any> & { id?: string }>): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected');
    if (data.length === 0) return [];
    
    const now = new Date().toISOString();
    const firstItem = data[0];
    const fields = ['id', 'created_at', 'updated_at', ...Object.keys(firstItem).filter(k => k !== 'id')];
    const paramNames = fields.map((_, i) => `@param${i}`);
    
    // Build multi-row insert
    const valueRows = data.map((_, rowIdx) => 
      fields.map((_, colIdx) => `@param${rowIdx}_${colIdx}`).join(', ')
    ).join('), (');
    
    const params: Record<string, unknown> = {};
    data.forEach((item, rowIdx) => {
      const values = [item.id || crypto.randomUUID(), now, now, ...Object.values(item).filter((_, i) => Object.keys(item)[i] !== 'id')];
      values.forEach((value, colIdx) => {
        params[`param${rowIdx}_${colIdx}`] = value;
      });
    });
    
    const sqlText = `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${valueRows})`;
    await this.executeNonQuery(sqlText, params);
    
    return data.map(item => ({ ...item, id: item.id || crypto.randomUUID(), created_at: now, updated_at: now } as unknown as T));
  }

  async update<T = any>(table: string, id: string, data: Record<string, any>): Promise<T> {
    if (!this.pool) throw new Error('Not connected');
    
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    const fields = Object.keys(updateData);
    
    const setClause = fields.map((f, i) => `${f} = @param${i}`).join(', ');
    const params: Record<string, unknown> = {};
    fields.forEach((f, i) => { params[`param${i}`] = updateData[f as keyof typeof updateData]; });
    params.id = id;
    
    const sqlText = `UPDATE ${table} SET ${setClause} WHERE id = @id`;
    await this.executeNonQuery(sqlText, params);
    
    return this.findById<T>(table, id) as Promise<T>;
  }

  async updateMany<T = any>(table: string, filters: QueryFilter[], data: Record<string, any>): Promise<number> {
    if (!this.pool) throw new Error('Not connected');
    
    const now = new Date().toISOString();
    const updateData = { ...data, updated_at: now };
    const fields = Object.keys(updateData);
    
    const setClause = fields.map((f, i) => `${f} = @param${i}`).join(', ');
    const { sql: whereSql, params: whereParams } = this.buildWhereClause(filters);
    
    const params: Record<string, unknown> = { ...whereParams };
    fields.forEach((f, i) => { params[`param${i}`] = updateData[f as keyof typeof updateData]; });
    
    const sqlText = `UPDATE ${table} SET ${setClause} ${whereSql}`;
    const result = await this.executeNonQuery(sqlText, params);
    return result.affectedRows;
  }

  async delete(table: string, id: string): Promise<void> {
    if (!this.pool) throw new Error('Not connected');
    const sqlText = `DELETE FROM ${table} WHERE id = @id`;
    await this.executeNonQuery(sqlText, { id });
  }

  async deleteMany(table: string, filters: QueryFilter[]): Promise<number> {
    if (!this.pool) throw new Error('Not connected');
    const { sql: whereSql, params } = this.buildWhereClause(filters);
    const sqlText = `DELETE FROM ${table} ${whereSql}`;
    const result = await this.executeNonQuery(sqlText, params);
    return result.affectedRows;
  }

  async softDelete(table: string, id: string): Promise<void> {
    return this.update(table, id, { deleted: true, deleted_at: new Date().toISOString() } as any);
  }

  async restore(table: string, id: string): Promise<void> {
    return this.update(table, id, { deleted: false, deleted_at: null } as any);
  }

  // ============================================================================
  // Transactions
  // ============================================================================

  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('Not connected');
    
    const transaction = new sql.Transaction(this.pool);
    
    try {
      await transaction.begin();
      
      // Create a transaction-aware request wrapper
      const txWrapper = {
        query: async <T>(sqlText: string, params: Record<string, unknown> = {}) => {
          const request = new sql.Request(transaction);
          for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
          }
          const result = await request.query(sqlText);
          return result.recordset as T[];
        },
        execute: async (sqlText: string, params: Record<string, unknown> = {}) => {
          const request = new sql.Request(transaction);
          for (const [key, value] of Object.entries(params)) {
            request.input(key, value);
          }
          const result = await request.query(sqlText);
          return { affectedRows: result.rowsAffected[0] || 0 };
        },
        commit: async () => transaction.commit(),
        rollback: async () => transaction.rollback(),
      };
      
      const result = await callback(txWrapper);
      await transaction.commit();
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  async batch(operations: BatchOperation[]): Promise<BatchResult[]> {
    if (!this.pool) throw new Error('Not connected');
    
    const results: BatchResult[] = [];
    
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin();
    
    try {
      for (const op of operations) {
        try {
          let result: unknown;
          
          switch (op.type) {
            case 'create':
              result = await this.create(op.table, op.data as any);
              break;
            case 'update':
              if (!op.id) throw new Error('ID required for update');
              result = await this.update(op.table, op.id, op.data as any);
              break;
            case 'delete':
              if (!op.id) throw new Error('ID required for delete');
              await this.delete(op.table, op.id);
              result = { success: true };
              break;
            case 'softDelete':
              if (!op.id) throw new Error('ID required for softDelete');
              await this.softDelete(op.table, op.id);
              result = { success: true };
              break;
            case 'restore':
              if (!op.id) throw new Error('ID required for restore');
              await this.restore(op.table, op.id);
              result = { success: true };
              break;
          }
          
          results.push({ success: true, operation: op, result });
        } catch (error) {
          results.push({ 
            success: false, 
            operation: op, 
            error: error instanceof Error ? error.message : 'Unknown error' 
          });
        }
      }
      
      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
    
    return results;
  }

  // ============================================================================
  // Real-time Subscriptions (Not supported natively)
  // ============================================================================

  async subscribe(table: string, callback: (payload: RealtimePayload) => void): Promise<RealtimeSubscription> {
    // SQL Server doesn't have native realtime like Supabase
    // Would need Query Notifications or SignalR
    return {
      table,
      callback,
      unsubscribe: async () => {},
    };
  }

  async unsubscribe(subscription: { unsubscribe: () => Promise<void> }): Promise<void> {
    await subscription.unsubscribe();
  }

  // ============================================================================
  // Sync (Not natively supported)
  // ============================================================================

  async sync(config: SyncConfig): Promise<SyncResult> {
    return {
      success: true,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
      durationMs: 0,
    };
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return SyncStatus.DISCONNECTED;
  }

  async getLastSyncTime(): Promise<Date | null> {
    return null;
  }

  // ============================================================================
  // Raw Query Access
  // ============================================================================

  async rawQuery<T>(sqlText: string, params?: unknown[]): Promise<T[]> {
    if (!this.pool) throw new Error('Not connected');
    
    const request = this.pool.request();
    if (params) {
      params.forEach((param, i) => request.input(`param${i}`, param));
    }
    
    const result = await request.query(sqlText);
    return result.recordset as T[];
  }

  async rawExecute(sqlText: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: string }> {
    if (!this.pool) throw new Error('Not connected');
    
    const request = this.pool.request();
    if (params) {
      params.forEach((param, i) => request.input(`param${i}`, param));
    }
    
    const result = await request.query(sqlText);
    return { affectedRows: result.rowsAffected[0] || 0 };
  }

  getProviderFeatures(): ProviderFeatures {
    return this.features;
  }
}