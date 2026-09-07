import { StrictMode } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import Study from '@/pages/Study';
import { SESSION_STORAGE_KEY } from '@/lib/api';
import type { ChatMessage, SessionState } from '@/types';

// ---------------------------------------------------------------------------
// Fake backend implementing docs/STUDY2_API.md over a mocked global fetch
// ---------------------------------------------------------------------------

interface FakeResponseInit {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}

function fakeResponse({ status, body, headers = {} }: FakeResponseInit): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headerMap = new Map(Object.entries({ 'content-type': 'application/json', ...headers }).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    text: async () => text,
    json: async () => JSON.parse(text),
  } as unknown as Response;
}

const ok = (data: unknown, status = 200) => fakeResponse({ status, body: { success: true, data } });
const fail = (status: number, code: string, message: string) =>
  fakeResponse({ status, body: { success: false, error: { code, message } } });

interface RecordedCall {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown> | null;
}

type Handler = (call: RecordedCall) => Response | Promise<Response>;

function installFetch(handler: Handler) {
  const calls: RecordedCall[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    );
    const call: RecordedCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path,
      headers,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    calls.push(call);
    if (path === '/health') return ok({ status: 'ok' });
    return handler(call);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

const SESSION_ID = '11111111-2222-4333-8444-555555555555';
const SCENARIO = 'You ordered dinner and one item is missing from the bag.';

function makeSession(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: SESSION_ID,
    agent: { displayName: 'Alex' },
    context: {
      id: 1,
      code: 'food_utilitarian',
      title: 'Missing Food Item',
      scenarioType: 'utilitarian',
      participantScenario: SCENARIO,
    },
    openingMessage: SCENARIO,
    maxInteractions: 10,
    interactionCount: 0,
    isLocked: false,
    surveyCompleted: false,
    completionCode: null,
    messages: [],
    ...overrides,
  };
}

function msg(sequence: number, role: 'user' | 'agent', content: string): ChatMessage {
  return { id: `m-${sequence}`, sequence, role, content, createdAt: new Date().toISOString() };
}

function transcript(pairs: number): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (let i = 0; i < pairs; i++) {
    out.push(msg(i * 2 + 1, 'user', `user message ${i + 1}`));
    out.push(msg(i * 2 + 2, 'agent', `agent reply ${i + 1}`));
  }
  return out;
}

const messagesCalls = (calls: RecordedCall[]) =>
  calls.filter((c) => c.method === 'POST' && c.path === '/api/sessions/me/messages');
const meCalls = (calls: RecordedCall[]) => calls.filter((c) => c.method === 'GET' && c.path === '/api/sessions/me');

/** What fetch rejects with when the per-attempt AbortController fires. */
function abortError(): Error {
  const err = new Error('The operation was aborted.');
  err.name = 'AbortError';
  return err;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('Study flow', () => {
  it('renders the landing page, Begin creates a session and the opening message is auto-sent exactly once', async () => {
    let sequence = 0;
    const { calls } = installFetch((call) => {
      if (call.method === 'POST' && call.path === '/api/sessions') {
        return ok(makeSession(), 201);
      }
      if (call.method === 'POST' && call.path === '/api/sessions/me/messages') {
        const userMessage = msg(++sequence, 'user', String(call.body?.content));
        const agentMessage = msg(++sequence, 'agent', 'I am sorry to hear that — let me look into it.');
        return ok({ userMessage, agentMessage, interactionCount: 1, isLocked: false, shouldShowSurvey: false });
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(
      <StrictMode>
        <Study />
      </StrictMode>
    );

    const begin = await screen.findByRole('button', { name: 'Begin' });
    expect(screen.getByText('Customer Service Conversation Study')).toBeInTheDocument();
    fireEvent.click(begin);

    await screen.findByText('I am sorry to hear that — let me look into it.');

    // Session created and stored
    expect(calls.filter((c) => c.method === 'POST' && c.path === '/api/sessions')).toHaveLength(1);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(SESSION_ID);

    // Opening auto-sent exactly once with the deterministic id and the session bearer
    const sends = messagesCalls(calls);
    expect(sends).toHaveLength(1);
    expect(sends[0].body).toEqual({ clientMessageId: 'opening', content: SCENARIO });
    expect(sends[0].headers.authorization).toBe(`Bearer ${SESSION_ID}`);

    // Counter comes from the API and the scenario card is shown
    expect(screen.getByTestId('interaction-counter')).toHaveTextContent('1 / 10');
    expect(screen.getByTestId('scenario-panel')).toHaveTextContent(SCENARIO);
    expect(screen.getAllByText('Alex').length).toBeGreaterThan(0);

    // Nothing about the manipulation leaks to the participant
    expect(document.body.textContent).not.toMatch(/hiEI|loEI|hiCI|loCI|food_utilitarian/);
  });

  it('forwards rid and force from the URL when creating the session', async () => {
    window.history.replaceState({}, '', '/?rid=R_abc123&force=2,3#/');
    const { calls } = installFetch((call) => {
      if (call.method === 'POST' && call.path === '/api/sessions') {
        return ok(makeSession({ isLocked: true, interactionCount: 10, messages: transcript(10) }), 201);
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);
    fireEvent.click(await screen.findByRole('button', { name: 'Begin' }));
    await screen.findByText('About your conversation');

    const create = calls.find((c) => c.method === 'POST' && c.path === '/api/sessions');
    expect(create?.body).toEqual({ externalId: 'R_abc123', force: { agentConditionId: 2, contextId: 3 } });
    window.history.replaceState({}, '', '/');
  });

  it('resumes a locked session straight into the survey; submit is disabled until all 16 answered; completion shows the code', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    const { calls } = installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        return ok(makeSession({ interactionCount: 10, isLocked: true, messages: transcript(10) }));
      }
      if (call.method === 'POST' && call.path === '/api/sessions/me/survey') {
        return ok({ completionCode: 48213, alreadyCompleted: false });
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    await screen.findByText('About your conversation');
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();

    const submit = screen.getByRole('button', { name: /Submit questionnaire/ });
    expect(submit).toBeDisabled();

    // Answer 15 of 16 → still disabled
    const neutralButtons = screen.getAllByRole('button', { name: 'Neutral' });
    expect(neutralButtons).toHaveLength(16);
    neutralButtons.slice(0, 15).forEach((b) => fireEvent.click(b));
    expect(screen.getByTestId('survey-progress')).toHaveTextContent('15 / 16 answered');
    expect(submit).toBeDisabled();

    // Answer the last one → enabled
    fireEvent.click(screen.getAllByRole('button', { name: 'Agree' })[15]);
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    const code = await screen.findByTestId('completion-code');
    expect(code).toHaveTextContent('48213');
    expect(screen.getByText(/Qualtrics/)).toBeInTheDocument();

    const surveyCall = calls.find((c) => c.method === 'POST' && c.path === '/api/sessions/me/survey');
    const responses = surveyCall?.body?.responses as Array<{ questionId: string; value: number }>;
    expect(responses).toHaveLength(16);
    expect(responses.map((r) => r.questionId)).toEqual(Array.from({ length: 16 }, (_, i) => `post-${i + 1}`));
    expect(responses.slice(0, 15).every((r) => r.value === 4)).toBe(true);
    expect(responses[15].value).toBe(6);
    // Still the same session — a refresh would resolve to the same code via GET /me
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(SESSION_ID);
  });

  it('resuming a completed session goes straight to the completion code', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    const { calls } = installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        return ok(
          makeSession({
            interactionCount: 10,
            isLocked: true,
            surveyCompleted: true,
            completionCode: 55555,
            messages: transcript(10),
          })
        );
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    expect(await screen.findByTestId('completion-code')).toHaveTextContent('55555');
    expect(screen.queryByText('About your conversation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Begin' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
    expect(messagesCalls(calls)).toHaveLength(0);
  });

  it('AGENT_UNAVAILABLE keeps the draft, shows "Try again" and the retry reuses the same clientMessageId', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    let attempt = 0;
    const { calls } = installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        return ok(makeSession({ interactionCount: 1, messages: transcript(1) }));
      }
      if (call.method === 'POST' && call.path === '/api/sessions/me/messages') {
        attempt += 1;
        if (attempt === 1) {
          return fail(502, 'AGENT_UNAVAILABLE', 'The agent is temporarily unavailable. Please try sending your message again.');
        }
        return ok({
          userMessage: msg(3, 'user', String(call.body?.content)),
          agentMessage: msg(4, 'agent', 'Thanks for your patience — here is what I can do.'),
          interactionCount: 2,
          isLocked: false,
          shouldShowSurvey: false,
        });
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    const input = (await screen.findByLabelText('Your message')) as HTMLTextAreaElement;
    expect(input).toBeEnabled();
    fireEvent.change(input, { target: { value: 'Where is my order?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    // Error surfaced inline, draft preserved, no automatic retry of the 502 envelope
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The agent is temporarily unavailable');
    expect(messagesCalls(calls)).toHaveLength(1);
    expect((screen.getByLabelText('Your message') as HTMLTextAreaElement).value).toBe('Where is my order?');

    fireEvent.click(within(alert).getByRole('button', { name: /Try again/ }));

    await screen.findByText('Thanks for your patience — here is what I can do.');
    const sends = messagesCalls(calls);
    expect(sends).toHaveLength(2);
    expect(sends[0].body?.clientMessageId).toBe(sends[1].body?.clientMessageId);
    expect(sends[0].body?.clientMessageId).not.toBe('opening');
    expect(sends[1].body?.content).toBe('Where is my order?');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect((screen.getByLabelText('Your message') as HTMLTextAreaElement).value).toBe('');
    expect(screen.getByTestId('interaction-counter')).toHaveTextContent('2 / 10');
  });

  it('a stale stored session (401 SESSION_INVALID) is cleared and the landing page is shown', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, 'stale-session');
    installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        return fail(401, 'SESSION_INVALID', 'Unknown session');
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    await screen.findByRole('button', { name: 'Begin' });
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('after the final interaction the chat locks and leads to the survey', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        return ok(makeSession({ interactionCount: 9, messages: transcript(9) }));
      }
      if (call.method === 'POST' && call.path === '/api/sessions/me/messages') {
        return ok({
          userMessage: msg(19, 'user', String(call.body?.content)),
          agentMessage: msg(20, 'agent', 'Final reply.'),
          interactionCount: 10,
          isLocked: true,
          shouldShowSurvey: true,
        });
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    const input = await screen.findByLabelText('Your message');
    fireEvent.change(input, { target: { value: 'Thanks, bye.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await screen.findByText('Final reply.');
    expect(screen.getByTestId('interaction-counter')).toHaveTextContent('10 / 10');
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Continue to the questionnaire/ }));
    await screen.findByText('About your conversation');
    await waitFor(() => expect(screen.getByRole('button', { name: /Submit questionnaire/ })).toBeDisabled());
  });

  it('a 409 SESSION_LOCKED on send re-syncs from GET /me and shows the survey', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    let meRequests = 0;
    const { calls } = installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        meRequests += 1;
        // Local state (9 interactions) is stale: another tab already sent the 10th.
        return meRequests === 1
          ? ok(makeSession({ interactionCount: 9, messages: transcript(9) }))
          : ok(makeSession({ interactionCount: 10, isLocked: true, messages: transcript(10) }));
      }
      if (call.method === 'POST' && call.path === '/api/sessions/me/messages') {
        return fail(409, 'SESSION_LOCKED', 'This session has reached the maximum number of interactions.');
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    const input = await screen.findByLabelText('Your message');
    expect(screen.getByTestId('interaction-counter')).toHaveTextContent('9 / 10');
    fireEvent.change(input, { target: { value: 'One more thing…' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await screen.findByText('About your conversation');
    expect(messagesCalls(calls)).toHaveLength(1);
    expect(meCalls(calls)).toHaveLength(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Your message')).not.toBeInTheDocument();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBe(SESSION_ID);
  });

  it('a 409 SESSION_COMPLETED on send re-syncs from GET /me and shows the completion code', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    let meRequests = 0;
    const { calls } = installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        meRequests += 1;
        return meRequests === 1
          ? ok(makeSession({ interactionCount: 4, messages: transcript(4) }))
          : ok(
              makeSession({
                interactionCount: 10,
                isLocked: true,
                surveyCompleted: true,
                completionCode: 73105,
                messages: transcript(10),
              })
            );
      }
      if (call.method === 'POST' && call.path === '/api/sessions/me/messages') {
        return fail(409, 'SESSION_COMPLETED', 'This session has already been completed.');
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    fireEvent.change(await screen.findByLabelText('Your message'), { target: { value: 'Hello?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByTestId('completion-code')).toHaveTextContent('73105');
    expect(messagesCalls(calls)).toHaveLength(1);
    expect(meCalls(calls)).toHaveLength(2);
  });

  it('a send that times out is not retried automatically; "Try again" reuses the same clientMessageId', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    let attempt = 0;
    const { calls } = installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        return ok(makeSession({ interactionCount: 1, messages: transcript(1) }));
      }
      if (call.method === 'POST' && call.path === '/api/sessions/me/messages') {
        attempt += 1;
        if (attempt === 1) throw abortError(); // the transport hung until the client-side timeout
        return ok({
          userMessage: msg(3, 'user', String(call.body?.content)),
          agentMessage: msg(4, 'agent', 'Sorry for the wait — I can help with that.'),
          interactionCount: 2,
          isLocked: false,
          shouldShowSurvey: false,
        });
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    const input = (await screen.findByLabelText('Your message')) as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'Is anyone there?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/timed out/i);
    expect(messagesCalls(calls)).toHaveLength(1); // one attempt, no automatic retry
    expect((screen.getByLabelText('Your message') as HTMLTextAreaElement).value).toBe('Is anyone there?');
    expect(screen.getByTestId('interaction-counter')).toHaveTextContent('1 / 10');

    fireEvent.click(within(alert).getByRole('button', { name: /Try again/ }));

    await screen.findByText('Sorry for the wait — I can help with that.');
    const sends = messagesCalls(calls);
    expect(sends).toHaveLength(2);
    expect(sends[1].body?.clientMessageId).toBe(sends[0].body?.clientMessageId);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('interaction-counter')).toHaveTextContent('2 / 10');
  });
});

describe('Completion screen', () => {
  it('the copy button puts the code on the clipboard and confirms', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        return ok(
          makeSession({
            interactionCount: 10,
            isLocked: true,
            surveyCompleted: true,
            completionCode: 55555,
            messages: transcript(10),
          })
        );
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    try {
      render(<Study />);

      expect(await screen.findByTestId('completion-code')).toHaveTextContent('55555');
      fireEvent.click(screen.getByRole('button', { name: /Copy code/ }));

      await screen.findByRole('button', { name: /Copied/ });
      expect(writeText).toHaveBeenCalledTimes(1);
      expect(writeText).toHaveBeenCalledWith('55555');
      expect(screen.getByText(/enter this code/)).toBeInTheDocument();
      expect(screen.getByText(/close this window/)).toBeInTheDocument();
    } finally {
      delete (navigator as unknown as Record<string, unknown>).clipboard;
    }
  });

  it('when the code is missing, "Reload code" fetches GET /me again and shows it', async () => {
    localStorage.setItem(SESSION_STORAGE_KEY, SESSION_ID);
    let meRequests = 0;
    const { calls } = installFetch((call) => {
      if (call.method === 'GET' && call.path === '/api/sessions/me') {
        meRequests += 1;
        return ok(
          makeSession({
            interactionCount: 10,
            isLocked: true,
            surveyCompleted: true,
            completionCode: meRequests === 1 ? null : 61234,
            messages: transcript(10),
          })
        );
      }
      return fail(404, 'NOT_FOUND', `unhandled ${call.method} ${call.path}`);
    });

    render(<Study />);

    const reload = await screen.findByRole('button', { name: 'Reload code' });
    expect(screen.queryByTestId('completion-code')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Copy code/ })).not.toBeInTheDocument();

    fireEvent.click(reload);

    expect(await screen.findByTestId('completion-code')).toHaveTextContent('61234');
    expect(meCalls(calls)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Reload code' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Copy code/ })).toBeInTheDocument();
  });
});
