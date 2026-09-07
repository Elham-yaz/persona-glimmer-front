import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminDashboard from '@/pages/AdminDashboard';
import { getAdminKey, setAdminKey } from '@/lib/api';
import type { AdminDashboardData, AdminSession, AdminSessionDetail } from '@/types';

// ---------------------------------------------------------------------------
// Fake admin backend implementing docs/STUDY2_API.md §2 over a mocked fetch
// ---------------------------------------------------------------------------

const ADMIN_KEY = 'secret-admin-key';

interface RecordedCall {
  method: string;
  path: string;
  pathname: string;
  query: URLSearchParams;
  headers: Record<string, string>;
}

function fakeResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const headerMap = new Map(Object.entries({ 'content-type': 'application/json', ...headers }).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headerMap.get(name.toLowerCase()) ?? null },
    text: async () => text,
    json: async () => JSON.parse(text),
    blob: async () => new Blob([text], { type: headerMap.get('content-type') ?? 'text/plain' }),
  } as unknown as Response;
}

const ok = (data: unknown) => fakeResponse(200, { success: true, data });
const fail = (status: number, code: string, message: string) =>
  fakeResponse(status, { success: false, error: { code, message } });

const AGENT_CODES: Record<number, string> = { 1: 'hiEI_hiCI', 2: 'hiEI_loCI', 3: 'loEI_hiCI', 4: 'loEI_loCI' };
const CONTEXT_CODES: Record<number, string> = { 1: 'food_utilitarian', 2: 'food_hedonic', 3: 'hotel_informational' };

function makeDashboard(): AdminDashboardData {
  const cells: AdminDashboardData['cells'] = [];
  for (const agentConditionId of [1, 2, 3, 4]) {
    for (const contextId of [1, 2, 3]) {
      cells.push({
        agentConditionId,
        agentCode: AGENT_CODES[agentConditionId],
        contextId,
        contextCode: CONTEXT_CODES[contextId],
        // distinctive numbers so a specific cell can be asserted
        started: agentConditionId * 10 + contextId,
        completed: agentConditionId,
      });
    }
  }
  return {
    totals: { sessions: 42, completed: 17, locked: 5, inProgress: 20, messages: 613, surveyResponses: 272 },
    cells,
    assignmentMode: 'balanced',
  };
}

const SESSION_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const SESSION_B = 'bbbbbbbb-2222-4222-8222-222222222222';

function makeSessions(): AdminSession[] {
  return [
    {
      id: SESSION_A,
      externalId: 'R_qualtrics_A',
      agentConditionId: 1,
      agentCode: 'hiEI_hiCI',
      contextId: 2,
      contextCode: 'food_hedonic',
      interactionCount: 10,
      isLocked: true,
      surveyCompleted: true,
      completionCode: 48213,
      model: 'gpt-4o-mini',
      promptVersion: '2.0',
      createdAt: '2026-09-06T10:00:00.000Z',
      lockedAt: '2026-09-06T10:20:00.000Z',
      completedAt: '2026-09-06T10:25:00.000Z',
    },
    {
      id: SESSION_B,
      externalId: null,
      agentConditionId: 4,
      agentCode: 'loEI_loCI',
      contextId: 3,
      contextCode: 'hotel_informational',
      interactionCount: 3,
      isLocked: false,
      surveyCompleted: false,
      completionCode: null,
      model: 'gpt-4o-mini',
      promptVersion: '2.0',
      createdAt: '2026-09-06T11:00:00.000Z',
      lockedAt: null,
      completedAt: null,
    },
  ];
}

function makeDetail(session: AdminSession): AdminSessionDetail {
  return {
    ...session,
    messages: [
      { id: 'm2', sequence: 2, role: 'agent', content: 'I am so sorry about the dessert.', isFallback: false, createdAt: session.createdAt },
      { id: 'm1', sequence: 1, role: 'user', content: 'My birthday cake arrived smashed.', isFallback: false, createdAt: session.createdAt },
    ],
    surveyResponses: session.surveyCompleted
      ? [
          { id: 'r1', questionId: 'post-1', responseValue: 6, createdAt: session.completedAt ?? session.createdAt },
          { id: 'r2', questionId: 'post-2', responseValue: 3, createdAt: session.completedAt ?? session.createdAt },
        ]
      : [],
  };
}

function statusOf(s: AdminSession): string {
  if (s.surveyCompleted) return 'completed';
  if (s.isLocked) return 'locked';
  return 'in_progress';
}

function installAdminBackend(options: { validKey?: string; dashboardStatus?: number } = {}) {
  const validKey = options.validKey ?? ADMIN_KEY;
  const calls: RecordedCall[] = [];
  const sessions = makeSessions();

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const parsed = new URL(url);
    const headers = Object.fromEntries(
      Object.entries((init?.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])
    );
    const call: RecordedCall = {
      method: (init?.method ?? 'GET').toUpperCase(),
      path: parsed.pathname + parsed.search,
      pathname: parsed.pathname,
      query: parsed.searchParams,
      headers,
    };
    calls.push(call);

    if (call.pathname === '/health') return ok({ status: 'ok' });
    if (!call.pathname.startsWith('/api/admin')) return fail(404, 'NOT_FOUND', `unhandled ${call.path}`);
    if (headers['x-admin-api-key'] !== validKey) return fail(401, 'UNAUTHORIZED', 'Invalid admin key');

    if (call.pathname === '/api/admin/verify') return ok({ ok: true });
    if (call.pathname === '/api/admin/dashboard') {
      if (options.dashboardStatus === 401) return fail(401, 'UNAUTHORIZED', 'Invalid admin key');
      return ok(makeDashboard());
    }
    if (call.pathname === '/api/admin/sessions') {
      const status = call.query.get('status');
      const filtered = status ? sessions.filter((s) => statusOf(s) === status) : sessions;
      return ok({ sessions: filtered, total: filtered.length });
    }
    const detailMatch = /^\/api\/admin\/sessions\/(.+)$/.exec(call.pathname);
    if (detailMatch) {
      const found = sessions.find((s) => s.id === decodeURIComponent(detailMatch[1]));
      return found ? ok(makeDetail(found)) : fail(404, 'NOT_FOUND', 'Session not found');
    }
    if (call.pathname === '/api/admin/messages') return ok({ messages: [], total: 0 });
    if (call.pathname === '/api/admin/surveys') return ok({ responses: [], total: 0 });
    if (call.pathname === '/api/admin/export') {
      const type = call.query.get('type');
      return fakeResponse(200, 'id,created_at\r\n', {
        'content-type': 'text/csv',
        'content-disposition': `attachment; filename="study2-${type}-2026-09-06.csv"`,
      });
    }
    return fail(404, 'NOT_FOUND', `unhandled ${call.path}`);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls, fetchMock };
}

const sessionsCalls = (calls: RecordedCall[]) => calls.filter((c) => c.pathname === '/api/admin/sessions');

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/admin']} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminDashboard />
    </MemoryRouter>
  );
}

/** Radix tab triggers activate on mousedown (not click). */
function selectTab(name: RegExp) {
  const tab = screen.getByRole('tab', { name });
  fireEvent.mouseDown(tab, { button: 0 });
  fireEvent.click(tab);
  return tab;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------

describe('AdminDashboard', () => {
  it('verifies the key, shows totals and the 4×3 grid, lists sessions, opens the detail view and exports CSV with the key header', async () => {
    const { calls } = installAdminBackend();
    const createObjectURL = vi.fn(() => 'blob:study2-export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    renderDashboard();

    // Key gate — nothing is fetched before a key is verified
    expect(screen.getByText('Admin Access')).toBeInTheDocument();
    expect(calls.filter((c) => c.pathname.startsWith('/api/admin'))).toHaveLength(0);

    fireEvent.change(screen.getByPlaceholderText('Admin API key'), { target: { value: ADMIN_KEY } });
    fireEvent.click(screen.getByRole('button', { name: 'Access Dashboard' }));

    await screen.findByRole('heading', { name: 'Admin Dashboard' });
    const verify = calls.find((c) => c.pathname === '/api/admin/verify');
    expect(verify?.headers['x-admin-api-key']).toBe(ADMIN_KEY);
    expect(getAdminKey()).toBe(ADMIN_KEY);
    // Every data call carries the key header
    for (const c of calls.filter((c) => c.pathname.startsWith('/api/admin/') && c.pathname !== '/api/admin/verify')) {
      expect(c.headers['x-admin-api-key']).toBe(ADMIN_KEY);
    }

    // Totals + assignment mode
    expect(screen.getByText(/assignment: balanced/)).toBeInTheDocument();
    const statValue = (title: string) => within(screen.getByText(title).closest('[class*="rounded"]') as HTMLElement).getByText(/^\d+$/);
    expect(statValue('In progress')).toHaveTextContent('20');
    expect(statValue('Locked')).toHaveTextContent('5');
    expect(statValue('Completed')).toHaveTextContent('17');
    expect(statValue('Survey responses')).toHaveTextContent('272');

    // 4 × 3 cell grid: each row is an agent condition, each column a context
    for (const ctx of Object.values(CONTEXT_CODES)) {
      expect(screen.getByRole('columnheader', { name: ctx })).toBeInTheDocument();
    }
    const row3 = screen.getByText('3 · loEI_hiCI').closest('tr') as HTMLElement;
    const row3Cells = within(row3).getAllByRole('cell');
    expect(row3Cells).toHaveLength(5); // label + 3 contexts + row total
    expect(row3Cells[1]).toHaveTextContent('31 / 3');
    expect(row3Cells[2]).toHaveTextContent('32 / 3');
    expect(row3Cells[3]).toHaveTextContent('33 / 3');
    expect(row3Cells[4]).toHaveTextContent('96 / 9');
    expect(screen.getAllByRole('tab')).toHaveLength(4);

    // Sessions tab (count comes from the API total)
    selectTab(/^Sessions \(2\)$/);
    const rowA = (await screen.findByText('R_qualtrics_A')).closest('tr') as HTMLElement;
    expect(rowA).toHaveTextContent('hiEI_hiCI');
    expect(rowA).toHaveTextContent('food_hedonic');
    expect(rowA).toHaveTextContent('Completed');
    expect(rowA).toHaveTextContent('48213');
    expect(rowA).toHaveTextContent('gpt-4o-mini · v2.0');
    const rowB = screen.getByText('hotel_informational').closest('tr') as HTMLElement;
    expect(rowB).toHaveTextContent('In progress');

    // Detail view: transcript in sequence order + survey responses + code
    fireEvent.click(within(rowA).getByRole('button', { name: 'View' }));
    const dialog = await screen.findByRole('dialog');
    await within(dialog).findByText(SESSION_A);
    expect(calls.find((c) => c.pathname === `/api/admin/sessions/${SESSION_A}`)).toBeTruthy();
    expect(within(dialog).getByText('Transcript (2)')).toBeInTheDocument();
    const transcript = within(dialog).getByText('Transcript (2)').nextElementSibling as HTMLElement;
    expect(transcript.textContent?.indexOf('My birthday cake arrived smashed.')).toBeLessThan(
      transcript.textContent?.indexOf('I am so sorry about the dessert.') ?? -1
    );
    expect(within(dialog).getByText('Survey responses (2)')).toBeInTheDocument();
    expect(within(dialog).getByText('post-1').closest('tr')).toHaveTextContent('6');
    expect(within(dialog).getByText('48213')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    // Export: fetched with the key header (not a plain link) and saved via a blob URL
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    const exportCall = calls.find((c) => c.pathname === '/api/admin/export');
    expect(exportCall?.query.get('type')).toBe('sessions');
    expect(exportCall?.headers['x-admin-api-key']).toBe(ADMIN_KEY);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:study2-export');

    // Nothing about participants' identity is shown anywhere
    expect(document.body.textContent).not.toMatch(/@|password|email/i);
  });

  it('Refresh reloads the sessions tab with the filters currently selected and keeps that tab active', async () => {
    setAdminKey(ADMIN_KEY);
    const { calls } = installAdminBackend();

    renderDashboard();
    await screen.findByRole('heading', { name: 'Admin Dashboard' });
    expect(sessionsCalls(calls)).toHaveLength(1);
    expect(sessionsCalls(calls)[0].query.get('status')).toBeNull();

    selectTab(/^Sessions/);
    await screen.findByText('R_qualtrics_A');

    // Pick a status filter — the list narrows to the one completed session
    fireEvent.change(screen.getByLabelText('Filter by status'), { target: { value: 'completed' } });
    await waitFor(() => expect(sessionsCalls(calls)).toHaveLength(2));
    expect(sessionsCalls(calls)[1].query.get('status')).toBe('completed');
    await waitFor(() => expect(screen.getByRole('tab', { name: /^Sessions \(1\)$/ })).toBeInTheDocument());
    expect(screen.queryByText('hotel_informational')).not.toBeInTheDocument();

    // Refresh must re-fetch with the SAME filters, not the initial empty ones
    fireEvent.click(screen.getByRole('button', { name: /Refresh/ }));
    await waitFor(() => expect(sessionsCalls(calls)).toHaveLength(3));
    expect(sessionsCalls(calls)[2].query.get('status')).toBe('completed');
    expect(sessionsCalls(calls)[2].query.get('offset')).toBe('0');

    await screen.findByRole('heading', { name: 'Admin Dashboard' });
    await screen.findByText('R_qualtrics_A');
    expect(screen.getByRole('tab', { name: /^Sessions \(1\)$/ })).toHaveAttribute('aria-selected', 'true');
    expect((screen.getByLabelText('Filter by status') as HTMLSelectElement).value).toBe('completed');
    expect(screen.queryByText('hotel_informational')).not.toBeInTheDocument();
  });

  it('a rejected key stays on the gate and stores nothing', async () => {
    const { calls } = installAdminBackend({ validKey: 'the-real-key' });

    renderDashboard();
    fireEvent.change(screen.getByPlaceholderText('Admin API key'), { target: { value: 'wrong-key' } });
    fireEvent.click(screen.getByRole('button', { name: 'Access Dashboard' }));

    await waitFor(() => expect(calls.find((c) => c.pathname === '/api/admin/verify')).toBeTruthy());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Access Dashboard' })).toBeEnabled());
    expect(screen.getByText('Admin Access')).toBeInTheDocument();
    expect(getAdminKey()).toBeNull();
    expect(calls.find((c) => c.pathname === '/api/admin/dashboard')).toBeUndefined();
  });

  it('a stored key that the backend no longer accepts sends the researcher back to the gate', async () => {
    setAdminKey('revoked-key');
    installAdminBackend({ validKey: ADMIN_KEY });

    renderDashboard();

    await screen.findByText('Admin Access');
    expect(getAdminKey()).toBeNull();
  });
});
