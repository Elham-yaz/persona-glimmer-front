import { retry } from '@/utils/retry';
import type {
  AdminDashboardData,
  AdminExportType,
  AdminMessage,
  AdminMessagesQuery,
  AdminSession,
  AdminSessionDetail,
  AdminSessionsQuery,
  AdminSurveyResponse,
  AdminSurveysQuery,
  CreateSessionRequest,
  SendMessageRequest,
  SendMessageResult,
  SessionState,
  SurveyResponse,
  SurveySubmitResult,
} from '@/types';

// Study 2 API client — implements docs/STUDY2_API.md.
//
// Participant calls authenticate with the anonymous session id
// (`Authorization: Bearer <sessionId>`), admin calls with `x-admin-api-key`.
// There is no JWT / login anywhere in v2.

export const API_BASE_URL: string = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Error codes the UI can branch on. Backend codes (docs/STUDY2_API.md) are
 * passed through verbatim; the remaining ones are synthesised client-side.
 */
export type ApiErrorCode =
  // backend codes
  | 'SESSION_INVALID'
  | 'SESSION_LOCKED'
  | 'SESSION_COMPLETED'
  | 'SESSION_NOT_LOCKED'
  | 'AGENT_UNAVAILABLE'
  | 'VALIDATION_ERROR'
  // client-side codes
  | 'ADMIN_UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'SERVICE_UNAVAILABLE'
  | 'NOT_FOUND'
  | 'SERVER_ERROR'
  | 'HTTP_ERROR'
  | 'UNKNOWN';

export class ApiError extends Error {
  readonly code: ApiErrorCode | string;
  readonly status: number;

  constructor(message: string, code: ApiErrorCode | string, status = 0) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function hasErrorCode(error: unknown, code: ApiErrorCode): boolean {
  return isApiError(error) && error.code === code;
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function storage(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null; // storage disabled (private mode, blocked cookies, ...)
  }
}

/** localStorage key holding the participant's anonymous session id. */
export const SESSION_STORAGE_KEY = 'study_session_id';

export const getSessionId = (): string | null => {
  try {
    return storage('local')?.getItem(SESSION_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
};

export const setSessionId = (sessionId: string): void => {
  try {
    storage('local')?.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // ignore — the session still works for this page load
  }
};

export const clearSessionId = (): void => {
  try {
    storage('local')?.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // ignore
  }
};

// Admin API key: entered by the researcher on the dashboard and verified
// against the backend before being stored for the browser session — never
// shipped in the bundle. sessionStorage is cleared when the tab closes.
const ADMIN_KEY_STORAGE = 'admin_api_key';

export const getAdminKey = (): string | null => {
  try {
    return storage('session')?.getItem(ADMIN_KEY_STORAGE) ?? null;
  } catch {
    return null;
  }
};

export const setAdminKey = (key: string): void => {
  try {
    storage('session')?.setItem(ADMIN_KEY_STORAGE, key);
  } catch {
    // ignore
  }
};

export const clearAdminKey = (): void => {
  try {
    storage('session')?.removeItem(ADMIN_KEY_STORAGE);
  } catch {
    // ignore
  }
};

const adminHeaders = (): Record<string, string> => {
  const key = getAdminKey();
  return key ? { 'x-admin-api-key': key } : {};
};

/** Idempotency key for a participant message (docs/STUDY2_API.md §1). */
export function createClientMessageId(): string {
  const c = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  // Fallback for environments without randomUUID (older browsers / jsdom).
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// Backend health (Render free-tier cold starts)
// ---------------------------------------------------------------------------

async function checkBackendHealth(timeoutMs = 10000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${API_BASE_URL}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBackend(maxWaitMs = 30000, checkIntervalMs = 2000): Promise<boolean> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    if (await checkBackendHealth(5000)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
  }
  return false;
}

export const healthCheck = checkBackendHealth;
export const waitForBackendReady = waitForBackend;

// ---------------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------------

interface ApiEnvelopeOk<T> {
  success: true;
  data: T;
}

interface ApiEnvelopeErr {
  success: false;
  error?: { message?: string; code?: string };
}

type ApiEnvelope<T> = ApiEnvelopeOk<T> | ApiEnvelopeErr;

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  headers?: Record<string, string>;
  /** Which credential to attach. */
  auth?: 'session' | 'admin' | 'none';
  /** Poll /health first so a Render cold start doesn't surface as a failure. */
  coldStartWait?: boolean;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /**
   * Whether a per-attempt timeout (AbortError) is retried automatically.
   * Defaults to true. Message sends turn this off: a hung transport is the one
   * case where more long attempts are least likely to help, and the idempotent
   * clientMessageId makes the participant's manual "Try again" safe.
   */
  retryOnTimeout?: boolean;
}

/** Thrown inside the retry loop for gateway errors that carry no API envelope. */
class GatewayError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`Server error ${status}: Service may be starting up`);
    this.name = 'GatewayError';
    this.status = status;
  }
}

async function readEnvelopeError(response: Response): Promise<{ message?: string; code?: string } | null> {
  let text = '';
  try {
    text = await response.text();
  } catch {
    return null;
  }
  if (!text) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      const err = (parsed as ApiEnvelopeErr).error;
      if (err && typeof err === 'object') {
        return { message: err.message, code: err.code };
      }
    }
    return null;
  } catch {
    return null;
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function isRetryableTransportError(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  if (error instanceof GatewayError) return true;
  if (error instanceof Error) {
    if (isAbortError(error)) return true;
    if (error.name === 'TypeError' && /fetch/i.test(error.message)) return true;
    if (/CORS|Failed to fetch|NetworkError|Load failed/i.test(error.message)) return true;
  }
  return false;
}

function codeForStatus(status: number): ApiErrorCode {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 404) return 'NOT_FOUND';
  if (status === 429) return 'RATE_LIMITED';
  if (status >= 500) return 'SERVER_ERROR';
  return 'HTTP_ERROR';
}

async function apiRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = 'none',
    coldStartWait = false,
    timeoutMs = 30000,
    retryOnTimeout = true,
  } = options;

  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (auth === 'session') {
    const sessionId = getSessionId();
    if (!sessionId) {
      throw new ApiError('No study session found. Please start the study again.', 'SESSION_INVALID', 401);
    }
    headers['Authorization'] = `Bearer ${sessionId}`;
  } else if (auth === 'admin') {
    Object.assign(headers, adminHeaders());
  }

  if (coldStartWait) {
    const healthy = await checkBackendHealth(5000);
    if (!healthy) {
      const available = await waitForBackend(30000, 2000);
      if (!available) {
        throw new ApiError(
          'The service is temporarily unavailable. It may be starting up — please try again in a few moments.',
          'SERVICE_UNAVAILABLE',
          503
        );
      }
    }
  }

  const url = `${API_BASE_URL}${endpoint}`;
  if (import.meta.env.DEV && !import.meta.env.TEST) {
    console.log('API Request:', method, endpoint);
  }

  let response: Response;
  try {
    response = await retry(
      async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const res = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            signal: controller.signal,
          });

          if (res.status === 502 || res.status === 503 || res.status === 504) {
            // A 502 carrying an API envelope (e.g. AGENT_UNAVAILABLE) is a real
            // answer from the backend and must NOT be retried automatically —
            // the participant retries manually. A bare gateway error (Render
            // proxy, no JSON body) is a cold start and is retried.
            const envelopeError = await readEnvelopeError(res);
            if (envelopeError?.code) {
              throw new ApiError(
                envelopeError.message || 'The service is temporarily unavailable. Please try again.',
                envelopeError.code,
                res.status
              );
            }
            throw new GatewayError(res.status);
          }
          return res;
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        maxRetries: 5,
        delay: 2000,
        backoff: true,
        retryable: (error) => (retryOnTimeout || !isAbortError(error)) && isRetryableTransportError(error),
      }
    );
  } catch (error: unknown) {
    if (error instanceof ApiError) throw error;
    if (error instanceof GatewayError) {
      throw new ApiError(
        'The service is temporarily unavailable. It may be starting up — please wait a moment and try again.',
        'SERVICE_UNAVAILABLE',
        error.status
      );
    }
    if (isAbortError(error)) {
      throw new ApiError(
        'The request timed out. The service may be taking longer than usual — please try again.',
        'TIMEOUT'
      );
    }
    if (isRetryableTransportError(error)) {
      throw new ApiError(
        'Unable to connect to the server. Please check your connection and try again.',
        'NETWORK_ERROR'
      );
    }
    throw new ApiError(getErrorMessage(error), 'UNKNOWN');
  }

  if (!response.ok) {
    const envelopeError = await readEnvelopeError(response);

    if (response.status === 401) {
      if (auth === 'session') {
        // The stored session id is unknown to the backend — forget it so the
        // participant can start cleanly instead of being stuck.
        clearSessionId();
        throw new ApiError(
          'Your study session could not be found. Please return to the study link and begin again.',
          'SESSION_INVALID',
          401
        );
      }
      if (endpoint.startsWith('/api/admin')) {
        if (auth === 'admin') clearAdminKey();
        throw new ApiError('Invalid admin key. Please enter the admin API key again.', 'ADMIN_UNAUTHORIZED', 401);
      }
      throw new ApiError(envelopeError?.message || 'Unauthorized.', envelopeError?.code || 'HTTP_ERROR', 401);
    }

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const message = retryAfter
        ? `Too many requests. Please wait ${retryAfter} seconds before trying again.`
        : 'Too many requests. Please wait a moment before trying again.';
      throw new ApiError(message, 'RATE_LIMITED', 429);
    }

    const code = envelopeError?.code || codeForStatus(response.status);
    let message = envelopeError?.message;
    if (!message) {
      if (response.status === 404) message = 'The requested resource was not found.';
      else if (response.status >= 500) message = 'Server error. Please try again in a moment.';
      else message = `An error occurred (${response.status}). Please try again.`;
    }
    throw new ApiError(message, code, response.status);
  }

  let json: ApiEnvelope<T>;
  try {
    json = (await response.json()) as ApiEnvelope<T>;
  } catch {
    throw new ApiError('The server returned an unexpected response.', 'UNKNOWN', response.status);
  }
  if (!json || json.success !== true) {
    const err = (json as ApiEnvelopeErr | null)?.error;
    throw new ApiError(err?.message || 'Request failed.', err?.code || 'UNKNOWN', response.status);
  }
  return json.data;
}

function buildQuery(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.append(key, String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ---------------------------------------------------------------------------
// Participant session API (docs/STUDY2_API.md §1)
// ---------------------------------------------------------------------------

export const sessionApi = {
  /** POST /api/sessions — creates the anonymous session and stores its id. */
  create: async (request: CreateSessionRequest = {}): Promise<SessionState> => {
    const payload: CreateSessionRequest = {};
    if (request.externalId) payload.externalId = request.externalId.slice(0, 100);
    if (request.force) payload.force = request.force;
    const data = await apiRequest<SessionState>('/api/sessions', {
      method: 'POST',
      body: payload,
      auth: 'none',
      coldStartWait: true,
    });
    setSessionId(data.sessionId);
    return data;
  },

  /** GET /api/sessions/me — full state for resume. */
  get: async (): Promise<SessionState> => {
    return apiRequest<SessionState>('/api/sessions/me', {
      auth: 'session',
      coldStartWait: true,
    });
  },

  /**
   * POST /api/sessions/me/messages — idempotent on clientMessageId.
   *
   * The backend gives OpenAI 30 s and answers AGENT_UNAVAILABLE (not retried)
   * on failure, so a client-side timeout only fires when the transport itself
   * is stuck. That single attempt is surfaced as TIMEOUT so the participant
   * gets the inline "Try again" (same clientMessageId) instead of waiting
   * through five more long attempts. Bare 502/503/504 cold-start responses are
   * still retried with backoff.
   */
  sendMessage: async (request: SendMessageRequest): Promise<SendMessageResult> => {
    return apiRequest<SendMessageResult>('/api/sessions/me/messages', {
      method: 'POST',
      body: { clientMessageId: request.clientMessageId, content: request.content },
      auth: 'session',
      timeoutMs: 45000, // server-side OpenAI timeout (30 s) plus margin
      retryOnTimeout: false,
    });
  },

  /** POST /api/sessions/me/survey — idempotent; returns the completion code. */
  submitSurvey: async (responses: SurveyResponse[]): Promise<SurveySubmitResult> => {
    return apiRequest<SurveySubmitResult>('/api/sessions/me/survey', {
      method: 'POST',
      body: { responses },
      auth: 'session',
    });
  },
};

// ---------------------------------------------------------------------------
// Admin API (docs/STUDY2_API.md §2)
// ---------------------------------------------------------------------------

export const adminApi = {
  verifyKey: async (key: string): Promise<{ ok: boolean }> => {
    return apiRequest<{ ok: boolean }>('/api/admin/verify', {
      auth: 'none',
      headers: { 'x-admin-api-key': key },
      coldStartWait: true,
    });
  },

  getDashboard: async (): Promise<AdminDashboardData> => {
    return apiRequest<AdminDashboardData>('/api/admin/dashboard', {
      auth: 'admin',
      coldStartWait: true,
    });
  },

  getSessions: async (query: AdminSessionsQuery = {}): Promise<{ sessions: AdminSession[]; total: number }> => {
    return apiRequest(`/api/admin/sessions${buildQuery({ ...query })}`, { auth: 'admin' });
  },

  getSession: async (id: string): Promise<AdminSessionDetail> => {
    return apiRequest<AdminSessionDetail>(`/api/admin/sessions/${encodeURIComponent(id)}`, { auth: 'admin' });
  },

  getMessages: async (query: AdminMessagesQuery = {}): Promise<{ messages: AdminMessage[]; total: number }> => {
    return apiRequest(`/api/admin/messages${buildQuery({ ...query })}`, { auth: 'admin' });
  },

  getSurveys: async (query: AdminSurveysQuery = {}): Promise<{ responses: AdminSurveyResponse[]; total: number }> => {
    return apiRequest(`/api/admin/surveys${buildQuery({ ...query })}`, { auth: 'admin' });
  },

  /**
   * GET /api/admin/export?type=… — the CSV is streamed by the server; the key
   * travels in a header, so the file is fetched as a blob and saved via an
   * object URL rather than a plain link.
   */
  exportCsv: async (type: AdminExportType): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/api/admin/export?type=${encodeURIComponent(type)}`, {
      method: 'GET',
      headers: adminHeaders(),
    }).catch(() => {
      throw new ApiError('Unable to connect to the server. Please try again.', 'NETWORK_ERROR');
    });

    if (!response.ok) {
      if (response.status === 401) {
        clearAdminKey();
        throw new ApiError('Invalid admin key. Please enter the admin API key again.', 'ADMIN_UNAUTHORIZED', 401);
      }
      const envelopeError = await readEnvelopeError(response);
      throw new ApiError(
        envelopeError?.message || `Export failed (${response.status}).`,
        envelopeError?.code || codeForStatus(response.status),
        response.status
      );
    }

    const blob = await response.blob();
    const disposition = response.headers.get('Content-Disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    const filename = match?.[1] || `study2-${type}-${new Date().toISOString().slice(0, 10)}.csv`;

    const objectUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(objectUrl);
  },
};
