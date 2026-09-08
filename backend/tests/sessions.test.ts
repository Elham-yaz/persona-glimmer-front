import { randomUUID } from 'crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import pool, { closePool } from '../src/config/database';
import { MAX_INTERACTIONS } from '../src/config/study';
import { OpenAIService } from '../src/services/openai.service';
import { AgentUnavailableError } from '../src/utils/errors';
import {
  api,
  closeServer,
  createLockedSession,
  createSession,
  describeResponse,
  getMe,
  playInteractions,
  sendMessage,
  startServer,
  submitSurvey,
  UUID_RE,
  validSurveyBody,
} from './helpers';

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await closeServer();
  await closePool();
});

async function dbSession(sessionId: string) {
  const { rows } = await pool.query('SELECT * FROM sessions WHERE id = $1', [sessionId]);
  return rows[0];
}

async function messageCount(sessionId: string): Promise<number> {
  const { rows } = await pool.query(
    'SELECT COUNT(*)::int AS n FROM session_messages WHERE session_id = $1',
    [sessionId]
  );
  return rows[0].n;
}

describe('POST /api/sessions', () => {
  it('creates a session with the contract shape and leaks nothing about the condition', async () => {
    const res = await api().post('/api/sessions').send({ externalId: 'R_qualtrics123' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const data = res.body.data;
    expect(data.sessionId).toMatch(UUID_RE);
    expect(data.agent).toEqual({ displayName: 'Alex' });
    expect(Object.keys(data.context).sort()).toEqual(
      ['code', 'id', 'participantScenario', 'scenarioType', 'title'].sort()
    );
    expect([1, 2, 3]).toContain(data.context.id);
    expect(['food_utilitarian', 'food_hedonic', 'food_informational']).toContain(data.context.code);
    expect(data.openingMessage).toBe(data.context.participantScenario);
    expect(data.maxInteractions).toBe(MAX_INTERACTIONS);
    expect(data.interactionCount).toBe(0);
    expect(data.isLocked).toBe(false);
    expect(data.surveyCompleted).toBe(false);
    expect(data.completionCode).toBeNull();
    expect(data.messages).toEqual([]);

    const raw = JSON.stringify(res.body).toLowerCase();
    for (const forbidden of ['emotional', 'cognitive', 'hiei', 'loei', 'hici', 'loci', 'agentpolicy', 'agent_policy', 'policy:', 'agentconditionid']) {
      expect(raw, `response must not contain "${forbidden}"`).not.toContain(forbidden);
    }

    const row = await dbSession(data.sessionId);
    expect(row.external_id).toBe('R_qualtrics123');
    expect(row.prompt_version).toBe('2.1');
    expect(row.model).toBe('mock');
  });

  it('accepts an empty body', async () => {
    const res = await api().post('/api/sessions');
    expect(res.status).toBe(201);
  });

  it('rejects an externalId longer than 100 characters', async () => {
    const res = await api().post('/api/sessions').send({ externalId: 'x'.repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('GET /api/sessions/me (resume)', () => {
  it('rejects missing, malformed, and unknown session ids with 401 SESSION_INVALID', async () => {
    const missing = await api().get('/api/sessions/me');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('SESSION_INVALID');

    const malformed = await getMe('not-a-uuid');
    expect(malformed.status).toBe(401);
    expect(malformed.body.error.code).toBe('SESSION_INVALID');

    const unknown = await getMe(randomUUID());
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.code).toBe('SESSION_INVALID');
  });

  it('returns the same shape as creation with the transcript populated', async () => {
    const session = await createSession();
    await playInteractions(session, 2);

    const res = await getMe(session.sessionId);
    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(data.sessionId).toBe(session.sessionId);
    expect(data.agent).toEqual({ displayName: 'Alex' });
    expect(data.context).toEqual(session.context);
    expect(data.openingMessage).toBe(session.openingMessage);
    expect(data.maxInteractions).toBe(MAX_INTERACTIONS);
    expect(data.interactionCount).toBe(2);
    expect(data.isLocked).toBe(false);
    expect(data.surveyCompleted).toBe(false);
    expect(data.completionCode).toBeNull();
    expect(data.messages.map((m: any) => m.sequence)).toEqual([1, 2, 3, 4]);
    expect(data.messages.map((m: any) => m.role)).toEqual(['user', 'agent', 'user', 'agent']);
    expect(data.messages[0].content).toBe(session.openingMessage);
    for (const m of data.messages) {
      expect(Object.keys(m).sort()).toEqual(['content', 'createdAt', 'id', 'role', 'sequence']);
    }
  });
});

describe('POST /api/sessions/me/messages', () => {
  it('counts the opening message as interaction 1 with sequences 1 and 2', async () => {
    const session = await createSession();
    const res = await sendMessage(session.sessionId, 'opening', session.openingMessage);
    expect(res.status).toBe(200);

    const data = res.body.data;
    expect(data.userMessage.sequence).toBe(1);
    expect(data.userMessage.role).toBe('user');
    expect(data.userMessage.content).toBe(session.openingMessage);
    expect(data.agentMessage.sequence).toBe(2);
    expect(data.agentMessage.role).toBe('agent');
    expect(data.agentMessage.content).toBe(`[mock reply to: ${session.openingMessage.slice(0, 60)}]`);
    expect(data.interactionCount).toBe(1);
    expect(data.isLocked).toBe(false);
    expect(data.shouldShowSurvey).toBe(false);
  });

  it('validates clientMessageId and content', async () => {
    const session = await createSession();
    const noId = await api()
      .post('/api/sessions/me/messages')
      .set('Authorization', `Bearer ${session.sessionId}`)
      .send({ content: 'hi' });
    expect(noId.status, describeResponse(noId)).toBe(400);

    const longId = await sendMessage(session.sessionId, 'x'.repeat(65), 'hi');
    expect(longId.status, describeResponse(longId)).toBe(400);

    const blank = await sendMessage(session.sessionId, randomUUID(), '   \n ');
    expect(blank.status).toBe(400);
    expect(blank.body.error.code).toBe('VALIDATION_ERROR');

    const tooLong = await sendMessage(session.sessionId, randomUUID(), 'a'.repeat(5001));
    expect(tooLong.status).toBe(400);

    expect(await messageCount(session.sessionId)).toBe(0);
  });

  it('locks the session at 10 interactions and rejects the 11th with 409 SESSION_LOCKED', async () => {
    const session = await createSession();
    await sendMessage(session.sessionId, 'opening', session.openingMessage);
    let last: any = null;
    for (let i = 2; i <= MAX_INTERACTIONS; i++) {
      const res = await sendMessage(session.sessionId, randomUUID(), `message ${i}`);
      expect(res.status).toBe(200);
      last = res.body.data;
      expect(last.interactionCount).toBe(i);
      expect(last.isLocked).toBe(i === MAX_INTERACTIONS);
      expect(last.shouldShowSurvey).toBe(i === MAX_INTERACTIONS);
    }
    expect(last.agentMessage.sequence).toBe(20);

    const eleventh = await sendMessage(session.sessionId, randomUUID(), 'one more');
    expect(eleventh.status).toBe(409);
    expect(eleventh.body.error.code).toBe('SESSION_LOCKED');

    const row = await dbSession(session.sessionId);
    expect(row.interaction_count).toBe(10);
    expect(row.is_locked).toBe(true);
    expect(row.locked_at).not.toBeNull();
    expect(await messageCount(session.sessionId)).toBe(20);

    const me = await getMe(session.sessionId);
    expect(me.body.data.isLocked).toBe(true);
    expect(me.body.data.messages).toHaveLength(20);
  });

  it('replays an already-processed clientMessageId with the same payload and no new rows', async () => {
    const session = await createSession();
    const id = randomUUID();
    const first = await sendMessage(session.sessionId, id, 'first attempt');
    expect(first.status).toBe(200);
    const rowsAfterFirst = await messageCount(session.sessionId);
    const countAfterFirst = (await dbSession(session.sessionId)).interaction_count;

    const replay = await sendMessage(session.sessionId, id, 'first attempt');
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);

    // Even a different body with the same id is treated as the same message.
    const replayDifferentBody = await sendMessage(session.sessionId, id, 'something else');
    expect(replayDifferentBody.status).toBe(200);
    expect(replayDifferentBody.body).toEqual(first.body);

    expect(await messageCount(session.sessionId)).toBe(rowsAfterFirst);
    expect((await dbSession(session.sessionId)).interaction_count).toBe(countAfterFirst);

    // Replaying the opening message also does not duplicate it.
    const opening1 = await sendMessage(session.sessionId, 'opening', session.openingMessage);
    const opening2 = await sendMessage(session.sessionId, 'opening', session.openingMessage);
    expect(opening2.body).toEqual(opening1.body);
    expect(await messageCount(session.sessionId)).toBe(rowsAfterFirst + 2);
  });

  it('never exceeds 10 interactions under 5 concurrent sends at count 8', async () => {
    const session = await createSession();
    await playInteractions(session, 8);
    expect((await dbSession(session.sessionId)).interaction_count).toBe(8);

    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        sendMessage(session.sessionId, randomUUID(), `concurrent ${i}`)
      )
    );

    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 200, 409, 409, 409]);
    for (const r of results.filter((r) => r.status === 409)) {
      expect(r.body.error.code).toBe('SESSION_LOCKED');
    }
    const successes = results.filter((r) => r.status === 200).map((r) => r.body.data);
    expect(successes.map((d) => d.interactionCount).sort((a, b) => a - b)).toEqual([9, 10]);
    expect(successes.map((d) => d.userMessage.sequence).sort((a, b) => a - b)).toEqual([17, 19]);

    const row = await dbSession(session.sessionId);
    expect(row.interaction_count).toBe(10);
    expect(row.is_locked).toBe(true);
    expect(await messageCount(session.sessionId)).toBe(20);
  });

  it('persists nothing and returns 502 AGENT_UNAVAILABLE when the model call fails', async () => {
    const session = await createSession();
    await playInteractions(session, 1);
    const before = await messageCount(session.sessionId);
    const id = randomUUID();

    const spy = vi
      .spyOn(OpenAIService, 'generateReply')
      .mockRejectedValueOnce(new Error('simulated network failure'));
    try {
      const failed = await sendMessage(session.sessionId, id, 'will fail');
      expect(failed.status).toBe(502);
      expect(failed.body).toEqual({
        success: false,
        error: {
          code: 'AGENT_UNAVAILABLE',
          message: 'The agent is temporarily unavailable. Please try sending your message again.',
        },
      });
      expect(spy).toHaveBeenCalledTimes(1);
    } finally {
      spy.mockRestore();
    }

    expect(await messageCount(session.sessionId)).toBe(before);
    expect((await dbSession(session.sessionId)).interaction_count).toBe(1);
    const { rows } = await pool.query(
      'SELECT 1 FROM session_messages WHERE session_id = $1 AND client_message_id = $2',
      [session.sessionId, id]
    );
    expect(rows).toHaveLength(0);

    // The frontend retries with the SAME clientMessageId; it now succeeds normally.
    const retry = await sendMessage(session.sessionId, id, 'will fail');
    expect(retry.status).toBe(200);
    expect(retry.body.data.interactionCount).toBe(2);
    expect(retry.body.data.userMessage.sequence).toBe(3);
  });

  it('treats an empty completion (AgentUnavailableError from the service) the same way', async () => {
    const session = await createSession();
    const spy = vi
      .spyOn(OpenAIService, 'generateReply')
      .mockRejectedValueOnce(new AgentUnavailableError());
    try {
      const failed = await sendMessage(session.sessionId, 'opening', session.openingMessage);
      expect(failed.status).toBe(502);
      expect(failed.body.error.code).toBe('AGENT_UNAVAILABLE');
    } finally {
      spy.mockRestore();
    }
    expect(await messageCount(session.sessionId)).toBe(0);
  });
});

describe('POST /api/sessions/me/survey', () => {
  it('returns 409 SESSION_NOT_LOCKED before 10 interactions', async () => {
    const session = await createSession();
    await playInteractions(session, 3);
    const res = await submitSurvey(session.sessionId, validSurveyBody());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SESSION_NOT_LOCKED');
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM session_survey_responses WHERE session_id = $1',
      [session.sessionId]
    );
    expect(rows[0].n).toBe(0);
  });

  it('rejects wrong counts, duplicate ids, unknown ids and out-of-range values with 400', async () => {
    const session = await createLockedSession();

    const fifteen = validSurveyBody();
    fifteen.responses.pop();
    expect((await submitSurvey(session.sessionId, fifteen)).status).toBe(400);

    const seventeen = validSurveyBody();
    seventeen.responses.push({ questionId: 'post-17', value: 4 });
    expect((await submitSurvey(session.sessionId, seventeen)).status).toBe(400);

    const duplicate = validSurveyBody();
    duplicate.responses[15] = { questionId: 'post-1', value: 4 };
    const dupRes = await submitSurvey(session.sessionId, duplicate);
    expect(dupRes.status).toBe(400);
    expect(dupRes.body.error.code).toBe('VALIDATION_ERROR');

    const unknownId = validSurveyBody();
    unknownId.responses[0] = { questionId: 'lit-1', value: 4 };
    expect((await submitSurvey(session.sessionId, unknownId)).status).toBe(400);

    expect((await submitSurvey(session.sessionId, validSurveyBody(() => 8))).status).toBe(400);
    expect((await submitSurvey(session.sessionId, validSurveyBody(() => 0))).status).toBe(400);
    expect((await submitSurvey(session.sessionId, validSurveyBody(() => 3.5))).status).toBe(400);

    const stringValue = validSurveyBody() as any;
    stringValue.responses[2].value = '5';
    expect((await submitSurvey(session.sessionId, stringValue)).status).toBe(400);

    expect((await submitSurvey(session.sessionId, {})).status).toBe(400);

    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS n FROM session_survey_responses WHERE session_id = $1',
      [session.sessionId]
    );
    expect(rows[0].n).toBe(0);
    expect((await dbSession(session.sessionId)).survey_completed).toBe(false);
  });

  it('stores exactly 16 rows, issues a unique 5-digit code, and is idempotent', async () => {
    const sessionA = await createLockedSession();
    const sessionB = await createLockedSession();

    const first = await submitSurvey(sessionA.sessionId, validSurveyBody());
    expect(first.status).toBe(200);
    expect(first.body.data.alreadyCompleted).toBe(false);
    const code = first.body.data.completionCode;
    expect(Number.isInteger(code)).toBe(true);
    expect(code).toBeGreaterThanOrEqual(10000);
    expect(code).toBeLessThanOrEqual(99999);

    const again = await submitSurvey(sessionA.sessionId, validSurveyBody(() => 7));
    expect(again.status).toBe(200);
    expect(again.body.data).toEqual({ completionCode: code, alreadyCompleted: true });

    const { rows } = await pool.query(
      `SELECT question_id, response_value FROM session_survey_responses
       WHERE session_id = $1 ORDER BY NULLIF(regexp_replace(question_id, '\\D', '', 'g'), '')::int`,
      [sessionA.sessionId]
    );
    expect(rows).toHaveLength(16);
    expect(rows.map((r) => r.question_id)).toEqual(
      Array.from({ length: 16 }, (_, i) => `post-${i + 1}`)
    );
    // The idempotent re-submit wrote nothing: values are from the first submission.
    expect(rows.map((r) => r.response_value)).toEqual(validSurveyBody().responses.map((r) => r.value));

    const row = await dbSession(sessionA.sessionId);
    expect(row.survey_completed).toBe(true);
    expect(row.completion_code).toBe(code);
    expect(row.completed_at).not.toBeNull();

    const me = await getMe(sessionA.sessionId);
    expect(me.body.data.surveyCompleted).toBe(true);
    expect(me.body.data.completionCode).toBe(code);
    expect(me.body.data.isLocked).toBe(true);

    // Messages after completion are refused.
    const afterCompletion = await sendMessage(sessionA.sessionId, randomUUID(), 'hello again');
    expect(afterCompletion.status).toBe(409);
    expect(afterCompletion.body.error.code).toBe('SESSION_COMPLETED');

    // A second session gets a different code.
    const second = await submitSurvey(sessionB.sessionId, validSurveyBody());
    expect(second.status).toBe(200);
    expect(second.body.data.completionCode).not.toBe(code);

    const codes = await pool.query(
      'SELECT completion_code FROM sessions WHERE completion_code IS NOT NULL'
    );
    const values = codes.rows.map((r) => r.completion_code);
    expect(new Set(values).size).toBe(values.length);
  });

  it('replays an earlier clientMessageId after completion with shouldShowSurvey recomputed to false', async () => {
    const session = await createSession();
    await playInteractions(session, 9);
    const tenthId = randomUUID();
    const tenth = await sendMessage(session.sessionId, tenthId, 'tenth message');
    expect(tenth.status, describeResponse(tenth)).toBe(200);
    expect(tenth.body.data).toMatchObject({ interactionCount: 10, isLocked: true, shouldShowSurvey: true });

    const survey = await submitSurvey(session.sessionId, validSurveyBody());
    expect(survey.status, describeResponse(survey)).toBe(200);
    const rowsBefore = await messageCount(session.sessionId);

    // Same clientMessageId: 200 with the original messages, no writes, and shouldShowSurvey
    // reflects the CURRENT survey flag (deviation noted in the implementation: the replay does
    // not resurrect the survey prompt once the survey has been submitted).
    const replay = await sendMessage(session.sessionId, tenthId, 'tenth message');
    expect(replay.status, describeResponse(replay)).toBe(200);
    expect(replay.body.data.userMessage).toEqual(tenth.body.data.userMessage);
    expect(replay.body.data.agentMessage).toEqual(tenth.body.data.agentMessage);
    expect(replay.body.data).toMatchObject({ interactionCount: 10, isLocked: true, shouldShowSurvey: false });

    // A NEW clientMessageId is refused because the session is completed.
    const fresh = await sendMessage(session.sessionId, randomUUID(), 'one more');
    expect(fresh.status).toBe(409);
    expect(fresh.body.error.code).toBe('SESSION_COMPLETED');
    expect(await messageCount(session.sessionId)).toBe(rowsBefore);
  });

  it('requires a valid session', async () => {
    const res = await submitSurvey(randomUUID(), validSurveyBody());
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('SESSION_INVALID');
  });
});

describe('oversized request bodies', () => {
  it('returns 413 PAYLOAD_TOO_LARGE for a JSON body over the 100 kB express.json limit', async () => {
    const res = await api()
      .post('/api/sessions')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ externalId: 'x'.repeat(120_000) }));
    expect(res.status, describeResponse(res)).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
