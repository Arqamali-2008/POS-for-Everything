/**
 * WebSocket Service
 * Real-time communication using Socket.IO for LAN terminal sync
 */

import { Server as HTTPServer } from 'http';
import { Server, Socket, Namespace } from 'socket.io';
import { authService } from '../services/auth';
import { logger } from '../services/logger';
import type { WSEvent, RealtimePayload } from '@pospro/core';

interface ConnectedClient {
  id: string;
  socket: Socket;
  userId?: string;
  deviceId?: string;
  branchId?: string;
  role?: string;
  connectedAt: Date;
  lastPing: Date;
}

class WebSocketService {
  private io: Server | null = null;
  private clients: Map<string, ConnectedClient> = new Map();
  private namespaces: Map<string, Namespace> = new Map();
  private pingInterval: NodeJS.Timeout | null = null;

  // ============================================================================
  // Initialization
  // ============================================================================

  initialize(httpServer: HTTPServer): void {
    this.io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:5173',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      pingTimeout: 60000,
      pingInterval: 25000,
      transports: ['websocket', 'polling'],
    });

    this.setupMainNamespace();
    this.startPingInterval();
    
    logger.info('WebSocket server initialized');
  }

  private setupMainNamespace(): void {
    if (!this.io) return;

    const mainNs = this.io.of('/');
    this.namespaces.set('main', mainNs);

    mainNs.use(async (socket, next) => {
      try {
        // Authenticate via token in handshake auth
        const token = socket.handshake.auth.token || socket.handshake.query.token;
        const deviceId = socket.handshake.auth.deviceId || socket.handshake.query.deviceId;
        
        if (token) {
          const payload = authService.verifyAccessToken(token as string);
          if (payload) {
            socket.data.user = payload;
          }
        }
        
        socket.data.deviceId = deviceId;
        next();
      } catch (error) {
        next(new Error('Authentication failed'));
      }
    });

    mainNs.on('connection', (socket) => this.handleConnection(socket, mainNs));
  }

  private handleConnection(socket: Socket, namespace: Namespace): void {
    const clientId = socket.id;
    const user = socket.data.user;
    const deviceId = socket.data.deviceId;

    const client: ConnectedClient = {
      id: clientId,
      socket,
      userId: user?.userId,
      deviceId: deviceId as string,
      branchId: user?.branchId,
      role: user?.role,
      connectedAt: new Date(),
      lastPing: new Date(),
    };

    this.clients.set(clientId, client);
    
    logger.websocket('client_connected', clientId, { 
      userId: user?.userId, 
      deviceId,
      totalClients: this.clients.size 
    });

    // Send connection confirmation
    socket.emit('connected', {
      type: 'CONNECTED',
      message: 'Connected to POS for Everything Realtime Server',
      timestamp: new Date().toISOString(),
      clientId,
      serverTime: new Date().toISOString(),
    });

    // Handle events
    socket.on('ping', () => this.handlePing(socket));
    socket.on('pong', () => this.handlePong(socket, clientId));
    socket.on('subscribe', (data) => this.handleSubscribe(socket, data));
    socket.on('unsubscribe', (data) => this.handleUnsubscribe(socket, data));
    socket.on('sync_request', (data) => this.handleSyncRequest(socket, data));
    socket.on('disconnect', (reason) => this.handleDisconnect(clientId, reason));
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handlePing(socket: Socket): void {
    socket.emit('pong', { timestamp: new Date().toISOString() });
  }

  private handlePong(socket: Socket, clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.lastPing = new Date();
    }
  }

  private handleSubscribe(socket: Socket, data: { tables?: string[]; events?: string[] }): void {
    const client = this.clients.get(socket.id);
    if (!client) return;

    // Join rooms for tables/events
    if (data.tables) {
      for (const table of data.tables) {
        socket.join(`table:${table}`);
      }
    }
    
    if (data.events) {
      for (const event of data.events) {
        socket.join(`event:${event}`);
      }
    }

    if (client.branchId) {
      socket.join(`branch:${client.branchId}`);
    }

    if (client.deviceId) {
      socket.join(`device:${client.deviceId}`);
    }

    socket.emit('subscribed', { 
      tables: data.tables || [], 
      events: data.events || [],
      timestamp: new Date().toISOString(),
    });
  }

  private handleUnsubscribe(socket: Socket, data: { tables?: string[]; events?: string[] }): void {
    if (data.tables) {
      for (const table of data.tables) {
        socket.leave(`table:${table}`);
      }
    }
    
    if (data.events) {
      for (const event of data.events) {
        socket.leave(`event:${event}`);
      }
    }

    socket.emit('unsubscribed', { 
      tables: data.tables || [], 
      events: data.events || [],
      timestamp: new Date().toISOString(),
    });
  }

  private handleSyncRequest(socket: Socket, data: { tables?: string[]; since?: string }): void {
    // This would trigger a sync with the database
    // For now, just acknowledge
    socket.emit('sync_response', {
      success: true,
      message: 'Sync initiated',
      timestamp: new Date().toISOString(),
    });
  }

  private handleDisconnect(clientId: string, reason: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      this.clients.delete(clientId);
      logger.websocket('client_disconnected', clientId, { 
        reason, 
        userId: client.userId,
        totalClients: this.clients.size 
      });
    }
  }

  // ============================================================================
  // Broadcasting Methods
  // ============================================================================

  broadcast<T>(event: string, data: T, options?: { 
    branchId?: string; 
    deviceId?: string; 
    userId?: string;
    excludeClientId?: string;
  }): void {
    if (!this.io) return;

    const payload: WSEvent<T> = {
      type: event,
      data,
      timestamp: new Date().toISOString(),
    };

    let targetSockets: Socket[] = [];

    if (options?.branchId) {
      targetSockets = Array.from(this.io.of('/').adapter.rooms.get(`branch:${options.branchId}`) || [])
        .map(id => this.io!.of('/').sockets.get(id))
        .filter((s): s is Socket => s !== undefined);
    } else if (options?.deviceId) {
      targetSockets = Array.from(this.io.of('/').adapter.rooms.get(`device:${options.deviceId}`) || [])
        .map(id => this.io!.of('/').sockets.get(id))
        .filter((s): s is Socket => s !== undefined);
    } else if (options?.userId) {
      // Find client by userId
      for (const client of this.clients.values()) {
        if (client.userId === options.userId && client.id !== options.excludeClientId) {
          targetSockets.push(client.socket);
        }
      }
    } else {
      // Broadcast to all
      targetSockets = Array.from(this.io.of('/').sockets.values());
    }

    // Exclude sender if specified
    if (options?.excludeClientId) {
      targetSockets = targetSockets.filter(s => s.id !== options.excludeClientId);
    }

    for (const socket of targetSockets) {
      socket.emit(event, payload);
    }

    logger.websocket('broadcast', event, { 
      recipientCount: targetSockets.length,
      event 
    });
  }

  broadcastToTable<T>(table: string, event: string, data: T, excludeClientId?: string): void {
    if (!this.io) return;

    const payload: WSEvent<T> = {
      type: event,
      data,
      timestamp: new Date().toISOString(),
    };

    const room = this.io.of('/').adapter.rooms.get(`table:${table}`);
    if (room) {
      for (const clientId of room) {
        if (clientId !== excludeClientId) {
          const socket = this.io.of('/').sockets.get(clientId);
          if (socket) socket.emit(event, payload);
        }
      }
    }
  }

  broadcastToEvent<T>(eventName: string, data: T, excludeClientId?: string): void {
    if (!this.io) return;

    const payload: WSEvent<T> = {
      type: eventName,
      data,
      timestamp: new Date().toISOString(),
    };

    const room = this.io.of('/').adapter.rooms.get(`event:${eventName}`);
    if (room) {
      for (const clientId of room) {
        if (clientId !== excludeClientId) {
          const socket = this.io.of('/').sockets.get(clientId);
          if (socket) socket.emit(eventName, payload);
        }
      }
    }
  }

  // ============================================================================
  // Convenience Methods for Common Events
  // ============================================================================

  emitProductSaved(data: any, excludeClientId?: string): void {
    this.broadcast('PRODUCT_SAVED', data, { excludeClientId });
  }

  emitProductDeleted(data: any, excludeClientId?: string): void {
    this.broadcast('PRODUCT_DELETED', data, { excludeClientId });
  }

  emitSaleRecorded(data: any, excludeClientId?: string): void {
    this.broadcast('SALE_RECORDED', data, { excludeClientId });
  }

  emitCustomerSaved(data: any, excludeClientId?: string): void {
    this.broadcast('CUSTOMER_SAVED', data, { excludeClientId });
  }

  emitSupplierSaved(data: any, excludeClientId?: string): void {
    this.broadcast('SUPPLIER_SAVED', data, { excludeClientId });
  }

  emitExpenseSaved(data: any, excludeClientId?: string): void {
    this.broadcast('EXPENSE_SAVED', data, { excludeClientId });
  }

  emitInventoryAdjusted(data: any, excludeClientId?: string): void {
    this.broadcast('INVENTORY_ADJUSTED', data, { excludeClientId });
  }

  emitSettingsUpdated(data: any, excludeClientId?: string): void {
    this.broadcast('SETTINGS_UPDATED', data, { excludeClientId });
  }

  emitPrintJobQueued(data: any): void {
    this.broadcast('PRINT_JOB_QUEUED', data);
  }

  emitNotification(data: { title: string; message: string; type: 'info' | 'success' | 'warning' | 'error' }): void {
    this.broadcast('NOTIFICATION', data);
  }

  // ============================================================================
  // Client Management
  // ============================================================================

  getConnectedClients(): ConnectedClient[] {
    return Array.from(this.clients.values());
  }

  getClientCount(): number {
    return this.clients.size;
  }

  getClientsByBranch(branchId: string): ConnectedClient[] {
    return Array.from(this.clients.values()).filter(c => c.branchId === branchId);
  }

  getClientsByUser(userId: string): ConnectedClient[] {
    return Array.from(this.clients.values()).filter(c => c.userId === userId);
  }

  isClientConnected(clientId: string): boolean {
    return this.clients.has(clientId);
  }

  disconnectClient(clientId: string, reason: string = 'Server disconnect'): void {
    const client = this.clients.get(clientId);
    if (client) {
      client.socket.disconnect(true);
      this.clients.delete(clientId);
    }
  }

  // ============================================================================
  // Ping Interval
  // ============================================================================

  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = Date.now();
      const staleThreshold = 60000; // 60 seconds

      for (const [clientId, client] of this.clients) {
        if (now - client.lastPing.getTime() > staleThreshold) {
          logger.websocket('client_stale', clientId, { lastPing: client.lastPing });
          client.socket.disconnect(true);
          this.clients.delete(clientId);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  async shutdown(): Promise<void> {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Disconnect all clients
    for (const client of this.clients.values()) {
      client.socket.disconnect(true);
    }
    this.clients.clear();

    if (this.io) {
      await this.io.close();
      this.io = null;
    }

    logger.info('WebSocket server shut down');
  }
}

export const wsService = new WebSocketService();
export default wsService;
