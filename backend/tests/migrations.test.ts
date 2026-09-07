import { Pool } from 'pg';
import { afterAll, describe, expect, it } from 'vitest';
import pool, { closePool } from '../src/config/database';
import { parseDatabaseTarget, runResetCli } from '../src/migrations/reset-database';
import { listMigrationFiles, runMigrations } from '../src/migrations/run-migrations';

afterAll(async () => {
  await closePool();
});

describe('migration runner', () => {
  it('ships exactly the eight v2 migrations in order', () => {
    expect(listMigrationFiles()).toEqual([
      '001_create_agent_conditions.sql',
      '002_create_contexts.sql',
      '003_create_sessions.sql',
      '004_create_session_messages.sql',
      '005_create_session_survey_responses.sql',
      '006_create_survey_questions.sql',
      '007_create_global_guardrails.sql',
      '008_create_updated_at_triggers.sql',
    ]);
  });

  it('is idempotent: a second run applies nothing and records every file once', async () => {
    const result = await runMigrations(pool, undefined, () => undefined);
    expect(result.applied).toEqual([]);
    expect(result.skipped).toHaveLength(8);

    const { rows } = await pool.query('SELECT filename FROM schema_migrations ORDER BY filename');
    expect(rows.map((r) => r.filename)).toEqual(listMigrationFiles());
  });

  it('created the v2 tables and no v1 tables', async () => {
    const { rows } = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
    );
    const names = rows.map((r) => r.table_name);
    expect(names).toEqual([
      'agent_conditions',
      'contexts',
      'global_guardrails',
      'schema_migrations',
      'session_messages',
      'session_survey_responses',
      'sessions',
      'survey_questions',
    ]);
  });

  it('updated_at trigger fires on sessions', async () => {
    const created = await pool.query(
      `INSERT INTO sessions (agent_condition_id, context_id, model, prompt_version)
       VALUES (1, 1, 'mock', '2.0') RETURNING id, updated_at`
    );
    await new Promise((r) => setTimeout(r, 5));
    const updated = await pool.query(
      `UPDATE sessions SET external_id = 'x' WHERE id = $1 RETURNING updated_at`,
      [created.rows[0].id]
    );
    expect(new Date(updated.rows[0].updated_at).getTime()).toBeGreaterThan(
      new Date(created.rows[0].updated_at).getTime()
    );
  });
});

describe('reset-database CLI guard', () => {
  const collect = () => {
    const out: string[] = [];
    const err: string[] = [];
    return { out, err, io: { log: (m: string) => out.push(m), error: (m: string) => err.push(m) } };
  };

  async function publicTableCount(): Promise<number> {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'`
    );
    return rows[0].n;
  }

  it('refuses (exit 1) unless CONFIRM_RESET equals the target database name, touching nothing', async () => {
    const env = { ...process.env };
    const { database } = parseDatabaseTarget(env.DATABASE_URL);
    const tablesBefore = await publicTableCount();
    expect(tablesBefore).toBe(8);
    const { out, err, io } = collect();

    expect(await runResetCli({ ...env, CONFIRM_RESET: undefined }, io, pool)).toBe(1);
    expect(await runResetCli({ ...env, CONFIRM_RESET: '' }, io, pool)).toBe(1);
    expect(await runResetCli({ ...env, CONFIRM_RESET: `${database}_wrong` }, io, pool)).toBe(1);
    expect(await runResetCli({ ...env, CONFIRM_RESET: database.toUpperCase() }, io, pool)).toBe(1);
    expect(err.filter((m) => m.startsWith('Refusing to reset'))).toHaveLength(4);
    expect(err.join('\n')).toContain(`CONFIRM_RESET=${database}`);
    expect(out.every((m) => m.startsWith(`Target database: ${database} on host `))).toBe(true);

    // An unusable DATABASE_URL is also exit 1, before any confirmation check.
    expect(await runResetCli({ ...env, DATABASE_URL: undefined }, io, pool)).toBe(1);
    expect(await runResetCli({ ...env, DATABASE_URL: 'postgresql://localhost:5432/' }, io, pool)).toBe(1);
    expect(err.filter((m) => m.startsWith('Reset failed'))).toHaveLength(2);

    expect(out.some((m) => m.includes('dropping'))).toBe(false);
    expect(await publicTableCount()).toBe(tablesBefore);
  });

  it('resets (exit 0) only with the exact database name, and exits 1 when the reset fails', async () => {
    const env = { ...process.env };
    const { database } = parseDatabaseTarget(env.DATABASE_URL);

    // A recording stand-in for the pool: the real test database must survive this test.
    const statements: string[] = [];
    const recording = {
      query: async (sql: string) => {
        statements.push(sql);
        return { rows: [] };
      },
    } as unknown as Pool;
    const ok = collect();
    expect(await runResetCli({ ...env, CONFIRM_RESET: database }, ok.io, recording)).toBe(0);
    expect(statements).toEqual(['DROP SCHEMA public CASCADE', 'CREATE SCHEMA public']);
    expect(ok.out.some((m) => m.startsWith('WARNING: dropping ALL tables'))).toBe(true);
    expect(ok.out.some((m) => m.startsWith('Database reset complete'))).toBe(true);
    expect(ok.err).toEqual([]);

    const failing = {
      query: async () => {
        throw new Error('permission denied for schema public');
      },
    } as unknown as Pool;
    const bad = collect();
    expect(await runResetCli({ ...env, CONFIRM_RESET: database }, bad.io, failing)).toBe(1);
    expect(bad.err.some((m) => m.startsWith('Reset failed: permission denied'))).toBe(true);

    expect(await publicTableCount()).toBe(8);
  });
});
