import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { User, UserRole } from '@pospro/core';
import { apiClient } from '../services/api';
import { logger } from '../utils/logger';

interface AuthState {
  // State
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isInitialized: boolean;
  
  // Actions
  initialize: () => Promise<void>;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  register: (data: { email: string; password: string; fullName: string; role?: UserRole }) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
  updateUser: (user: Partial<User>) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  clearAuth: () => void;
  
  // Helpers
  hasRole: (roles: UserRole[]) => boolean;
  isAdmin: () => boolean;
  isManager: () => boolean;
  getUserId: () => string | null;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,
      isLoading: false,
      isInitialized: false,
      
      // Initialize auth from storage
      initialize: async () => {
        const { accessToken, refreshToken } = get();
        
        if (!accessToken || !refreshToken) {
          set({ isInitialized: true });
          return;
        }
        
        set({ isLoading: true });
        
        try {
          // Verify access token
          const response = await apiClient.auth.me();
          
          if (response.success && response.data) {
            set({
              user: response.data as User,
              isAuthenticated: true,
              isInitialized: true,
              isLoading: false,
            });
          } else {
            // Try to refresh
            await get().refreshTokens();
          }
        } catch (error) {
          logger.warn('Auth initialization failed, attempting refresh', { error });
          
          try {
            await get().refreshTokens();
          } catch {
            // Clear invalid tokens
            get().clearAuth();
            set({ isInitialized: true, isLoading: false });
          }
        }
      },
      
      // Login
      login: async (email: string, password: string, rememberMe = false) => {
        set({ isLoading: true });
        
        try {
          const response = await apiClient.auth.login({ email, password, rememberMe });
          
          if (response.success && response.data) {
            const { user, accessToken, refreshToken } = response.data as any;

            set({
              user,
              accessToken,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });

            logger.info('User logged in', { userId: user.id, email: user.email });
          } else {
            throw new Error(response.error || 'Login failed');
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
      
      // Register
      register: async (data: { email: string; password: string; fullName: string; role?: UserRole }) => {
        set({ isLoading: true });
        
        try {
          const response = await apiClient.auth.register(data);
          
          if (response.success && response.data) {
            const { user, accessToken, refreshToken } = response.data as any;

            set({
              user,
              accessToken,
              refreshToken,
              isAuthenticated: true,
              isLoading: false,
            });

            logger.info('User registered', { userId: user.id, email: user.email });
          } else {
            throw new Error(response.error || 'Registration failed');
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },
      
      // Logout
      logout: async () => {
        const { accessToken } = get();
        
        try {
          if (accessToken) {
            await apiClient.auth.logout();
          }
        } catch (error) {
          logger.warn('Logout API call failed', { error });
        } finally {
          get().clearAuth();
        }
      },
      
      // Refresh tokens
      refreshTokens: async () => {
        const { refreshToken } = get();
        
        if (!refreshToken) {
          get().clearAuth();
          throw new Error('No refresh token available');
        }
        
        try {
          const response = await apiClient.auth.refresh(refreshToken);
          
          if (response.success && response.data) {
            const { accessToken, refreshToken: newRefreshToken } = response.data as any;

            set({
              accessToken,
              refreshToken: newRefreshToken,
            });

            // Fetch updated user info
            const userResponse = await apiClient.auth.me();
            if (userResponse.success && userResponse.data) {
              set({ user: userResponse.data as User });
            }

            logger.debug('Tokens refreshed');
          } else {
            throw new Error('Token refresh failed');
          }
        } catch (error) {
          get().clearAuth();
          throw error;
        }
      },
      
      // Update user profile
      updateUser: (userData: Partial<User>) => {
        const { user } = get();
        if (user) {
          set({ user: { ...user, ...userData } });
        }
      },
      
      // Set tokens directly
      setTokens: (accessToken: string, refreshToken: string) => {
        set({ accessToken, refreshToken, isAuthenticated: true });
      },
      
      // Clear auth
      clearAuth: () => {
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          isAuthenticated: false,
        });
      },
      
      // Role helpers
      hasRole: (roles: UserRole[]) => {
        const { user } = get();
        return user ? roles.includes(user.role) : false;
      },
      
      isAdmin: () => {
        const { user } = get();
        return user?.role === 'admin';
      },
      
      isManager: () => {
        const { user } = get();
        return user?.role === 'admin' || user?.role === 'manager';
      },
      
      getUserId: () => {
        const { user } = get();
        return user?.id || null;
      },
    }),
    {
      name: 'ami-pos-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);

// Selectors for performance
export const selectUser = (state: AuthState) => state.user;
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectIsLoading = (state: AuthState) => state.isLoading;
export const selectIsInitialized = (state: AuthState) => state.isInitialized;
export const selectAccessToken = (state: AuthState) => state.accessToken;
export const selectRefreshToken = (state: AuthState) => state.refreshToken;