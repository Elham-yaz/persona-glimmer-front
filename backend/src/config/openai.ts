import OpenAI from 'openai';
import dotenv from 'dotenv';
import { isMockOpenAI } from './study';

dotenv.config();

/** Per-request ceiling for the chat completion (contract §6: 30 s timeout). */
export const OPENAI_TIMEOUT_MS = 30000;
/**
 * The SDK retries timeouts, connection errors, 429 and 5xx twice by default with backoff,
 * which would stretch a failing call to ~90 s+. One attempt keeps OPENAI_TIMEOUT_MS the real
 * ceiling, well under the frontend's 60 s per-attempt timeout, so a slow request can never
 * overlap with the frontend's own retry (same clientMessageId) and double the model calls.
 */
export const OPENAI_MAX_RETRIES = 0;

let client: OpenAI | null = null;

/**
 * Lazily construct the OpenAI client so that MOCK_OPENAI=true works without a key.
 */
export function getOpenAIClient(): OpenAI {
  if (client) return client;

  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set in environment variables');
  }
  if (!apiKey.startsWith('sk-')) {
    console.warn('Warning: OpenAI API key does not start with "sk-". Please verify the key is correct.');
  }

  client = new OpenAI({ apiKey, timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES });
  return client;
}

/**
 * Lightweight key check used at startup in development only (never blocks startup).
 */
export async function validateApiKey(): Promise<boolean> {
  if (isMockOpenAI()) return true;
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Validation timeout')), 5000)
    );
    await Promise.race([getOpenAIClient().models.list(), timeoutPromise]);
    return true;
  } catch (error: any) {
    if (error.status === 401 || error.response?.status === 401) {
      return false;
    }
    // Network problems are not key problems
    return true;
  }
}
