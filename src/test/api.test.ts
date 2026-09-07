import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { adminApi, sessionApi, isApiError, SESSION_STORAGE_KEY, getAdminKey, setAdminKey } from '@/lib/api';

// ---------------------------------------------------------------------------
// Retry / error classification policy of the core request helper
// (docs/STUDY2_API.md §1 — AGENT_UNAVAILABLE is a real answer and is never
// retried automatically; bare gateway errors are Render cold starts).
// ---------------------------------------------------------------------------

interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  signal: AbortSignal | null | undefined;
}

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}

const ok = (data: unknown) => response(200, { success: true, data });
const fail = (status: number, code: string, message: string, headers?: Record<string, string>) =>
  response(status, { success: false, error: { code, message } }, headers);
/** What the Render proxy returns while the instance is still starting. */
const bareGateway = (status: number) => response(status, '<html>Bad Gateway</html>', { 'content-type': 'text/html' });

/** The error the browser raises when the AbortController fires. */
function abortError(): Error {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

type Handler = (call: RecordedCall, attempt: number) => Response | Promise<Response>;

function installFetch(handler: Handler) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const call: RecordedCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.replace(/^https?:\/\/[^/]+/, ''),
      headers: Object.fromEntries(
        Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])
      ),
      signal: init?.signal,
    };
    calls.push(call);
    if (call.path === '/health') return Promise.resolve(ok({ status: 'ok' }));
    const attempt = calls.filter((c) => c.path === call.path && c.method === call.method).length;
    return Promise.resolve(handler(call, attempt));
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

/** A fetch that never answers and rejects only when the request is aborted. */
function neverAnswers(call: RecordedCall): Promise<Response> {
  return new Promise((_, reject) => {
    call.signal?.addEventListener('abort', () => reject(abortError()));
  });
}

const SESSION_ID = '11111111-2222-4333-8444-555555555555';
const SEND = { clientMessageId: 'cmid-1', content: 'Hello' };
const sendResult = ok({
  userMessage: { id: 'u1', sequence: 1, role: 'user', content: 'Hello', createdAt: new Date().toISOString() },
  agentMessage: { id: 'a1', sequence: 2, role: 'agent', content: 'Hi', createdAt: new Date().toISOString() },
  interactionCount: 1,
  isLocked: false,
  shouldShowSurvey: false,
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('apiRequest retry policy', () => {
  it('retries a bare 502/503/504 (cold start) with backoff and then succeeds', async () => {
    vi.useFakeTimers();
    const { fetchMock } = installFetch((_call, attempt) => (attempt === 1 ? bareGateway(503) : sendResult));

    const pending = sessionApi.sendMessage(SEND);

    // First attempt fails immediately; the retry waits 2 s before the second attempt.
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const result = await pending;
    expect(result.interactionCount).toBe(1);
    expect(vi.getTimerCount()).toBe(0); // per-attempt abort timers were cleared
  });

  it('surfaces an enveloped 502 (AGENT_UNAVAILABLE) immediately without retrying', async () => {
    const { fetchMock } = installFetch(() =>
      fail(502, 'AGENT_UNAVAILABLE', 'The agent is temporarily unavailable. Please try sending your message again.')
    );

    const error = await sessionApi.sendMessage(SEND).catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    if (!isApiError(error)) throw error;
    expect(error.code).toBe('AGENT_UNAVAILABLE');
    expect(error.status).toBe(502);
    expect(error.message).toMatch(/temporarily unavailable/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The session is still valid — nothing was persisted, the participant retries manually.
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(SESSION_ID);
  });

  it('a message send that hangs times out after one 45 s attempt and is NOT retried automatically', async () => {
    vi.useFakeTimers();
    const { fetchMock } = installFetch((call) => neverAnswers(call));

    const pending = sessionApi.sendMessage(SEND);
    const assertion = expect(pending).rejects.toMatchObject({ name: 'ApiError', code: 'TIMEOUT' });

    await vi.advanceTimersByTimeAsync(44_999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(calls(fetchMock)[0].signal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await assertion;

    // No second attempt, even after the backoff window the other requests would use.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('other requests still retry a per-attempt timeout (30 s + 2 s backoff)', async () => {
    vi.useFakeTimers();
    const { fetchMock } = installFetch((call, attempt) =>
      attempt === 1 ? neverAnswers(call) : ok({ sessions: [], total: 0 })
    );
    setAdminKey('secret-key');

    const pending = adminApi.getSessions({ limit: 10 });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await expect(pending).resolves.toEqual({ sessions: [], total: 0 });
  });

  it('a 401 on a participant call clears the stored session id and reports SESSION_INVALID', async () => {
    const { calls: recorded } = installFetch(() => fail(401, 'SESSION_INVALID', 'Unknown session'));

    const error = await sessionApi.get().catch((e: unknown) => e);

    expect(isApiError(error)).toBe(true);
    if (!isApiError(error)) throw error;
    expect(error.code).toBe('SESSION_INVALID');
    expect(error.status).toBe(401);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
    const me = recorded.find((c) => c.path === '/api/sessions/me');
    expect(me?.headers.authorization).toBe(`Bearer ${SESSION_ID}`);
  });

  it('refuses a participant call outright when no session id is stored', async () => {
    localStorage.clear();
    const { fetchMock } = installFetch(() => sendResult);

    const error = await sessionApi.sendMessage(SEND).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe('SESSION_INVALID');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a 401 on an admin call clears the stored key and reports ADMIN_UNAUTHORIZED', async () => {
    setAdminKey('stale-key');
    const { calls: recorded } = installFetch(() => fail(401, 'UNAUTHORIZED', 'Invalid admin key'));

    const error = await adminApi.getDashboard().catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe('ADMIN_UNAUTHORIZED');
    expect(getAdminKey()).toBeNull();
    const dashboard = recorded.find((c) => c.path === '/api/admin/dashboard');
    expect(dashboard?.headers['x-admin-api-key']).toBe('stale-key');
  });

  it('maps 429 to RATE_LIMITED and quotes Retry-After', async () => {
    const { fetchMock } = installFetch(() =>
      fail(429, 'RATE_LIMITED', 'Too many requests', { 'Retry-After': '30' })
    );

    const error = await sessionApi.sendMessage(SEND).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe('RATE_LIMITED');
    expect(isApiError(error) && error.message).toMatch(/30 seconds/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('passes backend error codes through verbatim (409 SESSION_LOCKED)', async () => {
    installFetch(() => fail(409, 'SESSION_LOCKED', 'Session is locked'));

    const error = await sessionApi.sendMessage(SEND).catch((e: unknown) => e);

    expect(isApiError(error) && error.code).toBe('SESSION_LOCKED');
    expect(isApiError(error) && error.status).toBe(409);
  });
});

function calls(fetchMock: ReturnType<typeof vi.fn>): RecordedCall[] {
  return fetchMock.mock.calls.map(([input, init]: [RequestInfo | URL, RequestInit | undefined]) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    return {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: url.replace(/^https?:\/\/[^/]+/, ''),
      headers: (init?.headers as Record<string, string>) ?? {},
      signal: init?.signal,
    };
  });
}
