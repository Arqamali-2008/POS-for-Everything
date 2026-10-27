import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuthStore } from '../stores/authStore';
import { logger } from '../utils/logger';

interface WSContextType {
  socket: Socket | null;
  isConnected: boolean;
  subscribe: (tables: string[], events?: string[]) => void;
  unsubscribe: (tables: string[], events?: string[]) => void;
  emit: (event: string, data: any) => void;
  on: (event: string, callback: (data: any) => void) => () => void;
}

const WSContext = createContext<WSContextType | null>(null);

const WS_URL = import.meta.env.VITE_WS_URL || '';

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [subscriptions, setSubscriptions] = useState<{ tables: string[]; events: string[] }>({ tables: [], events: [] });
  const subscriptionsRef = useRef(subscriptions);
  const listenersRef = useRef<Map<string, Set<(data: any) => void>>>(new Map());

  useEffect(() => {
    subscriptionsRef.current = subscriptions;
  }, [subscriptions]);
  
  const { accessToken } = useAuthStore();

  useEffect(() => {
    if (!accessToken) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Initialize socket connection
    socketRef.current = io(WS_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
    });

    const socket = socketRef.current;

    socket.on('connect', () => {
      logger.info('WebSocket connected');
      setIsConnected(true);
      
      // Re-subscribe to previous subscriptions
      if (subscriptionsRef.current.tables.length > 0 || subscriptionsRef.current.events.length > 0) {
        socket.emit('subscribe', subscriptionsRef.current);
      }
    });

    socket.on('disconnect', (reason) => {
      logger.warn('WebSocket disconnected', { reason });
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      logger.error('WebSocket connection error', { error: error.message });
    });

    // Handle incoming events
    socket.onAny((eventName, data) => {
      const listeners = listenersRef.current.get(eventName);
      if (listeners) {
        listeners.forEach((callback) => callback(data));
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [accessToken]);

  // Re-subscribe when subscriptions change
  useEffect(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe', subscriptions);
    }
  }, [subscriptions]);

  const subscribe = (tables: string[], events: string[] = []) => {
    setSubscriptions({ tables, events });
  };

  const unsubscribe = (tables: string[] = [], events: string[] = []) => {
    setSubscriptions((prev) => ({
      tables: tables.length > 0 ? prev.tables.filter((t) => !tables.includes(t)) : [],
      events: events.length > 0 ? prev.events.filter((e) => !events.includes(e)) : [],
    }));
    
    if (socketRef.current?.connected) {
      socketRef.current.emit('unsubscribe', { tables, events });
    }
  };

  const emit = (event: string, data: any) => {
    socketRef.current?.emit(event, data);
  };

  const on = (event: string, callback: (data: any) => void) => {
    if (!listenersRef.current.has(event)) {
      listenersRef.current.set(event, new Set());
    }
    listenersRef.current.get(event)!.add(callback);
    
    return () => {
      listenersRef.current.get(event)?.delete(callback);
    };
  };

  const value = {
    socket: socketRef.current,
    isConnected,
    subscribe,
    unsubscribe,
    emit,
    on,
  };

  return (
    <WSContext.Provider value={value}>
      {children}
    </WSContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WSContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}