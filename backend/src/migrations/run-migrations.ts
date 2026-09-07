import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import pool, { closePool } from '../config/database';

/**
 * Tracked, transactional migration runner.
 *
 * - Creates schema_migrations(filename PK, applied_at) if missing.
 * - Applies every NNN_*.sql in this directory, in filename order, that is not yet recorded.
 * - Each file runs inside ONE transaction as a single multi-statement query
 *   (no manual ';' splitting), and its schema_migrations row is written in that
 *   same transaction, so a failure leaves nothing half-applied.
 * - Idempotent: re-running applies nothing new.
 */

const MIGRATION_FILE_PATTERN = /^\d{3}_.+\.sql$/;

export function listMigrationFiles(dir: string = __dirname): string[] {
  return readdirSync(dir)
    .filter((name) => MIGRATION_FILE_PATTERN.test(name))
    .sort((a, b) => a.localeCompare(b, 'en'));
}

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

export async function runMigrations(
  db: Pool = pool,
  dir: string = __dirname,
  log: (message: string) => void = console.log
): Promise<MigrationResult> {
  const client = await db.connect();
  const result: MigrationResult = { applied: [], skipped: [] };

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const appliedRows = await client.query<{ filename: string }>(
      'SELECT filename FROM schema_migrations'
    );
    const alreadyApplied = new Set(appliedRows.rows.map((row) => row.filename));

    for (const filename of listMigrationFiles(dir)) {
      if (alreadyApplied.has(filename)) {
        result.skipped.push(filename);
        log(`  = ${filename} (already applied)`);
        continue;
      }

      const sql = readFileSync(join(dir, filename), 'utf-8');
      log(`  > ${filename}`);

      await client.query('BEGIN');
      try {
        // A query without parameters uses the simple protocol, which accepts
        // multiple statements (and dollar-quoted bodies) in one call.
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(
          `Migration ${filename} failed and was rolled back: ${(error as Error).message}`
        );
      }
      result.applied.push(filename);
    }
  } finally {
    client.release();
  }

  return result;
}

async function main(): Promise<void> {
  console.log('Running database migrations...');
  try {
    const { applied, skipped } = await runMigrations();
    console.log(`Migrations complete: ${applied.length} applied, ${skipped.length} already applied.`);
    await closePool();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', (error as Error).message);
    await closePool().catch(() => undefined);
    process.exit(1);
  }
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun) {
  main();
}
