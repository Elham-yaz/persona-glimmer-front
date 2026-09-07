/**
 * Study-wide constants and environment-driven switches.
 * Single source of truth for the backend; the frontend reads these values from API responses.
 */

export const MAX_INTERACTIONS = 10;
export const PROMPT_VERSION = '2.0';

export const SURVEY_QUESTION_COUNT = 16;
export const SURVEY_QUESTION_IDS: readonly string[] = Array.from(
  { length: SURVEY_QUESTION_COUNT },
  (_, i) => `post-${i + 1}`
);
export const SURVEY_MIN_VALUE = 1;
export const SURVEY_MAX_VALUE = 7;

export const COMPLETION_CODE_MIN = 10000;
export const COMPLETION_CODE_MAX = 99999;
export const COMPLETION_CODE_MAX_ATTEMPTS = 20;

export const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';

export type AssignmentMode = 'random' | 'balanced';

// Environment switches are read at call time (not import time) so tests can toggle them.
export function getAssignmentMode(): AssignmentMode {
  return process.env.ASSIGNMENT_MODE === 'balanced' ? 'balanced' : 'random';
}

export function isForcedAssignmentAllowed(): boolean {
  return process.env.ALLOW_FORCED_ASSIGNMENT === 'true';
}

export function isMockOpenAI(): boolean {
  return process.env.MOCK_OPENAI === 'true';
}

export function getOpenAIModel(): string {
  return (process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL).trim();
}

export function areRateLimitsDisabled(): boolean {
  return process.env.DISABLE_RATE_LIMITS === 'true';
}

/**
 * Names of the environment variables that must be present for the server to start.
 * OPENAI_API_KEY is only required when the OpenAI service is not mocked.
 */
export function getRequiredEnvVars(): string[] {
  const required = ['DATABASE_URL', 'ADMIN_API_KEY'];
  if (!isMockOpenAI()) {
    required.push('OPENAI_API_KEY');
  }
  return required;
}

// Rate limits (per docs/STUDY2_API.md §1). Configurable because participants often
// share one public IP (university NAT, computer labs): the per-IP session-creation
// limit must comfortably exceed the number of participants who may start from one
// network within an hour.
export const DEFAULT_SESSION_CREATE_LIMIT_PER_HOUR = 60;
export const DEFAULT_MESSAGE_LIMIT_PER_MINUTE = 30;

function positiveIntFromEnv(name: string, fallback: number): number {
  const raw = (process.env[name] ?? '').trim();
  // Strict: the whole value must be a positive decimal integer ('1.5x' or '12abc' fall back).
  if (!/^[0-9]+$/.test(raw)) return fallback;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

/** Max POST /api/sessions per IP per hour (env SESSION_CREATE_LIMIT_PER_HOUR). */
export function getSessionCreateLimitPerHour(): number {
  return positiveIntFromEnv('SESSION_CREATE_LIMIT_PER_HOUR', DEFAULT_SESSION_CREATE_LIMIT_PER_HOUR);
}

/** Max POST /api/sessions/me/messages per session per minute (env MESSAGE_LIMIT_PER_MINUTE). */
export function getMessageLimitPerMinute(): number {
  return positiveIntFromEnv('MESSAGE_LIMIT_PER_MINUTE', DEFAULT_MESSAGE_LIMIT_PER_MINUTE);
}
