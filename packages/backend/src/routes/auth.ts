/**
 * Authentication Routes
 * Login, register, token refresh, password management
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth';
import { authenticateToken, optionalAuth, validateBody } from '../middleware/auth';
import { logger } from '../services/logger';
import type { LoginCredentials, RegisterData } from '@pospro/core';

const router = Router();

// Validation schemas
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  rememberMe: z.boolean().optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6).max(128),
  fullName: z.string().min(1).max(255),
  role: z.enum(['admin', 'manager', 'cashier']).optional(),
  branchId: z.string().optional(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(6),
  newPassword: z.string().min(6).max(128),
});

const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/auth/login
 * User login with email/password
 */
router.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    const credentials = req.body as LoginCredentials;
    const result = await authService.login(credentials);
    
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.warn('Login failed', { email: req.body.email, error: error instanceof Error ? error.message : 'Unknown' });
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Login failed',
      code: 'LOGIN_FAILED',
    });
  }
});

/**
 * POST /api/auth/register
 * User registration (requires Supabase)
 */
router.post('/register', validateBody(registerSchema), async (req: Request, res: Response) => {
  try {
    const data = req.body as RegisterData;
    const result = await authService.register(data);
    
    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.warn('Registration failed', { email: req.body.email, error: error instanceof Error ? error.message : 'Unknown' });
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Registration failed',
      code: 'REGISTRATION_FAILED',
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', validateBody(refreshTokenSchema), async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens(refreshToken);
    
    res.json({
      success: true,
      data: tokens,
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error instanceof Error ? error.message : 'Token refresh failed',
      code: 'REFRESH_FAILED',
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client-side token removal, server-side session revocation optional)
 */
router.post('/logout', authenticateToken, async (req: Request, res: Response) => {
  try {
    if (req.user?.sessionId) {
      await authService.revokeSession(req.user.sessionId);
    }
    
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Logout failed',
      code: 'LOGOUT_FAILED',
    });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
router.post('/change-password', authenticateToken, validateBody(changePasswordSchema), async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.userId;
    
    await authService.changePassword(userId, currentPassword, newPassword);
    
    // Revoke all other sessions for security
    await authService.revokeAllUserSessions(userId);
    
    res.json({
      success: true,
      message: 'Password changed successfully. Please log in again.',
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Password change failed',
      code: 'PASSWORD_CHANGE_FAILED',
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Request password reset email
 */
router.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    
    if (!email || !z.string().email().safeParse(email).success) {
      return res.status(400).json({
        success: false,
        error: 'Valid email required',
        code: 'INVALID_EMAIL',
      });
    }
    
    await authService.resetPassword(email);
    
    // Always return success to prevent email enumeration
    res.json({
      success: true,
      message: 'If the email exists, a password reset link has been sent',
    });
  } catch (error) {
    logger.error('Password reset failed', { email: req.body.email }, error instanceof Error ? error : undefined);
    res.status(500).json({
      success: false,
      error: 'Password reset request failed',
      code: 'RESET_FAILED',
    });
  }
});

/**
 * GET /api/auth/me
 * Get current authenticated user
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await authService.getUserById(req.user!.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    
    // Remove sensitive data
    const { passwordHash, pinHash, ...safeUser } = user as any;
    
    res.json({
      success: true,
      data: safeUser,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get user info',
      code: 'USER_FETCH_FAILED',
    });
  }
});

/**
 * GET /api/auth/config
 * Get auth configuration for frontend
 */
router.get('/config', optionalAuth, (req: Request, res: Response) => {
  res.json({
    success: true,
    config: {
      supabaseEnabled: true, // Would come from config
      localAdminEmail: 'admin@pos.com', // Masked
    },
  });
});

export default router;