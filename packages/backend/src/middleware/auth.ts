/**
 * Authentication Middleware
 * Express middleware for JWT verification and authorization
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { authService } from '../services/auth';
import { logger } from '../services/logger';
import { UserRole } from '@pospro/core';
import type { TokenPayload, User } from '@pospro/core';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
      authUser?: User;
    }
  }
}

// ============================================================================
// Authentication Middleware
// ============================================================================

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1]; // Bearer TOKEN
  
  if (!token) {
    res.status(401).json({
      success: false,
      error: 'Access token required',
      code: 'UNAUTHORIZED',
    });
    return;
  }
  
  const payload = authService.verifyAccessToken(token);
  if (!payload) {
    res.status(401).json({
      success: false,
      error: 'Invalid or expired access token',
      code: 'TOKEN_INVALID',
    });
    return;
  }
  
  req.user = payload;
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(' ')[1];
  
  if (token) {
    const payload = authService.verifyAccessToken(token);
    if (payload) {
      req.user = payload;
    }
  }
  
  next();
}

// ============================================================================
// Authorization Middleware
// ============================================================================

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
      return;
    }
    
    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: roles,
        userRole: req.user.role,
      });
      return;
    }
    
    next();
  };
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  requireRole(UserRole.ADMIN)(req, res, next);
}

export function requireManagerOrAdmin(req: Request, res: Response, next: NextFunction): void {
  requireRole(UserRole.ADMIN, UserRole.MANAGER)(req, res, next);
}

// ============================================================================
// Resource Ownership Middleware
// ============================================================================

export function requireOwnershipOrRole(
  getResourceUserId: (req: Request) => string | Promise<string>,
  ...allowedRoles: UserRole[]
) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
      });
      return;
    }
    
    // Check role first
    if (allowedRoles.includes(req.user.role)) {
      next();
      return;
    }
    
    // Check ownership
    try {
      const resourceUserId = await getResourceUserId(req);
      if (resourceUserId === req.user.userId) {
        next();
        return;
      }
    } catch {
      // Ignore errors, fall through to forbidden
    }
    
    res.status(403).json({
      success: false,
      error: 'Access denied',
      code: 'FORBIDDEN',
    });
  };
}

// ============================================================================
// Rate Limiting Middleware
// ============================================================================

interface RateLimitStore {
  [key: string]: { count: number; resetTime: number };
}

const rateLimitStore: RateLimitStore = {};

export function rateLimit(
  windowMs: number = 15 * 60 * 1000, // 15 minutes
  maxRequests: number = 100,
  keyGenerator?: (req: Request) => string
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyGenerator ? keyGenerator(req) : req.ip || 'unknown';
    const now = Date.now();
    
    const record = rateLimitStore[key];
    
    if (!record || now > record.resetTime) {
      rateLimitStore[key] = { count: 1, resetTime: now + windowMs };
      setRateLimitHeaders(res, maxRequests, maxRequests - 1);
      next();
      return;
    }
    
    if (record.count >= maxRequests) {
      res.set('Retry-After', Math.ceil((record.resetTime - now) / 1000).toString());
      res.status(429).json({
        success: false,
        error: 'Too many requests',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil((record.resetTime - now) / 1000),
      });
      return;
    }
    
    record.count++;
    setRateLimitHeaders(res, maxRequests, maxRequests - record.count);
    next();
  };
}

function setRateLimitHeaders(res: Response, limit: number, remaining: number): void {
  res.set('X-RateLimit-Limit', limit.toString());
  res.set('X-RateLimit-Remaining', remaining.toString());
  res.set('X-RateLimit-Reset', Math.ceil((Date.now() + 15 * 60 * 1000) / 1000).toString());
}

// Clean up old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(rateLimitStore)) {
    if (rateLimitStore[key].resetTime < now) {
      delete rateLimitStore[key];
    }
  }
}, 60 * 1000); // Every minute

// ============================================================================
// Request Validation Middleware
// ============================================================================

export function validateBody(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Query validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    
    req.query = result.data as any;
    next();
  };
}

export function validateParams(schema: any) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Parameter validation failed',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten().fieldErrors,
      });
      return;
    }
    
    req.params = result.data;
    next();
  };
}

// ============================================================================
// Error Handling Middleware
// ============================================================================

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  logger.error('Unhandled error', { 
    path: req.path, 
    method: req.method,
    userId: req.user?.userId 
  }, err);
  
  // Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details: err.flatten().fieldErrors,
    });
    return;
  }
  
  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      code: 'TOKEN_INVALID',
    });
    return;
  }
  
  if (err.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Token expired',
      code: 'TOKEN_EXPIRED',
    });
    return;
  }
  
  // Database errors
  if (err.message.includes('UNIQUE constraint failed') || err.message.includes('duplicate key')) {
    res.status(409).json({
      success: false,
      error: 'Resource already exists',
      code: 'CONFLICT',
    });
    return;
  }
  
  if (err.message.includes('FOREIGN KEY constraint failed')) {
    res.status(400).json({
      success: false,
      error: 'Referenced resource not found',
      code: 'BAD_REQUEST',
    });
    return;
  }
  
  // Default error
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
  });
}

// ============================================================================
// Request Logging Middleware
// ============================================================================

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.http(req.method, req.path, res.statusCode, duration);
  });
  
  next();
}

// ============================================================================
// CORS Middleware (Custom)
// ============================================================================

export function corsMiddleware(allowedOrigins: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.headers.origin;
    
    if (origin && allowedOrigins.includes(origin)) {
      res.set('Access-Control-Allow-Origin', origin);
      res.set('Access-Control-Allow-Credentials', 'true');
      res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
      res.set('Access-Control-Max-Age', '86400');
    }
    
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    
    next();
  };
}