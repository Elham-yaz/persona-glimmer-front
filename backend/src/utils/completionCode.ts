import { randomInt } from 'crypto';
import { PoolClient } from 'pg';
import {
  COMPLETION_CODE_MAX,
  COMPLETION_CODE_MAX_ATTEMPTS,
  COMPLETION_CODE_MIN,
} from '../config/study';

/** Uniform random 5-digit code in [10000, 99999]. */
export function generateCompletionCode(): number {
  return randomInt(COMPLETION_CODE_MIN, COMPLETION_CODE_MAX + 1);
}

/**
 * Assign a unique completion code to a session inside an already-open transaction.
 * A unique-violation aborts the current statement, so each attempt runs under a
 * SAVEPOINT that is rolled back on collision. Throws after COMPLETION_CODE_MAX_ATTEMPTS.
 */
export async function assignUniqueCompletionCode(
  client: PoolClient,
  sessionId: string
): Promise<number> {
  for (let attempt = 1; attempt <= COMPLETION_CODE_MAX_ATTEMPTS; attempt++) {
    const code = generateCompletionCode();
    await client.query('SAVEPOINT completion_code_attempt');
    try {
      await client.query(
        `UPDATE sessions
         SET completion_code = $1
         WHERE id = $2`,
        [code, sessionId]
      );
      await client.query('RELEASE SAVEPOINT completion_code_attempt');
      return code;
    } catch (error: any) {
      await client.query('ROLLBACK TO SAVEPOINT completion_code_attempt');
      if (error.code !== '23505') {
        throw error;
      }
      // Collision: try another code
    }
  }
  throw new Error(
    `Could not generate a unique completion code after ${COMPLETION_CODE_MAX_ATTEMPTS} attempts`
  );
}
