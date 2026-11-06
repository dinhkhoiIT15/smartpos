import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  // No dbCredentials: generation/check must NEVER contact Neon.
  strict: true,
});
