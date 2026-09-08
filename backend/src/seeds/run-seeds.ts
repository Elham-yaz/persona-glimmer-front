import { Pool } from 'pg';
import pool, { closePool } from '../config/database';
import { seedAgentConditions } from './agent_conditions.seed';
import { INFORMATIONAL_CONTEXT_PLACEHOLDER_NOTE, seedContexts } from './contexts.seed';
import { seedSurveyQuestions } from './survey_questions.seed';
import { seedGuardrails } from './guardrails.seed';

/**
 * Seed all reference data (idempotent upserts). Safe to re-run at any time.
 */
export async function runSeeds(
  db: Pool = pool,
  log: (message: string) => void = console.log
): Promise<void> {
  log('  > agent_conditions');
  await seedAgentConditions(db);
  log(`  > contexts (${INFORMATIONAL_CONTEXT_PLACEHOLDER_NOTE})`);
  await seedContexts(db);
  log('  > survey_questions');
  await seedSurveyQuestions(db);
  log('  > global_guardrails');
  await seedGuardrails(db);
}

async function main(): Promise<void> {
  console.log('Seeding database...');
  try {
    await runSeeds();
    console.log('All seeds completed successfully.');
    await closePool();
    process.exit(0);
  } catch (error) {
    console.error('Seeding failed:', (error as Error).message);
    await closePool().catch(() => undefined);
    process.exit(1);
  }
}

const isDirectRun =
  typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module;

if (isDirectRun) {
  main();
}
