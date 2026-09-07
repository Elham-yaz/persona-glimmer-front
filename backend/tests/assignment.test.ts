import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closePool } from '../src/config/database';
import {
  admin,
  api,
  closeServer,
  createSession,
  describeResponse,
  startServer,
} from './helpers';

beforeAll(async () => {
  await startServer();
});

afterAll(async () => {
  await closeServer();
  await closePool();
});

afterEach(() => {
  process.env.ASSIGNMENT_MODE = 'random';
  delete process.env.ALLOW_FORCED_ASSIGNMENT;
});

interface Cell {
  agentConditionId: number;
  contextId: number;
  started: number;
  completed: number;
}

async function cellCounts(): Promise<Cell[]> {
  const res = await admin().get('/api/admin/dashboard');
  expect(res.status, describeResponse(res)).toBe(200);
  return res.body.data.cells;
}

async function cellOf(sessionId: string): Promise<{ agentConditionId: number; contextId: number }> {
  const res = await admin().get(`/api/admin/sessions/${sessionId}`);
  expect(res.status, describeResponse(res)).toBe(200);
  return { agentConditionId: res.body.data.agentConditionId, contextId: res.body.data.contextId };
}

async function forceInto(agentConditionId: number, contextId: number): Promise<void> {
  process.env.ALLOW_FORCED_ASSIGNMENT = 'true';
  const session = await createSession({ force: { agentConditionId, contextId } });
  expect(await cellOf(session.sessionId)).toEqual({ agentConditionId, contextId });
}


/**
 * In balanced mode, create sessions one at a time until every cell holds the same count,
 * asserting that each pick lands in a least-populated cell. Returns the final counts.
 */
async function equalizeCells(): Promise<Cell[]> {
  let cells = await cellCounts();
  const target = Math.max(...cells.map((c) => c.started));
  const needed = cells.reduce((sum, c) => sum + (target - c.started), 0);

  for (let i = 0; i < needed; i++) {
    const minimum = Math.min(...cells.map((c) => c.started));
    const session = await createSession();
    const cell = await cellOf(session.sessionId);
    const chosen = cells.find(
      (c) => c.agentConditionId === cell.agentConditionId && c.contextId === cell.contextId
    )!;
    expect(chosen.started, `pick ${i}: chose a cell with ${chosen.started} > min ${minimum}`).toBe(minimum);
    cells = await cellCounts();
  }
  return cells;
}

describe('assignment', () => {
  it('exposes all 12 cells on the dashboard', async () => {
    const cells = await cellCounts();
    expect(cells).toHaveLength(12);
    const keys = cells.map((c) => `${c.agentConditionId}-${c.contextId}`).sort();
    const expected: string[] = [];
    for (let a = 1; a <= 4; a++) for (let c = 1; c <= 3; c++) expected.push(`${a}-${c}`);
    expect(keys).toEqual(expected.sort());
  });

  it('random mode only ever produces valid cells', async () => {
    process.env.ASSIGNMENT_MODE = 'random';
    for (let i = 0; i < 6; i++) {
      const session = await createSession();
      const cell = await cellOf(session.sessionId);
      expect(cell.agentConditionId).toBeGreaterThanOrEqual(1);
      expect(cell.agentConditionId).toBeLessThanOrEqual(4);
      expect(cell.contextId).toBeGreaterThanOrEqual(1);
      expect(cell.contextId).toBeLessThanOrEqual(3);
    }
  });

  it('balanced mode always fills one of the least-populated cells', async () => {
    // Make the distribution uneven first so the test is meaningful.
    await forceInto(1, 1);
    await forceInto(1, 1);
    await forceInto(2, 2);
    delete process.env.ALLOW_FORCED_ASSIGNMENT;
    process.env.ASSIGNMENT_MODE = 'balanced';

    const after = await equalizeCells();
    const counts = after.map((c) => c.started);
    expect(Math.max(...counts) - Math.min(...counts)).toBe(0);
  });

  it('balanced mode keeps the cells even under concurrent session creation', async () => {
    process.env.ASSIGNMENT_MODE = 'balanced';
    const before = await equalizeCells(); // every cell at the same count

    const results = await Promise.all(Array.from({ length: 12 }, () => api().post('/api/sessions').send({})));
    for (const r of results) expect(r.status).toBe(201);

    // With the assignment serialized, 12 concurrent creations land in 12 distinct cells.
    const after = await cellCounts();
    for (const cell of after) {
      const previous = before.find(
        (c) => c.agentConditionId === cell.agentConditionId && c.contextId === cell.contextId
      )!;
      expect(cell.started, `cell ${cell.agentConditionId}-${cell.contextId}`).toBe(previous.started + 1);
    }
  });

  it('honors force only when ALLOW_FORCED_ASSIGNMENT=true', async () => {
    // Allowed: lands exactly where requested even if that cell is the fullest.
    process.env.ALLOW_FORCED_ASSIGNMENT = 'true';
    await forceInto(3, 3);
    await forceInto(3, 3);
    await forceInto(3, 3);
    const cells = await cellCounts();
    const fullest = cells.reduce((a, b) => (b.started > a.started ? b : a));
    expect(fullest).toMatchObject({ agentConditionId: 3, contextId: 3 });

    // Not allowed: force is silently ignored (201, not an error) and the balanced
    // algorithm, which never picks the fullest cell, decides instead.
    delete process.env.ALLOW_FORCED_ASSIGNMENT;
    process.env.ASSIGNMENT_MODE = 'balanced';
    for (let i = 0; i < 3; i++) {
      const session = await createSession({ force: { agentConditionId: 3, contextId: 3 } });
      const cell = await cellOf(session.sessionId);
      expect(cell).not.toEqual({ agentConditionId: 3, contextId: 3 });
    }

    // Explicit false behaves like unset.
    process.env.ALLOW_FORCED_ASSIGNMENT = 'false';
    const session = await createSession({ force: { agentConditionId: 3, contextId: 3 } });
    expect(await cellOf(session.sessionId)).not.toEqual({ agentConditionId: 3, contextId: 3 });
  });

  it('rejects a malformed force object with 400 regardless of the flag', async () => {
    process.env.ALLOW_FORCED_ASSIGNMENT = 'true';
    const res = await api().post('/api/sessions').send({ force: { agentConditionId: 5, contextId: 1 } });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
