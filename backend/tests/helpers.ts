import { randomUUID } from 'crypto';
import http from 'http';
import request from 'supertest';
import { expect } from 'vitest';
import app from '../src/app';
import { TEST_ADMIN_API_KEY } from './test-env';

/**
 * One HTTP server per test file, bound explicitly to 127.0.0.1 and fully listening before any
 * request is made; supertest is then given the concrete base URL.
 *
 * Why: passing the Express app (or a server whose listen() has not completed) makes supertest
 * call listen(0) itself, which binds the IPv6 wildcard. On macOS the kernel can hand out a
 * wildcard ephemeral port that another process already holds specifically on 127.0.0.1 (VS Code
 * helper servers do this), and that process then answers the request with its own HTML 404.
 * Reproduced at ~1 in 2000 requests; a specific 127.0.0.1 bind cannot be hijacked that way.
 */
let server: http.Server | null = null;
let baseUrl: string | null = null;

export async function startServer(): Promise<string> {
  if (baseUrl) return baseUrl;
  server = http.createServer(app);
  await new Promise<void>((resolve, reject) => {
    server!.once('error', reject);
    server!.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Test server did not report a TCP address');
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
  return baseUrl;
}

export async function closeServer(): Promise<void> {
  const current = server;
  server = null;
  baseUrl = null;
  if (!current) return;
  await new Promise<void>((resolve) => {
    current.close(() => resolve());
    current.closeAllConnections?.();
  });
}

export const api = () => {
  if (!baseUrl) {
    throw new Error('Test server not started: call `await startServer()` in beforeAll');
  }
  return request(baseUrl);
};

export interface SessionData {
  sessionId: string;
  agent: { displayName: string };
  context: {
    id: number;
    code: string;
    title: string;
    scenarioType: string;
    participantScenario: string;
  };
  openingMessage: string;
  maxInteractions: number;
  interactionCount: number;
  isLocked: boolean;
  surveyCompleted: boolean;
  completionCode: number | null;
  messages: Array<{ id: string; sequence: number; role: string; content: string; createdAt: string }>;
}

/** Human-readable dump of an unexpected response, used in assertion messages. */
export function describeResponse(res: request.Response): string {
  return `status=${res.status} headers=${JSON.stringify(res.headers)} body=${res.text}`;
}

export async function createSession(body: Record<string, unknown> = {}): Promise<SessionData> {
  const res = await api().post('/api/sessions').send(body);
  expect(res.status, describeResponse(res)).toBe(201);
  expect(res.body.success).toBe(true);
  return res.body.data as SessionData;
}

export function sendMessage(sessionId: string, clientMessageId: string, content: string) {
  return api()
    .post('/api/sessions/me/messages')
    .set('Authorization', `Bearer ${sessionId}`)
    .send({ clientMessageId, content });
}

export function getMe(sessionId: string) {
  return api().get('/api/sessions/me').set('Authorization', `Bearer ${sessionId}`);
}

export function submitSurvey(sessionId: string, body: unknown) {
  return api()
    .post('/api/sessions/me/survey')
    .set('Authorization', `Bearer ${sessionId}`)
    .send(body);
}

/** Send the opening message plus `count - 1` further messages (default: all 10). */
export async function playInteractions(session: SessionData, count = 10): Promise<void> {
  if (count >= 1) {
    const opening = await sendMessage(session.sessionId, 'opening', session.openingMessage);
    expect(opening.status, describeResponse(opening)).toBe(200);
  }
  for (let i = 2; i <= count; i++) {
    const res = await sendMessage(session.sessionId, randomUUID(), `Participant message ${i}`);
    expect(res.status, describeResponse(res)).toBe(200);
  }
}

export async function createLockedSession(): Promise<SessionData> {
  const session = await createSession();
  await playInteractions(session, 10);
  return session;
}

export function validSurveyBody(valueFor: (index: number) => number = (i) => (i % 7) + 1) {
  return {
    responses: Array.from({ length: 16 }, (_, i) => ({
      questionId: `post-${i + 1}`,
      value: valueFor(i),
    })),
  };
}

export function admin() {
  return {
    get: (path: string) => api().get(path).set('x-admin-api-key', TEST_ADMIN_API_KEY),
  };
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
