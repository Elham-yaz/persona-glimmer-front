import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pool, { closePool } from '../src/config/database';
import { TEST_ADMIN_API_KEY } from './test-env';
import {
  admin,
  api,
  closeServer,
  createLockedSession,
  createSession,
  describeResponse,
  playInteractions,
  sendMessage,
  startServer,
  submitSurvey,
  validSurveyBody,
} from './helpers';

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await closeServer();
  await closePool();
});

const ADMIN_PATHS = [
  '/api/admin/verify',
  '/api/admin/dashboard',
  '/api/admin/sessions',
  '/api/admin/messages',
  '/api/admin/surveys',
  '/api/admin/export?type=sessions',
];

describe('admin authentication', () => {
  it('returns 401 without a key or with a wrong key', async () => {
    for (const path of ADMIN_PATHS) {
      const noKey = await api().get(path);
      expect(noKey.status, `${path}: ${describeResponse(noKey)}`).toBe(401);
      expect(noKey.body.error.code).toBe('ADMIN_UNAUTHORIZED');

      const wrongKey = await api().get(path).set('x-admin-api-key', 'nope');
      expect(wrongKey.status, path).toBe(401);
    }
  });

  it('returns 200 with the configured key', async () => {
    for (const path of ADMIN_PATHS) {
      const res = await api().get(path).set('x-admin-api-key', TEST_ADMIN_API_KEY);
      expect(res.status, `${path}: ${describeResponse(res)}`).toBe(200);
    }
    const verify = await admin().get('/api/admin/verify');
    expect(verify.body).toEqual({ success: true, data: { ok: true } });
  });

  it('fails closed when ADMIN_API_KEY is not configured', async () => {
    const saved = process.env.ADMIN_API_KEY;
    delete process.env.ADMIN_API_KEY;
    try {
      const res = await api().get('/api/admin/verify').set('x-admin-api-key', TEST_ADMIN_API_KEY);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ADMIN_NOT_CONFIGURED');
    } finally {
      process.env.ADMIN_API_KEY = saved;
    }
  });
});

describe('admin data endpoints', () => {
  it('dashboard returns totals, 12 cells and the assignment mode', async () => {
    const completed = await createLockedSession();
    await submitSurvey(completed.sessionId, validSurveyBody());
    const locked = await createLockedSession();
    const inProgress = await createSession();
    await playInteractions(inProgress, 2);

    const res = await admin().get('/api/admin/dashboard');
    expect(res.status).toBe(200);
    const { totals, cells, assignmentMode } = res.body.data;
    expect(Object.keys(totals).sort()).toEqual(
      ['completed', 'inProgress', 'locked', 'messages', 'sessions', 'surveyResponses'].sort()
    );
    expect(totals.sessions).toBe(totals.completed + totals.locked + totals.inProgress);
    expect(totals.completed).toBeGreaterThanOrEqual(1);
    expect(totals.locked).toBeGreaterThanOrEqual(1);
    expect(totals.inProgress).toBeGreaterThanOrEqual(1);
    expect(totals.surveyResponses % 16).toBe(0);
    expect(cells).toHaveLength(12);
    expect(Object.keys(cells[0]).sort()).toEqual(
      ['agentCode', 'agentConditionId', 'completed', 'contextCode', 'contextId', 'started'].sort()
    );
    expect(cells.reduce((s: number, c: any) => s + c.started, 0)).toBe(totals.sessions);
    expect(['random', 'balanced']).toContain(assignmentMode);
    void locked;
  });

  it('lists sessions with filters and guarded pagination', async () => {
    const all = await admin().get('/api/admin/sessions');
    expect(all.status).toBe(200);
    expect(all.body.data.total).toBeGreaterThan(0);
    expect(all.body.data.limit).toBe(100);
    const first = all.body.data.sessions[0];
    expect(Object.keys(first).sort()).toEqual(
      [
        'id', 'externalId', 'agentConditionId', 'agentCode', 'contextId', 'contextCode',
        'interactionCount', 'isLocked', 'surveyCompleted', 'completionCode', 'model',
        'promptVersion', 'createdAt', 'lockedAt', 'completedAt',
      ].sort()
    );

    const completed = await admin().get('/api/admin/sessions?status=completed');
    expect(completed.status).toBe(200);
    for (const s of completed.body.data.sessions) expect(s.surveyCompleted).toBe(true);

    const locked = await admin().get('/api/admin/sessions?status=locked');
    for (const s of locked.body.data.sessions) {
      expect(s.isLocked).toBe(true);
      expect(s.surveyCompleted).toBe(false);
    }

    const inProgress = await admin().get('/api/admin/sessions?status=in_progress');
    for (const s of inProgress.body.data.sessions) expect(s.isLocked).toBe(false);

    const byCell = await admin().get('/api/admin/sessions?agentConditionId=1&contextId=2&limit=5');
    expect(byCell.status).toBe(200);
    expect(byCell.body.data.limit).toBe(5);
    for (const s of byCell.body.data.sessions) {
      expect(s.agentConditionId).toBe(1);
      expect(s.contextId).toBe(2);
    }

    const clamped = await admin().get('/api/admin/sessions?limit=5000&offset=0');
    expect(clamped.body.data.limit).toBe(1000);

    expect((await admin().get('/api/admin/sessions?limit=abc')).status).toBe(400);
    expect((await admin().get('/api/admin/sessions?offset=-1')).status).toBe(400);
    expect((await admin().get('/api/admin/sessions?status=bogus')).status).toBe(400);
    expect((await admin().get('/api/admin/sessions?agentConditionId=NaN')).status).toBe(400);
  });

  it('returns one session with transcript and survey responses', async () => {
    const session = await createLockedSession();
    await submitSurvey(session.sessionId, validSurveyBody());

    const res = await admin().get(`/api/admin/sessions/${session.sessionId}`);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.id).toBe(session.sessionId);
    expect(data.agentCode).toMatch(/^(hi|lo)EI_(hi|lo)CI$/);
    expect(data.contextCode).toBe(session.context.code);
    expect(data.model).toBe('mock');
    expect(data.promptVersion).toBe('2.1');
    expect(data.messages).toHaveLength(20);
    expect(data.messages.map((m: any) => m.sequence)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(data.surveyResponses).toHaveLength(16);
    expect(data.surveyResponses[0]).toMatchObject({ questionId: 'post-1', completionCode: data.completionCode });

    expect((await admin().get(`/api/admin/sessions/${randomUUID()}`)).status).toBe(404);
    expect((await admin().get('/api/admin/sessions/not-a-uuid')).status).toBe(400);
  });

  it('lists messages and survey responses with filters', async () => {
    const session = await createSession();
    await playInteractions(session, 2);

    const messages = await admin().get(`/api/admin/messages?sessionId=${session.sessionId}`);
    expect(messages.status).toBe(200);
    expect(messages.body.data.total).toBe(4);
    expect(messages.body.data.messages).toHaveLength(4);
    expect(Object.keys(messages.body.data.messages[0]).sort()).toEqual(
      ['id', 'sessionId', 'sequence', 'role', 'content', 'isFallback', 'createdAt', 'agentCode', 'contextCode'].sort()
    );
    expect((await admin().get('/api/admin/messages?sessionId=nope')).status).toBe(400);

    const byContext = await admin().get(`/api/admin/messages?contextId=${session.context.id}&limit=3`);
    expect(byContext.status).toBe(200);
    for (const m of byContext.body.data.messages) expect(m.contextCode).toBe(session.context.code);

    const completed = await createLockedSession();
    await submitSurvey(completed.sessionId, validSurveyBody());
    const surveys = await admin().get(`/api/admin/surveys?sessionId=${completed.sessionId}`);
    expect(surveys.status).toBe(200);
    expect(surveys.body.data.total).toBe(16);
    expect(Object.keys(surveys.body.data.responses[0]).sort()).toEqual(
      ['id', 'sessionId', 'questionId', 'responseValue', 'createdAt', 'agentCode', 'contextCode', 'completionCode'].sort()
    );
  });
});

describe('GET /api/admin/export', () => {
  it('streams sessions as text/csv with a header row and attachment filename', async () => {
    await createSession();
    const res = await admin().get('/api/admin/export?type=sessions');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="study2-sessions-\d{4}-\d{2}-\d{2}\.csv"$/
    );
    const lines = res.text.split('\r\n').filter((l) => l.length > 0);
    expect(lines[0]).toBe(
      'id,external_id,agent_condition_id,agent_code,emotional_intelligence,cognitive_intelligence,context_id,context_code,interaction_count,is_locked,survey_completed,completion_code,model,prompt_version,created_at,locked_at,completed_at'
    );
    const total = (await admin().get('/api/admin/sessions?limit=1')).body.data.total;
    expect(lines.length - 1).toBe(total);
  });

  it('quotes message content per RFC 4180 and exports every row', async () => {
    const session = await createSession();
    const tricky = 'Line one, with comma\nLine two says "quoted"';
    const sent = await sendMessage(session.sessionId, 'opening', tricky);
    expect(sent.status).toBe(200);

    const res = await admin().get('/api/admin/export?type=messages');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.text.startsWith('id,session_id,agent_code,context_code,sequence,role,content,is_fallback,client_message_id,created_at\r\n')).toBe(true);
    expect(res.text).toContain('"Line one, with comma\nLine two says ""quoted"""');

    // Header + one line per row (rows containing a newline span two physical lines).
    const total = (await admin().get('/api/admin/messages?limit=1')).body.data.total;
    const records = res.text.match(/^[0-9a-f-]{36},/gm) ?? [];
    expect(records.length).toBe(total);
  });

  it('exports surveys and rejects unknown types', async () => {
    const res = await admin().get('/api/admin/export?type=surveys');
    expect(res.status).toBe(200);
    expect(res.text.split('\r\n')[0]).toBe(
      'id,session_id,agent_code,context_code,completion_code,question_id,response_value,created_at'
    );

    const bad = await admin().get('/api/admin/export?type=users');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    expect((await admin().get('/api/admin/export')).status).toBe(400);
  });

  it('neutralizes spreadsheet formulas in participant-controlled fields', async () => {
    const session = await createSession({ externalId: '@SUM(1+1)' });
    const sent = await sendMessage(session.sessionId, '=cmd|calc', '=HYPERLINK("http://evil.example","x")');
    expect(sent.status, describeResponse(sent)).toBe(200);
    const plus = await sendMessage(session.sessionId, randomUUID(), '+1-2');
    expect(plus.status).toBe(200);

    const messages = await admin().get('/api/admin/export?type=messages');
    expect(messages.status).toBe(200);
    expect(messages.text).toContain(`"'=HYPERLINK(""http://evil.example"",""x"")"`);
    expect(messages.text).toContain(`,"'=cmd|calc",`);
    expect(messages.text).toContain(`,"'+1-2",`);
    expect(messages.text).not.toMatch(/,=HYPERLINK/);
    expect(messages.text).not.toMatch(/,\+1-2,/);

    const sessions = await admin().get('/api/admin/export?type=sessions');
    expect(sessions.status).toBe(200);
    expect(sessions.text).toContain(`${session.sessionId},"'@SUM(1+1)",`);
    expect(sessions.text).not.toContain(`${session.sessionId},@SUM`);
  });

  it('exports every row exactly once across page boundaries, including rows sharing a timestamp', async () => {
    // Synthetic bulk data written straight to the DB so that every export exceeds one
    // EXPORT_BATCH_SIZE (1000-row) page, with both patterns a keyset cursor must survive:
    // rows whose timestamps differ only in microseconds, and large blocks of rows that
    // share one created_at (survey rows are written 16 per transaction in production).
    const anchor = await createSession();
    await pool.query(
      `INSERT INTO session_messages (session_id, sequence, role, content, created_at)
       SELECT $1, g, CASE WHEN g % 2 = 1 THEN 'user' ELSE 'agent' END, 'bulk message ' || g,
              CASE WHEN g <= 1100 THEN NOW() - interval '1 hour' + (g * interval '1 microsecond')
                   ELSE NOW() - interval '30 minutes' END
       FROM generate_series(1, 2200) AS g`,
      [anchor.sessionId]
    );
    // 1104 sessions = 92 per cell (keeps the cell distribution even for the assignment tests),
    // all created in the same instant.
    const bulkSessions = await pool.query(
      `INSERT INTO sessions (agent_condition_id, context_id, model, prompt_version, created_at)
       SELECT ((g - 1) % 4) + 1, ((g - 1) % 3) + 1, 'mock', '2.0', NOW() - interval '2 hours'
       FROM generate_series(1, 1104) AS g
       RETURNING id`
    );
    // 72 sessions x 16 responses, each block sharing one created_at.
    const surveySessionIds = bulkSessions.rows.slice(0, 72).map((r) => r.id as string);
    await pool.query(
      `INSERT INTO session_survey_responses (session_id, question_id, response_value, created_at)
       SELECT s.id, 'post-' || q, ((q - 1) % 7) + 1, NOW() - interval '90 minutes'
       FROM unnest($1::uuid[]) AS s(id) CROSS JOIN generate_series(1, 16) AS q`,
      [surveySessionIds]
    );

    const cases = [
      ['messages', 'session_messages'],
      ['sessions', 'sessions'],
      ['surveys', 'session_survey_responses'],
    ] as const;
    for (const [type, table] of cases) {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
      const expected: number = rows[0].n;
      expect(expected, `${table} must span more than one export page`).toBeGreaterThan(1000);

      const res = await admin().get(`/api/admin/export?type=${type}`);
      expect(res.status, `${type}: ${res.status}`).toBe(200);
      const ids = (res.text.match(/^[0-9a-f-]{36},/gm) ?? []).map((m) => m.slice(0, 36));
      expect(ids.length, `${type}: exported row count`).toBe(expected);
      expect(new Set(ids).size, `${type}: duplicate ids in export`).toBe(expected);
    }
  });
});

describe('removed v1 endpoints', () => {
  const removed: Array<[string, string]> = [
    ['post', '/api/auth/login'],
    ['post', '/api/auth/register'],
    ['post', '/api/auth/forgot-password'],
    ['get', '/api/user/state'],
    ['get', '/api/user/agent'],
    ['get', '/api/topics'],
    ['get', '/api/topics/current'],
    ['post', '/api/chat/message'],
    ['get', '/api/chat/messages/1'],
    ['post', '/api/surveys/literacy'],
    ['post', '/api/surveys/post-topic'],
    ['get', '/api/guardrails'],
    ['get', '/api/admin/users'],
    ['post', '/api/admin/migrations/run'],
    ['post', '/api/admin/seeds/run'],
  ];

  it.each(removed)('%s %s -> 404', async (method, path) => {
    const req = (api() as any)[method](path).set('x-admin-api-key', TEST_ADMIN_API_KEY);
    const res = await req.send({});
    expect(res.status).toBe(404);
    if (res.body && Object.keys(res.body).length > 0) {
      expect(res.body.error.code).toBe('NOT_FOUND');
    }
  });

  it('keeps /health', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('rate limits', () => {
  it('are enforced when DISABLE_RATE_LIMITS is not true (SESSION_CREATE_LIMIT_PER_HOUR creations per hour per IP)', async () => {
    // The limit is read per request from SESSION_CREATE_LIMIT_PER_HOUR (default 60);
    // use a small override so the test stays fast and proves the knob is honored.
    process.env.DISABLE_RATE_LIMITS = 'false';
    process.env.SESSION_CREATE_LIMIT_PER_HOUR = '5';
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i++) {
        statuses.push((await api().post('/api/sessions').send({})).status);
      }
      expect(statuses.slice(0, 5).every((s) => s === 201)).toBe(true);
      expect(statuses[5]).toBe(429);
      const limited = await api().post('/api/sessions').send({});
      expect(limited.body.error.code).toBe('RATE_LIMITED');
    } finally {
      process.env.DISABLE_RATE_LIMITS = 'true';
      delete process.env.SESSION_CREATE_LIMIT_PER_HOUR;
    }
    // Disabled again: not limited.
    expect((await api().post('/api/sessions').send({})).status).toBe(201);
  });

  it('limit messages to 30 per minute per session (replays count; other sessions are unaffected)', async () => {
    // Create the sessions while limits are still disabled: the per-IP creation limiter
    // above has already been exhausted for this hour.
    const busy = await createSession();
    const other = await createSession();
    process.env.DISABLE_RATE_LIMITS = 'false';
    try {
      const first = await sendMessage(busy.sessionId, 'opening', busy.openingMessage);
      expect(first.status, describeResponse(first)).toBe(200);
      for (let i = 2; i <= 30; i++) {
        const replay = await sendMessage(busy.sessionId, 'opening', busy.openingMessage);
        expect(replay.status, `request ${i}: ${describeResponse(replay)}`).toBe(200);
      }
      const limited = await sendMessage(busy.sessionId, 'opening', busy.openingMessage);
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');

      // Keyed by session, not by IP.
      const otherFirst = await sendMessage(other.sessionId, 'opening', other.openingMessage);
      expect(otherFirst.status, describeResponse(otherFirst)).toBe(200);
    } finally {
      process.env.DISABLE_RATE_LIMITS = 'true';
    }
    expect((await sendMessage(busy.sessionId, 'opening', busy.openingMessage)).status).toBe(200);
  });

  it('limit admin requests to 100 per 15 minutes per IP, counting rejected keys', async () => {
    process.env.DISABLE_RATE_LIMITS = 'false';
    try {
      for (let i = 1; i <= 99; i++) {
        const res = await admin().get('/api/admin/verify');
        expect(res.status, `request ${i}: ${describeResponse(res)}`).toBe(200);
      }
      const wrongKey = await api().get('/api/admin/verify').set('x-admin-api-key', 'nope');
      expect(wrongKey.status).toBe(401);

      const limited = await admin().get('/api/admin/verify');
      expect(limited.status).toBe(429);
      expect(limited.body.error.code).toBe('RATE_LIMITED');
    } finally {
      process.env.DISABLE_RATE_LIMITS = 'true';
    }
    expect((await admin().get('/api/admin/verify')).status).toBe(200);
  });
});
