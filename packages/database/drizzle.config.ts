import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

export default defineConfig({
  schema: './src/providers/sqlite-provider.ts', // This would be the schema file
  out: './src/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.SQLITE_DB_PATH || './data/pos.db',
  },
  verbose: true,
  strict: true,
});