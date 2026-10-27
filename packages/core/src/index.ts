/**
 * @pospro/core - Shared types, schemas, constants, and utilities
 * Main entry point for the core package
 */

// Constants & Enums
export * from './constants/enums';

// Types
export * from './types/entities';

// Validation Schemas (namespaced to avoid clashing with the entity types)
export * as validationSchemas from './schemas/validation';

// Database Schemas (Drizzle)
export * as databaseSchema from './schemas/database';

// Utility Functions
export * from './utils/helpers';

// Re-export commonly used Zod types
import { z } from 'zod';
export { z };

// Re-export Drizzle types
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
export type { InferSelectModel, InferInsertModel };