/**
 * Supabase (PostgreSQL) Database Provider
 * Uses @supabase/supabase-js with realtime subscriptions
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
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
import { eq, and, or, like, ilike, inArray, isNull, isNotNull, gte, lte, gt, lt, desc, asc, sql } from 'drizzle-orm';
import * as schema from '@pospro/core/schemas';

// ============================================================================
// Supabase Provider Implementation
// ============================================================================

export class SupabaseProvider implements DatabaseProviderInterface {
  readonly provider = DatabaseProvider.SUPABASE;
  readonly name = 'Supabase (PostgreSQL)';
  
  private supabase: SupabaseClient | null = null;
  private drizzleDb: any = null;
  private sql: postgres.Sql | null = null;
  private connected = false;
  private config: DatabaseConfig | null = null;
  private channels: Map<string, RealtimeChannel> = new Map();
  private subscriptions: Map<string, RealtimeSubscription> = new Map();

  // Provider features
  readonly features: ProviderFeatures = {
    realtime: true,
    transactions: true,
    batchOperations: true,
    softDelete: true,
    fullTextSearch: true,
    jsonQueries: true,
    sync: true,
    offlineSupport: false,
    migrations: true,
  };

  async connect(config: DatabaseConfig): Promise<void> {
    this.config = config;
    
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Supabase URL and Anon Key are required');
    }
    
    const { default: postgres } = await import('postgres');

    // Create Supabase client for auth and realtime
    this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
      realtime: {
        params: {
          eventsPerSecond: 100,
        },
      },
    });
    
    // Create Drizzle client for type-safe queries
    if (config.supabaseServiceKey) {
      // Use service role for backend operations
      this.sql = postgres(config.supabaseUrl.replace('https://', 'postgresql://postgres:') + config.supabaseServiceKey, {
        max: config.poolSize || 10,
        idle_timeout: 20,
        connect_timeout: config.connectionTimeout || 30,
      });
    } else {
      // Use anon key (limited permissions)
      this.sql = postgres(config.supabaseUrl.replace('https://', 'postgresql://postgres:') + config.supabaseAnonKey, {
        max: config.poolSize || 10,
        idle_timeout: 20,
        connect_timeout: config.connectionTimeout || 30,
      });
    }
    
    const { drizzle } = await import('drizzle-orm/postgres-js');
    this.drizzleDb = drizzle(this.sql as any, { schema: schema.pgSchema as any });
    
    // Test connection
    await this.healthCheck();
    
    this.connected = true;
    console.log(`[Supabase] Connected to ${config.supabaseUrl}`);
  }

  async disconnect(): Promise<void> {
    // Unsubscribe from all realtime channels
    for (const [key, channel] of this.channels) {
      await this.supabase?.removeChannel(channel);
    }
    this.channels.clear();
    this.subscriptions.clear();
    
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
    }
    
    this.drizzleDb = null;
    this.supabase = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.supabase !== null;
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      if (!this.supabase) throw new Error('Not connected');
      
      const { error } = await this.supabase.from('users').select('count').limit(1);
      if (error && error.code !== 'PGRST116') throw error;
      
      return {
        healthy: true,
        latencyMs: Date.now() - start,
        version: 'PostgreSQL 15+',
      };
    } catch (error) {
      return {
        healthy: false,
        latencyMs: Date.now() - start,
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
      };
    }
  }

  getSupabaseClient(): SupabaseClient {
    if (!this.supabase) throw new Error('Supabase not connected');
    return this.supabase;
  }

  getDrizzleDb(): any {
    if (!this.drizzleDb) throw new Error('Drizzle not connected');
    return this.drizzleDb;
  }

  // ============================================================================
  // Schema Management
  // ============================================================================

  async createSchema(): Promise<void> {
    // Schema is managed via Supabase Dashboard or migrations
    // This would run the SQL from supabase.sql
    console.log('[Supabase] Schema creation should be done via Supabase Dashboard');
  }

  async dropSchema(): Promise<void> {
    console.log('[Supabase] Schema drop should be done via Supabase Dashboard');
  }

  async migrate(): Promise<void> {
    // Migrations handled by Supabase CLI
    console.log('[Supabase] Migrations handled by Supabase CLI');
  }

  async getMigrationStatus(): Promise<{ applied: number; pending: number }> {
    return { applied: 0, pending: 0 };
  }

  // ============================================================================
  // Generic CRUD Operations
  // ============================================================================

  private buildFilters(query: any, filters: QueryFilter[] = []): any {
    for (const filter of filters) {
      switch (filter.operator) {
        case 'eq':
          query = query.eq(filter.field, filter.value);
          break;
        case 'neq':
          query = query.neq(filter.field, filter.value);
          break;
        case 'gt':
          query = query.gt(filter.field, filter.value);
          break;
        case 'gte':
          query = query.gte(filter.field, filter.value);
          break;
        case 'lt':
          query = query.lt(filter.field, filter.value);
          break;
        case 'lte':
          query = query.lte(filter.field, filter.value);
          break;
        case 'like':
          query = query.like(filter.field, `%${filter.value}%`);
          break;
        case 'ilike':
          query = query.ilike(filter.field, `%${filter.value}%`);
          break;
        case 'in':
          query = query.in(filter.field, filter.value as any[]);
          break;
        case 'notIn':
          query = query.not('in', filter.field, filter.value as any[]);
          break;
        case 'isNull':
          query = query.is(filter.field, null);
          break;
        case 'isNotNull':
          query = query.is(filter.field, filter.value);
          break;
      }
    }
    return query;
  }

  private buildSorts(query: any, sorts: SortOption[] = []): any {
    for (const sort of sorts) {
      query = query.order(sort.field, { ascending: sort.order === 'asc' });
    }
    return query;
  }

  async findMany<T>(table: string, params?: QueryParams): Promise<T[]> {
    if (!this.supabase) throw new Error('Not connected');
    
    let query = this.supabase.from(table).select(params?.fields?.join(', ') || '*');
    
    query = this.buildFilters(query, params?.filters);
    query = this.buildSorts(query, params?.sorts);
    
    if (params?.limit) query = query.limit(params.limit);
    if (params?.offset) query = query.range(params.offset, params.offset + (params.limit || 1000) - 1);
    
    const { data, error } = await query;
    if (error) throw error;
    
    return data as T[];
  }

  async findFirst<T = any>(table: string, params?: QueryParams): Promise<T | null> {
    const results = await this.findMany<T>(table, { ...params, limit: 1 });
    return results[0] || null;
  }

  async findById<T>(table: string, id: string): Promise<T | null> {
    return this.findFirst<T>(table, { filters: [{ field: 'id', operator: 'eq', value: id }] });
  }

  async count(table: string, filters?: QueryFilter[]): Promise<number> {
    if (!this.supabase) throw new Error('Not connected');
    
    let query = this.supabase.from(table).select('*', { count: 'exact', head: true });
    query = this.buildFilters(query, filters || []);
    
    const { count, error } = await query;
    if (error) throw error;
    
    return count || 0;
  }

  async create<T = any>(table: string, data: Record<string, any> & { id?: string }): Promise<T> {
    if (!this.supabase) throw new Error('Not connected');
    
    const now = new Date().toISOString();
    const insertData = {
      ...data,
      id: data.id || crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    };
    
    const { data: result, error } = await this.supabase
      .from(table)
      .insert(insertData)
      .select()
      .single();
    
    if (error) throw error;
    return result as T;
  }

  async createMany<T = any>(table: string, data: Array<Record<string, any> & { id?: string }>): Promise<T[]> {
    if (!this.supabase) throw new Error('Not connected');
    if (data.length === 0) return [];
    
    const now = new Date().toISOString();
    const insertData = data.map(item => ({
      ...item,
      id: item.id || crypto.randomUUID(),
      created_at: now,
      updated_at: now,
    }));
    
    const { data: result, error } = await this.supabase
      .from(table)
      .insert(insertData)
      .select();
    
    if (error) throw error;
    return result as T[];
  }

  async update<T = any>(table: string, id: string, data: Record<string, any>): Promise<T> {
    if (!this.supabase) throw new Error('Not connected');
    
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    const { data: result, error } = await this.supabase
      .from(table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) throw error;
    return result as T;
  }

  async updateMany<T = any>(table: string, filters: QueryFilter[], data: Record<string, any>): Promise<number> {
    if (!this.supabase) throw new Error('Not connected');
    
    const updateData = {
      ...data,
      updated_at: new Date().toISOString(),
    };
    
    let query = this.supabase.from(table).update(updateData);
    query = this.buildFilters(query, filters);
    
    const { error, count } = await query;
    if (error) throw error;
    
    return count || 0;
  }

  async delete(table: string, id: string): Promise<void> {
    if (!this.supabase) throw new Error('Not connected');
    
    const { error } = await this.supabase
      .from(table)
      .delete()
      .eq('id', id);
    
    if (error) throw error;
  }

  async deleteMany(table: string, filters: QueryFilter[]): Promise<number> {
    if (!this.supabase) throw new Error('Not connected');
    
    let query = this.supabase.from(table).delete();
    query = this.buildFilters(query, filters);
    
    const { error, count } = await query;
    if (error) throw error;
    
    return count || 0;
  }

  async softDelete(table: string, id: string): Promise<void> {
    return this.update(table, id, { 
      deleted: true, 
      deleted_at: new Date().toISOString() 
    } as any);
  }

  async restore(table: string, id: string): Promise<void> {
    return this.update(table, id, { 
      deleted: false, 
      deleted_at: null 
    } as any);
  }

  // ============================================================================
  // Transactions
  // ============================================================================

  async transaction<T>(callback: (tx: any) => Promise<T>): Promise<T> {
    if (!this.sql) throw new Error('Postgres connection not available');
    
    // Use postgres.js transaction
    return this.sql.begin(async (sql) => {
      const { drizzle } = await import('drizzle-orm/postgres-js');
      const txDb = drizzle(sql as any, { schema: schema.pgSchema as any });
      return callback(txDb);
    }) as unknown as Promise<T>;
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  async batch(operations: BatchOperation[]): Promise<BatchResult[]> {
    if (!this.supabase) throw new Error('Not connected');
    
    const results: BatchResult[] = [];
    
    // Supabase doesn't support true batch transactions via REST API
    // We'll execute sequentially
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
    
    return results;
  }

  // ============================================================================
  // Real-time Subscriptions
  // ============================================================================

  async subscribe(table: string, callback: (payload: RealtimePayload) => void): Promise<RealtimeSubscription> {
    if (!this.supabase) throw new Error('Not connected');
    
    const subscriptionId = `${table}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const channel = this.supabase
      .channel(`realtime:${subscriptionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
        },
        (payload) => {
          callback({
            type: payload.eventType,
            entity: table,
            operation: payload.eventType.toLowerCase() as any,
            data: payload.new,
            oldData: payload.old,
            timestamp: new Date().toISOString(),
          });
        }
      )
      .subscribe();
    
    this.channels.set(subscriptionId, channel);
    
    const subscription: RealtimeSubscription = {
      table,
      callback,
      unsubscribe: async () => {
        await this.supabase?.removeChannel(channel);
        this.channels.delete(subscriptionId);
        this.subscriptions.delete(subscriptionId);
      },
    };
    
    this.subscriptions.set(subscriptionId, subscription);
    return subscription;
  }

  async unsubscribe(subscription: RealtimeSubscription): Promise<void> {
    await subscription.unsubscribe();
  }

  // ============================================================================
  // Sync
  // ============================================================================

  async sync(config: SyncConfig): Promise<SyncResult> {
    // Supabase sync would be handled by the sync manager
    // This is a placeholder for the sync logic
    const start = Date.now();
    
    return {
      success: true,
      pushed: 0,
      pulled: 0,
      conflicts: 0,
      errors: [],
      durationMs: Date.now() - start,
    };
  }

  async getSyncStatus(): Promise<SyncStatus> {
    return SyncStatus.CONNECTED;
  }

  async getLastSyncTime(): Promise<Date | null> {
    // Would query sync_logs table
    return null;
  }

  // ============================================================================
  // Raw Query Access
  // ============================================================================

  async rawQuery<T>(sql: string, params?: unknown[]): Promise<T[]> {
    if (!this.sql) throw new Error('Postgres connection not available');
    return this.sql.unsafe(sql, params as any[]) as Promise<T[]>;
  }

  async rawExecute(sql: string, params?: unknown[]): Promise<{ affectedRows: number; insertId?: string }> {
    if (!this.sql) throw new Error('Postgres connection not available');
    const result = await this.sql.unsafe(sql, params as any[]);
    return { affectedRows: result.length, insertId: result[0]?.id };
  }

  getProviderFeatures(): ProviderFeatures {
    return this.features;
  }
}