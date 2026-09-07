/**
 * Test environment guard, shared by the global setup (main process) and the per-file
 * setup (worker processes). Must run BEFORE anything imports src/config/database.ts.
 *
 * DATABASE_URL defaults to the local test database; an explicitly provided value is
 * honored only if it points at localhost / 127.0.0.1 — otherwise the run is refused.
 */
export const DEFAULT_TEST_DATABASE_URL = 'postgresql://localhost:5432/persona_glimmer_test';
export const TEST_ADMIN_API_KEY = 'test-admin-key-not-a-secret';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export function applyTestEnv(): string {
  const databaseUrl = process.env.DATABASE_URL || DEFAULT_TEST_DATABASE_URL;

  let host: string;
  try {
    host = new URL(databaseUrl).hostname;
  } catch {
    throw new Error(`Refusing to run tests: DATABASE_URL is not a valid URL (${databaseUrl})`);
  }
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(
      `Refusing to run tests against a non-local database host "${host}". ` +
        'Tests drop and recreate the public schema; DATABASE_URL must point at localhost.'
    );
  }

  process.env.DATABASE_URL = databaseUrl;
  process.env.NODE_ENV = 'test';
  process.env.MOCK_OPENAI = 'true';
  process.env.DISABLE_RATE_LIMITS = 'true';
  process.env.ADMIN_API_KEY = TEST_ADMIN_API_KEY;
  process.env.ASSIGNMENT_MODE = process.env.ASSIGNMENT_MODE || 'random';
  delete process.env.ALLOW_FORCED_ASSIGNMENT;
  delete process.env.OPENAI_API_KEY;

  return databaseUrl;
}
