// Runs once in the main process before any test file: fresh schema, migrations, seeds.
import { applyTestEnv } from './test-env';

export async function setup(): Promise<void> {
  const databaseUrl = applyTestEnv();
  console.log(`[tests] resetting ${databaseUrl}`);

  // Import lazily so the pool is created only after the environment is final.
  const { default: pool, closePool } = await import('../src/config/database');
  const { resetPublicSchema } = await import('../src/migrations/reset-database');
  const { runMigrations } = await import('../src/migrations/run-migrations');
  const { runSeeds } = await import('../src/seeds/run-seeds');

  const quiet = () => undefined;
  try {
    await resetPublicSchema(pool, quiet);
    const { applied } = await runMigrations(pool, undefined, quiet);
    await runSeeds(pool, quiet);
    console.log(`[tests] applied ${applied.length} migrations and seeded reference data`);
  } finally {
    await closePool();
  }
}
