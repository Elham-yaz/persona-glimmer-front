import { Pool } from 'pg';
import pool, { closePool } from '../config/database';

/**
 * Destructive reset of the target database's public schema.
 *
 * CLI guard: refuses to run unless CONFIRM_RESET equals the database name parsed from
 * DATABASE_URL. Prints host + database before acting. Exits non-zero on any failure.
 *
 * Strategy: DROP SCHEMA public CASCADE; CREATE SCHEMA public;
 * Fallback (insufficient privileges on the schema): drop every table in
 * information_schema.tables where table_schema = 'public', then schema_migrations.
 */

export interface DatabaseTarget {
  host: string;
  database: string;
}

export function parseDatabaseTarget(databaseUrl: string | undefined): DatabaseTarget {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!database) {
    throw new Error('DATABASE_URL does not name a database');
  }
  return { host: url.hostname || 'localhost', database };
}

async function dropAllPublicTables(db: Pool): Promise<void> {
  const tables = await db.query<{ table_name: string }>(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`
  );
  for (const { table_name } of tables.rows) {
    await db.query(`DROP TABLE IF EXISTS "${table_name.replace(/"/g, '""')}" CASCADE`);
  }
  await db.query('DROP TABLE IF EXISTS schema_migrations CASCADE');
  await db.query('DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE');
}

/**
 * Drop and recreate the public schema (with table-by-table fallback).
 * No confirmation guard here — callers (CLI, test setup) are responsible for safety checks.
 */
export async function resetPublicSchema(
  db: Pool = pool,
  log: (message: string) => void = console.log
): Promise<void> {
  try {
    await db.query('DROP SCHEMA public CASCADE');
    await db.query('CREATE SCHEMA public');
    log('Dropped and recreated schema "public".');
  } catch (error: any) {
    log(`Schema-level reset failed (${error.message}); falling back to dropping tables one by one.`);
    await dropAllPublicTables(db);
    log('Dropped all tables in schema "public".');
  }
}

export interface ResetCliIo {
  log: (message: string) => void;
  error: (message: string) => void;
}

/**
 * The `npm run db:reset` entry point, returned as an exit code so it can be tested.
 * 1 = refused (DATABASE_URL unusable, or CONFIRM_RESET missing / not equal to the database
 * name) or failed; 0 = the public schema was reset. Never touches the database unless confirmed.
 */
export async function runResetCli(
  env: NodeJS.ProcessEnv = process.env,
  io: ResetCliIo = { log: console.log, error: console.error },
  db: Pool = pool
): Promise<number> {
  let target: DatabaseTarget;
  try {
    target = parseDatabaseTarget(env.DATABASE_URL);
  } catch (error) {
    io.error(`Reset failed: ${(error as Error).message}`);
    return 1;
  }
  io.log(`Target database: ${target.database} on host ${target.host}`);

  const confirm = env.CONFIRM_RESET;
  if (!confirm || confirm !== target.database) {
    io.error(
      `Refusing to reset: set CONFIRM_RESET=${target.database} to confirm you want to wipe this database.`
    );
    return 1;
  }

  try {
    io.log('WARNING: dropping ALL tables in schema "public"...');
    await resetPublicSchema(db, io.log);
    io.log('Database reset complete. Next: npm run migrate && npm run seed');
    return 0;
  } catch (error) {
    io.error(`Reset failed: ${(error as Error).message}`);
    return 1;
  }
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun) {
  runResetCli()
    .then(async (code) => {
      await closePool().catch(() => undefined);
      process.exit(code);
    })
    .catch(async (error) => {
      console.error('Reset failed:', (error as Error).message);
      await closePool().catch(() => undefined);
      process.exit(1);
    });
}
