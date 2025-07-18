import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  // For local development, we'll use push instead of the d1-http driver
  // In production, you would configure the d1-http driver with credentials
}); 