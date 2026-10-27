/**
 * Casing boundary middleware
 *
 * The database schema stores snake_case columns while the frontend speaks
 * camelCase. Route handlers work with snake_case rows internally, so we
 * convert at the HTTP boundary: every JSON response leaving `/api` is
 * camelized. Incoming bodies are NOT transformed here — the SQLite provider
 * maps write keys onto real table columns itself.
 */

import type { Request, Response, NextFunction } from 'express';

const CAMEL_CACHE = new Map<string, string>();

function camelizeKey(key: string): string {
  let cached = CAMEL_CACHE.get(key);
  if (cached === undefined) {
    cached = key.replace(/_+([a-zA-Z0-9])/g, (_m, c: string) => c.toUpperCase());
    CAMEL_CACHE.set(key, cached);
  }
  return cached;
}

export function camelize<T>(value: T): T {
  return camelizeValue(value) as T;
}

function camelizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => camelizeValue(item));
  }
  if (value && typeof value === 'object' && !(value instanceof Date) && !Buffer.isBuffer(value)) {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(source)) {
      out[camelizeKey(key)] = camelizeValue(val);
    }
    return out;
  }
  return value;
}

/**
 * Patches `res.json` so all API payloads are camelized on the way out.
 * Values (setting keys, JSON strings) are never touched — only object keys.
 */
export function camelizeResponse(_req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res) as (body?: unknown) => Response;
  (res as unknown as { json: (body?: unknown) => Response }).json = (body?: unknown) => {
    try {
      return originalJson(camelize(body));
    } catch {
      return originalJson(body);
    }
  };
  next();
}
