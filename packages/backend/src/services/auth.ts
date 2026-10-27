/**
 * Authentication Service
 * Handles JWT tokens, Supabase Auth integration, and local auth
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { databaseConfig, serverConfig, appConfig } from '../config';
import { logger } from './logger';
import { AuthProvider, UserRole } from '@pospro/core';
import type {
  User,
  Session,
  LoginCredentials,
  RegisterData,
  TokenPayload,
} from '@pospro/core';

interface RefreshTokenPayload {
  userId: string;
  sessionId: string;
  type: 'refresh';
}

class AuthService {
  private supabase: SupabaseClient | null = null;
  private localAdminEmail: string;
  private localAdminPasswordHash: string;
  private loginAttempts: Map<string, { count: number; lockedUntil: number }> = new Map();

  constructor() {
    this.localAdminEmail = appConfig.auth.localAdminEmail.toLowerCase();
    this.localAdminPasswordHash = bcrypt.hashSync(appConfig.auth.localAdminPassword, 10);
    
    // Initialize Supabase if configured
    if (appConfig.auth.supabaseEnabled && databaseConfig.supabaseUrl && databaseConfig.supabaseAnonKey) {
      this.supabase = createClient(databaseConfig.supabaseUrl, databaseConfig.supabaseAnonKey);
      logger.info('Supabase Auth initialized');
    }
  }

  // ============================================================================
  // Token Management
  // ============================================================================

  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, serverConfig.jwtSecret, {
      expiresIn: serverConfig.jwtExpiresIn as any,
      issuer: 'ami-pos',
      audience: 'ami-pos-api',
    });
  }

  generateRefreshToken(payload: RefreshTokenPayload): string {
    return jwt.sign(payload, serverConfig.jwtSecret, {
      expiresIn: serverConfig.refreshTokenExpiresIn as any,
      issuer: 'ami-pos',
      audience: 'ami-pos-refresh',
    });
  }

  verifyAccessToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, serverConfig.jwtSecret, {
        issuer: 'ami-pos',
        audience: 'ami-pos-api',
      }) as TokenPayload;
    } catch {
      return null;
    }
  }

  verifyRefreshToken(token: string): RefreshTokenPayload | null {
    try {
      return jwt.verify(token, serverConfig.jwtSecret, {
        issuer: 'ami-pos',
        audience: 'ami-pos-refresh',
      }) as RefreshTokenPayload;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Login Methods
  // ============================================================================

  async login(credentials: LoginCredentials): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const email = credentials.email.toLowerCase().trim();
    
    // Check rate limiting
    if (this.isLockedOut(email)) {
      throw new Error('Too many login attempts. Please try again later.');
    }
    
    // Try Supabase Auth first
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase.auth.signInWithPassword({
          email,
          password: credentials.password,
        });
        
        if (!error && data.session) {
          const user = await this.getOrCreateUserFromSupabase(data.user);
          this.recordLoginAttempt(email, true);
          
          const sessionId = crypto.randomUUID();
          const accessToken = this.generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role,
            provider: AuthProvider.SUPABASE,
            sessionId,
          });
          
          const refreshToken = this.generateRefreshToken({
            userId: user.id,
            sessionId,
            type: 'refresh',
          });
          
          logger.auth('login_supabase', user.id, true);
          return { user, accessToken, refreshToken };
        }
      } catch (error) {
        logger.warn('Supabase auth failed, falling back to local', { error: error instanceof Error ? error.message : 'Unknown' });
      }
    }
    
    // Fallback to local auth
    if (email === this.localAdminEmail && bcrypt.compareSync(credentials.password, this.localAdminPasswordHash)) {
      const user: User = {
        id: 'local-admin-1',
        email: this.localAdminEmail,
        fullName: 'Store Administrator',
        role: UserRole.ADMIN,
        isActive: true,
        authProvider: AuthProvider.LOCAL,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      this.recordLoginAttempt(email, true);
      
      const sessionId = crypto.randomUUID();
      const accessToken = this.generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        provider: AuthProvider.LOCAL,
        sessionId,
      });
      
      const refreshToken = this.generateRefreshToken({
        userId: user.id,
        sessionId,
        type: 'refresh',
      });
      
      logger.auth('login_local', user.id, true);
      return { user, accessToken, refreshToken };
    }
    
    // Invalid credentials
    this.recordLoginAttempt(email, false);
    logger.auth('login_failed', undefined, false);
    throw new Error('Invalid email or password');
  }

  async register(data: RegisterData): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    if (!this.supabase) {
      throw new Error('Registration requires Supabase configuration');
    }
    
    const email = data.email.toLowerCase().trim();
    
    const { data: authData, error } = await this.supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        data: {
          full_name: data.fullName,
          // Open registration is self-service: new users can never pick a
          // privileged role. Managers/admins are provisioned by admins.
          role: 'cashier',
        },
      },
    });
    
    if (error) {
      throw new Error(error.message);
    }
    
    if (!authData.user) {
      throw new Error('Registration failed');
    }
    
    // User profile is created automatically via Supabase trigger
    // Wait a bit for trigger to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const user = await this.getOrCreateUserFromSupabase(authData.user);
    
    const sessionId = crypto.randomUUID();
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      provider: AuthProvider.SUPABASE,
      sessionId,
    });
    
    const refreshToken = this.generateRefreshToken({
      userId: user.id,
      sessionId,
      type: 'refresh',
    });
    
    logger.auth('register', user.id, true);
    return { user, accessToken, refreshToken };
  }

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = this.verifyRefreshToken(refreshToken);
    if (!payload) {
      throw new Error('Invalid refresh token');
    }
    
    // Get user to verify they still exist and are active
    const user = await this.getUserById(payload.userId);
    if (!user || !user.isActive) {
      throw new Error('User not found or inactive');
    }
    
    const newSessionId = crypto.randomUUID();
    const accessToken = this.generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      provider: user.authProvider as AuthProvider,
      sessionId: newSessionId,
    });
    
    const newRefreshToken = this.generateRefreshToken({
      userId: user.id,
      sessionId: newSessionId,
      type: 'refresh',
    });
    
    return { accessToken, refreshToken: newRefreshToken };
  }

  // ============================================================================
  // User Management
  // ============================================================================

  private async getOrCreateUserFromSupabase(supabaseUser: any): Promise<User> {
    // In a real implementation, this would fetch from the profiles table
    // For now, construct from Supabase user metadata
    return {
      id: supabaseUser.id,
      email: supabaseUser.email,
      fullName: supabaseUser.user_metadata?.full_name || supabaseUser.email?.split('@')[0] || 'User',
      role: supabaseUser.user_metadata?.role || 'cashier',
      isActive: true,
      authProvider: AuthProvider.SUPABASE,
      supabaseUserId: supabaseUser.id,
      createdAt: supabaseUser.created_at,
      updatedAt: new Date().toISOString(),
    };
  }

  async getUserById(userId: string): Promise<User | null> {
    // In a real implementation, this would query the database
    // For local admin
    if (userId === 'local-admin-1') {
      return {
        id: 'local-admin-1',
        email: this.localAdminEmail,
        fullName: 'Store Administrator',
        role: UserRole.ADMIN,
        isActive: true,
        authProvider: AuthProvider.LOCAL,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    
    // For Supabase users, would query profiles table
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        
        if (!error && data) {
          return {
            id: data.id,
            email: data.email,
            fullName: data.full_name,
            role: data.role,
            branchId: data.branch_id,
            isActive: true,
            authProvider: AuthProvider.SUPABASE,
            supabaseUserId: data.id,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch {
        // Ignore
      }
    }
    
    return null;
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const lowerEmail = email.toLowerCase();
    
    if (lowerEmail === this.localAdminEmail) {
      return {
        id: 'local-admin-1',
        email: this.localAdminEmail,
        fullName: 'Store Administrator',
        role: UserRole.ADMIN,
        isActive: true,
        authProvider: AuthProvider.LOCAL,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    
    if (this.supabase) {
      try {
        const { data, error } = await this.supabase
          .from('profiles')
          .select('*')
          .eq('email', lowerEmail)
          .single();
        
        if (!error && data) {
          return {
            id: data.id,
            email: data.email,
            fullName: data.full_name,
            role: data.role,
            branchId: data.branch_id,
            isActive: true,
            authProvider: AuthProvider.SUPABASE,
            supabaseUserId: data.id,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
          };
        }
      } catch {
        // Ignore
      }
    }
    
    return null;
  }

  // ============================================================================
  // Rate Limiting
  // ============================================================================

  private recordLoginAttempt(email: string, success: boolean): void {
    const now = Date.now();
    const attempt = this.loginAttempts.get(email) || { count: 0, lockedUntil: 0 };
    
    if (success) {
      this.loginAttempts.delete(email);
    } else {
      attempt.count++;
      attempt.lockedUntil = 0; // Reset lockout on new attempt
      
      if (attempt.count >= appConfig.auth.maxLoginAttempts) {
        attempt.lockedUntil = now + appConfig.auth.lockoutDurationMs;
      }
      
      this.loginAttempts.set(email, attempt);
    }
  }

  private isLockedOut(email: string): boolean {
    const attempt = this.loginAttempts.get(email);
    if (!attempt) return false;
    
    if (attempt.lockedUntil > Date.now()) {
      return true;
    }
    
    // Lockout expired, reset
    if (attempt.lockedUntil > 0) {
      this.loginAttempts.delete(email);
    }
    
    return false;
  }

  // ============================================================================
  // Password Management
  // ============================================================================

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await this.getUserById(userId);
    if (!user) throw new Error('User not found');
    
    if (user.authProvider === 'local') {
      // Verify current password for local admin
      if (userId === 'local-admin-1') {
        if (!bcrypt.compareSync(currentPassword, this.localAdminPasswordHash)) {
          throw new Error('Current password is incorrect');
        }
        this.localAdminPasswordHash = bcrypt.hashSync(newPassword, 10);
      }
    } else if (this.supabase) {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) throw error;
    } else {
      throw new Error('Password change not supported for this auth provider');
    }
  }

  async resetPassword(email: string): Promise<void> {
    if (!this.supabase) {
      throw new Error('Password reset requires Supabase configuration');
    }
    
    const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${appConfig.server.corsOrigins[0]}/reset-password`,
    });
    
    if (error) throw error;
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  async revokeSession(sessionId: string): Promise<void> {
    // In a real implementation, this would invalidate the session in a store
    // For JWT, we'd need a token blacklist or short expiry with refresh token rotation
    logger.info('Session revoked', { sessionId });
  }

  async revokeAllUserSessions(userId: string): Promise<void> {
    // Would invalidate all sessions for a user
    logger.info('All user sessions revoked', { userId });
  }
}

export const authService = new AuthService();
export default authService;