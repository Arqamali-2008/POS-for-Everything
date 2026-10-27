import { createContext, useContext, useEffect, ReactNode } from 'react';
import { useAuthStore, selectIsAuthenticated, selectIsInitialized, selectIsLoading, selectUser } from '../stores/authStore';
import type { User } from '@pospro/core';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isInitialized: boolean;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  refreshTokens: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const user = useAuthStore(selectUser);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const isInitialized = useAuthStore(selectIsInitialized);
  const isLoading = useAuthStore(selectIsLoading);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const refreshTokens = useAuthStore((state) => state.refreshTokens);

  // Initialize auth on mount
  useEffect(() => {
    useAuthStore.getState().initialize();
  }, []);

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isInitialized,
      isLoading,
      login,
      logout,
      refreshTokens,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}