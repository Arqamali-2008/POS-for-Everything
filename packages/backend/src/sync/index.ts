/**
 * Sync Service
 * Orchestrates bidirectional synchronization between local database and cloud providers
 */

import { dbFactory, getDatabaseProvider } from '@pospro/database';
import { databaseConfig, syncConfig, appConfig } from '../config';
import { logger } from '../services/logger';
import { DatabaseProvider } from '@pospro/core';
import type { SyncConfig, SyncResult, SyncError, ConflictResolution } from '@pospro/core';
import type { DatabaseProviderInterface } from '@pospro/database';

interface SyncJob {
  id: string;
  provider: DatabaseProvider;
  config: SyncConfig;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: Date;
  completedAt?: Date;
  result?: SyncResult;
  error?: string;
}

class SyncService {
  private syncJobs: Map<string, SyncJob> = new Map();
  private syncInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  // ============================================================================
  // Initialization
  // ============================================================================

  initialize(): void {
    if (syncConfig.enabled) {
      this.startAutoSync();
      logger.info('Sync service initialized with auto-sync enabled', { 
        intervalMs: syncConfig.intervalMs,
        provider: databaseConfig.provider 
      });
    } else {
      logger.info('Sync service initialized (auto-sync disabled)');
    }
  }

  // ============================================================================
  // Auto Sync
  // ============================================================================

  private startAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    this.syncInterval = setInterval(async () => {
      if (!this.isRunning && syncConfig.enabled) {
        await this.performSync();
      }
    }, syncConfig.intervalMs);

    // Run initial sync after a short delay
    setTimeout(() => this.performSync(), 5000);
  }

  stopAutoSync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      logger.info('Auto-sync stopped');
    }
  }

  // ============================================================================
  // Manual Sync
  // ============================================================================

  async performSync(config?: Partial<SyncConfig>): Promise<SyncResult> {
    if (this.isRunning) {
      return {
        success: false,
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        errors: [{ table: '', error: 'Sync already in progress', operation: 'create', resolved: false }],
        durationMs: 0,
      };
    }

    this.isRunning = true;
    const jobId = `sync_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    const job: SyncJob = {
      id: jobId,
      provider: databaseConfig.provider,
      config: { ...syncConfig, ...config },
      status: 'running',
      startedAt: new Date(),
    };

    this.syncJobs.set(jobId, job);
    logger.sync('sync_started', databaseConfig.provider, { jobId });

    try {
      // Get the cloud provider (not the local one)
      const cloudProvider = this.getCloudProvider();
      if (!cloudProvider) {
        throw new Error(`No cloud provider configured for ${databaseConfig.provider}`);
      }

      // Check if provider supports sync
      if (typeof cloudProvider.sync !== 'function') {
        throw new Error(`Provider ${databaseConfig.provider} does not support sync`);
      }

      // Perform sync
      const result = await cloudProvider.sync(job.config);
      
      job.status = result.success ? 'completed' : 'failed';
      job.completedAt = new Date();
      job.result = result;

      logger.sync('sync_completed', databaseConfig.provider, { 
        jobId, 
        success: result.success,
        pushed: result.pushed,
        pulled: result.pulled,
        conflicts: result.conflicts,
        durationMs: result.durationMs,
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      job.status = 'failed';
      job.completedAt = new Date();
      job.error = errorMessage;

      logger.sync('sync_failed', databaseConfig.provider, { jobId, error: errorMessage });

      return {
        success: false,
        pushed: 0,
        pulled: 0,
        conflicts: 0,
        errors: [{ table: '', error: errorMessage, operation: 'create', resolved: false }],
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.isRunning = false;
    }
  }

  // ============================================================================
  // Push/Pull Operations
  // ============================================================================

  async pushLocalChanges(tables: string[]): Promise<SyncResult> {
    const localProvider = getDatabaseProvider(DatabaseProvider.SQLITE) ?? null;
    const cloudProvider = this.getCloudProvider();
    
    if (!localProvider || !cloudProvider) {
      throw new Error('Required providers not available');
    }

    const startTime = Date.now();
    let totalPushed = 0;
    let totalConflicts = 0;
    const errors: SyncError[] = [];

    for (const table of tables) {
      try {
        // Get unsynced records from local
        const unsynced = await localProvider.findMany(table, {
          filters: [
            { field: 'synced', operator: 'eq', value: false },
            { field: 'deleted', operator: 'eq', value: false },
          ],
          limit: syncConfig.batchSize,
        });

        if (unsynced.length === 0) continue;

        // Push to cloud
        for (const record of unsynced) {
          try {
            await cloudProvider.create(table, record);
            await localProvider.update(table, record.id, { 
              synced: true, 
              syncedAt: new Date().toISOString(),
              syncVersion: (record.syncVersion || 0) + 1,
            } as any);
            totalPushed++;
          } catch (error) {
            // Check if it's a conflict
            if (error instanceof Error && error.message.includes('conflict')) {
              totalConflicts++;
              errors.push({
                table,
                recordId: record.id,
                operation: 'create',
                error: error.message,
                resolved: false,
                resolution: syncConfig.conflictResolution,
              });
            } else {
              errors.push({
                table,
                recordId: record.id,
                operation: 'create',
                error: error instanceof Error ? error.message : 'Unknown error',
                resolved: false,
              });
            }
          }
        }
      } catch (error) {
        errors.push({
          table,
          error: error instanceof Error ? error.message : 'Unknown error',
          operation: 'create',
          resolved: false,
        });
      }
    }

    return {
      success: errors.length === 0,
      pushed: totalPushed,
      pulled: 0,
      conflicts: totalConflicts,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  async pullRemoteChanges(tables: string[]): Promise<SyncResult> {
    const localProvider = getDatabaseProvider(DatabaseProvider.SQLITE) ?? null;
    const cloudProvider = this.getCloudProvider();
    
    if (!localProvider || !cloudProvider) {
      throw new Error('Required providers not available');
    }

    const startTime = Date.now();
    let totalPulled = 0;
    let totalConflicts = 0;
    const errors: SyncError[] = [];

    for (const table of tables) {
      try {
        // Get last sync time for this table
        const lastSyncRecord = await localProvider.findFirst('sync_logs', {
          filters: [
            { field: 'provider', operator: 'eq', value: databaseConfig.provider },
            { field: 'tables_synced', operator: 'like', value: `%${table}%` },
          ],
          sorts: [{ field: 'completed_at', order: 'desc' }],
          limit: 1,
        });

        const lastSyncTime = lastSyncRecord?.completedAt || new Date(0);

        // Pull records updated since last sync
        const remoteRecords = await cloudProvider.findMany(table, {
          filters: [
            { field: 'updated_at', operator: 'gte', value: lastSyncTime.toISOString() },
            { field: 'deleted', operator: 'eq', value: false },
          ],
          limit: syncConfig.batchSize,
        });

        for (const remoteRecord of remoteRecords) {
          try {
            const localRecord = await localProvider.findById(table, remoteRecord.id);
            
            if (!localRecord) {
              // New record
              await localProvider.create(table, { 
                ...remoteRecord, 
                synced: true, 
                syncedAt: new Date().toISOString() 
              });
              totalPulled++;
            } else {
              // Check for conflicts
              const localUpdated = new Date(localRecord.updatedAt).getTime();
              const remoteUpdated = new Date(remoteRecord.updatedAt).getTime();
              
              if (remoteUpdated > localUpdated) {
                // Remote is newer
                await localProvider.update(table, remoteRecord.id, { 
                  ...remoteRecord, 
                  synced: true, 
                  syncedAt: new Date().toISOString() 
                });
                totalPulled++;
              } else if (localUpdated > remoteUpdated) {
                // Local is newer - conflict!
                totalConflicts++;
                errors.push({
                  table,
                  recordId: remoteRecord.id,
                  operation: 'update',
                  error: 'Conflict: local and remote both modified',
                  resolved: false,
                  resolution: syncConfig.conflictResolution,
                });
              }
            }
          } catch (error) {
            errors.push({
              table,
              recordId: remoteRecord.id,
              operation: 'update',
              error: error instanceof Error ? error.message : 'Unknown error',
              resolved: false,
            });
          }
        }
      } catch (error) {
        errors.push({
          table,
          error: error instanceof Error ? error.message : 'Unknown error',
          operation: 'update',
          resolved: false,
        });
      }
    }

    return {
      success: errors.length === 0,
      pushed: 0,
      pulled: totalPulled,
      conflicts: totalConflicts,
      errors,
      durationMs: Date.now() - startTime,
    };
  }

  // ============================================================================
  // Conflict Resolution
  // ============================================================================

  async resolveConflict(
    table: string,
    recordId: string,
    resolution: ConflictResolution,
    localData?: any,
    remoteData?: any
  ): Promise<void> {
    const localProvider = getDatabaseProvider(DatabaseProvider.SQLITE) ?? null;
    const cloudProvider = this.getCloudProvider();
    
    if (!localProvider || !cloudProvider) {
      throw new Error('Required providers not available');
    }

    let resolvedData: any;

    switch (resolution) {
      case 'local_wins':
        resolvedData = localData;
        break;
      case 'remote_wins':
        resolvedData = remoteData;
        break;
      case 'last_write_wins':
        // Compare timestamps
        if (localData && remoteData) {
          const localTime = new Date(localData.updatedAt).getTime();
          const remoteTime = new Date(remoteData.updatedAt).getTime();
          resolvedData = localTime > remoteTime ? localData : remoteData;
        } else {
          resolvedData = localData || remoteData;
        }
        break;
      case 'merge':
        // Simple merge - would need more sophisticated logic for real use
        resolvedData = { ...remoteData, ...localData };
        break;
      default:
        throw new Error(`Unknown conflict resolution: ${resolution}`);
    }

    // Update both local and remote
    await localProvider.update(table, recordId, { 
      ...resolvedData, 
      synced: true, 
      syncedAt: new Date().toISOString() 
    });
    
    await cloudProvider.update(table, recordId, resolvedData);
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private getCloudProvider(): DatabaseProviderInterface | null {
    // Return the appropriate cloud provider based on config
    switch (databaseConfig.provider) {
      case DatabaseProvider.SQLITE:
        // For SQLite, cloud would be Supabase, Turso, or Azure SQL
        // This would need additional config to specify which cloud provider to use
        return null;
      case DatabaseProvider.SUPABASE:
        return getDatabaseProvider(DatabaseProvider.SUPABASE) ?? null;
      case DatabaseProvider.TURSO:
        return getDatabaseProvider(DatabaseProvider.TURSO) ?? null;
      case DatabaseProvider.AZURE_SQL:
        return getDatabaseProvider(DatabaseProvider.AZURE_SQL) ?? null;
      default:
        return null;
    }
  }

  // ============================================================================
  // Status & Monitoring
  // ============================================================================

  getSyncStatus(): { 
    isRunning: boolean; 
    autoSyncEnabled: boolean; 
    lastSync: SyncJob | null;
    pendingJobs: number;
  } {
    const jobs = Array.from(this.syncJobs.values());
    const lastSync = jobs
      .filter(j => j.status === 'completed')
      .sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0))[0] || null;

    return {
      isRunning: this.isRunning,
      autoSyncEnabled: syncConfig.enabled,
      lastSync,
      pendingJobs: jobs.filter(j => j.status === 'pending' || j.status === 'running').length,
    };
  }

  getSyncHistory(limit: number = 50): SyncJob[] {
    return Array.from(this.syncJobs.values())
      .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0))
      .slice(0, limit);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  shutdown(): void {
    this.stopAutoSync();
    this.syncJobs.clear();
    logger.info('Sync service shut down');
  }
}

export const syncService = new SyncService();
export default syncService;