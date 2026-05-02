import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const testDatabaseUrl = 'file:./test.db';

process.env.DATABASE_URL = testDatabaseUrl;
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'vitest-secret';
process.env.NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET ?? 'vitest-secret';
process.env.AUTH_URL = process.env.AUTH_URL ?? 'http://localhost:3000';
process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    fileParallelism: false,
    setupFiles: ['./src/test/setup.ts'],
    env: {
      DATABASE_URL: testDatabaseUrl,
      AUTH_SECRET: 'vitest-secret',
      NEXTAUTH_SECRET: 'vitest-secret',
      AUTH_URL: 'http://localhost:3000',
      NEXTAUTH_URL: 'http://localhost:3000',
    },
  },
});
