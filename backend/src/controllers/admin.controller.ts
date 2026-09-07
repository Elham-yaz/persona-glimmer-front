import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { QueryResult } from 'pg';
import { query } from '../config/database';
import { getAssignmentMode } from '../config/study';
import { isUuid } from '../middleware/session.middleware';
import { NotFoundError, ValidationError } from '../utils/errors';

export interface AdminRequest extends Request {
  headers: {
    'x-admin-api-key'?: string;
    [key: string]: string | string[] | undefined;
  };
}

// Constant-time comparison of two strings of arbitrary length
const timingSafeKeyCompare = (a: string, b: string): boolean => {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

// Middleware to check admin access.
// Fails closed: if ADMIN_API_KEY is not configured, the admin API is disabled entirely
// (no fallback key, no development bypass). The key is read at request time so a
// missing dotenv load at module import cannot silently disable the check.
export const requireAdmin = (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void => {
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey) {
    res.status(403).json({
      success: false,
      error: {
        message: 'Admin API is disabled: ADMIN_API_KEY is not configured on this server',
        code: 'ADMIN_NOT_CONFIGURED',
      },
    });
    return;
  }

  const apiKey = req.headers['x-admin-api-key'];

  if (typeof apiKey !== 'string' || !timingSafeKeyCompare(apiKey, configuredKey)) {
    res.status(401).json({
      success: false,
      error: {
        message: 'Unauthorized: Admin API key required',
        code: 'ADMIN_UNAUTHORIZED',
      },
    });
    return;
  }

  next();
};

// Lightweight endpoint for the admin dashboard to verify a key before storing it
export const verifyAdminKey = (
  req: AdminRequest,
  res: Response
): void => {
  res.json({ success: true, data: { ok: true } });
};

// ---------------------------------------------------------------------------
// Query-parameter helpers (every parseInt is guarded)
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

function parseIntegerParam(value: unknown, name: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !/^\d+$/.test(value.trim())) {
    throw new ValidationError(`${name} must be a non-negative integer`);
  }
  const parsed = parseInt(value.trim(), 10);
  if (!Number.isSafeInteger(parsed)) {
    throw new ValidationError(`${name} is out of range`);
  }
  return parsed;
}

function parsePagination(q: Record<string, unknown>): { limit: number; offset: number } {
  const limit = Math.min(Math.max(parseIntegerParam(q.limit, 'limit') ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset = parseIntegerParam(q.offset, 'offset') ?? 0;
  return { limit, offset };
}

function parseUuidParam(value: unknown, name: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isUuid(value)) {
    throw new ValidationError(`${name} must be a UUID`);
  }
  return value;
}

type SessionStatus = 'in_progress' | 'locked' | 'completed';
const SESSION_STATUSES: SessionStatus[] = ['in_progress', 'locked', 'completed'];

function parseStatusParam(value: unknown): SessionStatus | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !SESSION_STATUSES.includes(value as SessionStatus)) {
    throw new ValidationError(`status must be one of ${SESSION_STATUSES.join(', ')}`);
  }
  return value as SessionStatus;
}

function statusCondition(status: SessionStatus, alias: string): string {
  switch (status) {
    case 'in_progress':
      return `NOT ${alias}.is_locked`;
    case 'locked':
      return `${alias}.is_locked AND NOT ${alias}.survey_completed`;
    case 'completed':
      return `${alias}.survey_completed`;
  }
}

/** Accumulates `WHERE` clauses and their positional parameters. */
class WhereBuilder {
  readonly clauses: string[] = [];
  readonly params: unknown[] = [];

  add(clauseWithPlaceholder: (index: number) => string, value: unknown): void {
    this.params.push(value);
    this.clauses.push(clauseWithPlaceholder(this.params.length));
  }

  addRaw(clause: string): void {
    this.clauses.push(clause);
  }

  sql(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}

// ---------------------------------------------------------------------------
// Row serializers
// ---------------------------------------------------------------------------

const SESSION_SELECT = `
  s.id, s.external_id, s.agent_condition_id, ac.code AS agent_code,
  s.context_id, c.code AS context_code, s.interaction_count, s.is_locked,
  s.survey_completed, s.completion_code, s.model, s.prompt_version,
  s.created_at, s.locked_at, s.completed_at
`;

const SESSION_FROM = `
  FROM sessions s
  JOIN agent_conditions ac ON ac.id = s.agent_condition_id
  JOIN contexts c ON c.id = s.context_id
`;

function serializeSession(row: any) {
  return {
    id: row.id,
    externalId: row.external_id,
    agentConditionId: row.agent_condition_id,
    agentCode: row.agent_code,
    contextId: row.context_id,
    contextCode: row.context_code,
    interactionCount: row.interaction_count,
    isLocked: row.is_locked,
    surveyCompleted: row.survey_completed,
    completionCode: row.completion_code,
    model: row.model,
    promptVersion: row.prompt_version,
    createdAt: row.created_at,
    lockedAt: row.locked_at,
    completedAt: row.completed_at,
  };
}

const MESSAGE_SELECT = `
  m.id, m.session_id, m.sequence, m.role, m.content, m.is_fallback, m.client_message_id, m.created_at,
  ac.code AS agent_code, c.code AS context_code
`;

const MESSAGE_FROM = `
  FROM session_messages m
  JOIN sessions s ON s.id = m.session_id
  JOIN agent_conditions ac ON ac.id = s.agent_condition_id
  JOIN contexts c ON c.id = s.context_id
`;

function serializeMessage(row: any) {
  return {
    id: row.id,
    sessionId: row.session_id,
    sequence: row.sequence,
    role: row.role,
    content: row.content,
    isFallback: row.is_fallback,
    createdAt: row.created_at,
    agentCode: row.agent_code,
    contextCode: row.context_code,
  };
}

const SURVEY_SELECT = `
  r.id, r.session_id, r.question_id, r.response_value, r.created_at,
  ac.code AS agent_code, c.code AS context_code, s.completion_code
`;

const SURVEY_FROM = `
  FROM session_survey_responses r
  JOIN sessions s ON s.id = r.session_id
  JOIN agent_conditions ac ON ac.id = s.agent_condition_id
  JOIN contexts c ON c.id = s.context_id
`;

function serializeSurveyResponse(row: any) {
  return {
    id: row.id,
    sessionId: row.session_id,
    questionId: row.question_id,
    responseValue: row.response_value,
    createdAt: row.created_at,
    agentCode: row.agent_code,
    contextCode: row.context_code,
    completionCode: row.completion_code,
  };
}

// ---------------------------------------------------------------------------
// GET /api/admin/dashboard
// ---------------------------------------------------------------------------

export const getDashboard = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const [sessionTotals, messageTotals, surveyTotals, cells] = await Promise.all([
      query(`
        SELECT COUNT(*)::int AS sessions,
               COUNT(*) FILTER (WHERE survey_completed)::int AS completed,
               COUNT(*) FILTER (WHERE is_locked AND NOT survey_completed)::int AS locked,
               COUNT(*) FILTER (WHERE NOT is_locked)::int AS in_progress
        FROM sessions
      `),
      query('SELECT COUNT(*)::int AS messages FROM session_messages'),
      query('SELECT COUNT(*)::int AS survey_responses FROM session_survey_responses'),
      query(`
        SELECT ac.id AS agent_condition_id, ac.code AS agent_code,
               c.id AS context_id, c.code AS context_code,
               COUNT(s.id)::int AS started,
               COUNT(s.id) FILTER (WHERE s.survey_completed)::int AS completed
        FROM agent_conditions ac
        CROSS JOIN contexts c
        LEFT JOIN sessions s ON s.agent_condition_id = ac.id AND s.context_id = c.id
        GROUP BY ac.id, ac.code, c.id, c.code
        ORDER BY ac.id, c.id
      `),
    ]);

    const totals = sessionTotals.rows[0];
    res.json({
      success: true,
      data: {
        totals: {
          sessions: totals.sessions,
          completed: totals.completed,
          locked: totals.locked,
          inProgress: totals.in_progress,
          messages: messageTotals.rows[0].messages,
          surveyResponses: surveyTotals.rows[0].survey_responses,
        },
        cells: cells.rows.map((row) => ({
          agentConditionId: row.agent_condition_id,
          agentCode: row.agent_code,
          contextId: row.context_id,
          contextCode: row.context_code,
          started: row.started,
          completed: row.completed,
        })),
        assignmentMode: getAssignmentMode(),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/sessions and /api/admin/sessions/:id
// ---------------------------------------------------------------------------

export const listSessions = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const { limit, offset } = parsePagination(q);
    const where = new WhereBuilder();

    const agentConditionId = parseIntegerParam(q.agentConditionId, 'agentConditionId');
    if (agentConditionId !== undefined) where.add((i) => `s.agent_condition_id = $${i}`, agentConditionId);
    const contextId = parseIntegerParam(q.contextId, 'contextId');
    if (contextId !== undefined) where.add((i) => `s.context_id = $${i}`, contextId);
    const status = parseStatusParam(q.status);
    if (status) where.addRaw(statusCondition(status, 's'));

    const [rows, count] = await Promise.all([
      query(
        `SELECT ${SESSION_SELECT} ${SESSION_FROM} ${where.sql()}
         ORDER BY s.created_at DESC, s.id
         LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
        [...where.params, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total ${SESSION_FROM} ${where.sql()}`, where.params),
    ]);

    res.json({
      success: true,
      data: {
        sessions: rows.rows.map(serializeSession),
        total: count.rows[0].total,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getSession = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const id = req.params.id;
    if (!isUuid(id)) {
      throw new ValidationError('Session id must be a UUID');
    }

    const sessionResult = await query(
      `SELECT ${SESSION_SELECT} ${SESSION_FROM} WHERE s.id = $1`,
      [id]
    );
    if (sessionResult.rows.length === 0) {
      throw new NotFoundError('Session');
    }

    const [messages, surveyResponses] = await Promise.all([
      query(`SELECT ${MESSAGE_SELECT} ${MESSAGE_FROM} WHERE m.session_id = $1 ORDER BY m.sequence`, [id]),
      query(
        `SELECT ${SURVEY_SELECT} ${SURVEY_FROM} WHERE r.session_id = $1
         ORDER BY NULLIF(regexp_replace(r.question_id, '\\D', '', 'g'), '')::int, r.question_id`,
        [id]
      ),
    ]);

    res.json({
      success: true,
      data: {
        ...serializeSession(sessionResult.rows[0]),
        messages: messages.rows.map(serializeMessage),
        surveyResponses: surveyResponses.rows.map(serializeSurveyResponse),
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/messages
// ---------------------------------------------------------------------------

export const listMessages = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const { limit, offset } = parsePagination(q);
    const where = new WhereBuilder();

    const sessionId = parseUuidParam(q.sessionId, 'sessionId');
    if (sessionId) where.add((i) => `m.session_id = $${i}`, sessionId);
    const agentConditionId = parseIntegerParam(q.agentConditionId, 'agentConditionId');
    if (agentConditionId !== undefined) where.add((i) => `s.agent_condition_id = $${i}`, agentConditionId);
    const contextId = parseIntegerParam(q.contextId, 'contextId');
    if (contextId !== undefined) where.add((i) => `s.context_id = $${i}`, contextId);

    const [rows, count] = await Promise.all([
      query(
        `SELECT ${MESSAGE_SELECT} ${MESSAGE_FROM} ${where.sql()}
         ORDER BY m.created_at DESC, m.sequence DESC
         LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
        [...where.params, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total ${MESSAGE_FROM} ${where.sql()}`, where.params),
    ]);

    res.json({
      success: true,
      data: {
        messages: rows.rows.map(serializeMessage),
        total: count.rows[0].total,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/surveys
// ---------------------------------------------------------------------------

export const listSurveys = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const q = req.query as Record<string, unknown>;
    const { limit, offset } = parsePagination(q);
    const where = new WhereBuilder();

    const sessionId = parseUuidParam(q.sessionId, 'sessionId');
    if (sessionId) where.add((i) => `r.session_id = $${i}`, sessionId);

    const [rows, count] = await Promise.all([
      query(
        `SELECT ${SURVEY_SELECT} ${SURVEY_FROM} ${where.sql()}
         ORDER BY r.created_at DESC, r.question_id
         LIMIT $${where.params.length + 1} OFFSET $${where.params.length + 2}`,
        [...where.params, limit, offset]
      ),
      query(`SELECT COUNT(*)::int AS total ${SURVEY_FROM} ${where.sql()}`, where.params),
    ]);

    res.json({
      success: true,
      data: {
        responses: rows.rows.map(serializeSurveyResponse),
        total: count.rows[0].total,
        limit,
        offset,
      },
    });
  } catch (error) {
    next(error);
  }
};

// ---------------------------------------------------------------------------
// GET /api/admin/export?type=sessions|messages|surveys  (streamed CSV)
// ---------------------------------------------------------------------------

type ExportType = 'sessions' | 'messages' | 'surveys';

interface ExportSpec {
  columns: string[];
  /**
   * Keyset-paginated page query ordered by (created_at, id). Every page also selects
   * `created_at_cursor` = created_at::text so the cursor keeps Postgres' microsecond
   * precision. node-pg parses TIMESTAMPTZ into a JS Date, which only carries
   * milliseconds; feeding that back as the cursor is strictly below the real value, so
   * the last row of each page (and every row sharing its millisecond) is emitted again —
   * or, when a whole page shares one millisecond, the export never terminates.
   */
  pageSql: (withCursor: boolean) => string;
  /** Values for the cursor placeholders ($2..) in pageSql, taken from the last row of a page. */
  cursorValues: (last: any) => unknown[];
  toRow: (row: any) => unknown[];
}

const EXPORT_BATCH_SIZE = 1000;

/** Keyset cursor: the ordered column values of the last emitted row (timestamps as lossless ::text). */
type ExportCursor = unknown[];

function cursorWhere(alias: string): string {
  return `WHERE (${alias}.created_at, ${alias}.id) > ($2::timestamptz, $3::uuid)`;
}

const EXPORT_SPECS: Record<ExportType, ExportSpec> = {
  sessions: {
    columns: [
      'id', 'external_id', 'agent_condition_id', 'agent_code', 'emotional_intelligence',
      'cognitive_intelligence', 'context_id', 'context_code', 'interaction_count', 'is_locked',
      'survey_completed', 'completion_code', 'model', 'prompt_version', 'created_at', 'locked_at',
      'completed_at',
    ],
    pageSql: (withCursor) => `
      SELECT ${SESSION_SELECT}, ac.emotional_intelligence, ac.cognitive_intelligence,
             s.created_at::text AS created_at_cursor
      ${SESSION_FROM}
      ${withCursor ? cursorWhere('s') : ''}
      ORDER BY s.created_at, s.id
      LIMIT $1`,
    cursorValues: (last) => [String(last.created_at_cursor), String(last.id)],
    toRow: (r) => [
      r.id, r.external_id, r.agent_condition_id, r.agent_code, r.emotional_intelligence,
      r.cognitive_intelligence, r.context_id, r.context_code, r.interaction_count, r.is_locked,
      r.survey_completed, r.completion_code, r.model, r.prompt_version, r.created_at, r.locked_at,
      r.completed_at,
    ],
  },
  messages: {
    columns: [
      'id', 'session_id', 'agent_code', 'context_code', 'sequence', 'role', 'content',
      'is_fallback', 'client_message_id', 'created_at',
    ],
    // Ordered by session start, then transcript order. A participant message and the
    // agent reply are written in one transaction and Postgres' now() is transaction-stable,
    // so ordering by the message timestamp alone would put the reply before the message
    // ~half the time. (session_id, sequence) is UNIQUE, so the 3-column keyset is total.
    pageSql: (withCursor) => `
      SELECT ${MESSAGE_SELECT}, s.created_at::text AS session_created_at_cursor
      ${MESSAGE_FROM}
      ${withCursor ? 'WHERE (s.created_at, m.session_id, m.sequence) > ($2::timestamptz, $3::uuid, $4::int)' : ''}
      ORDER BY s.created_at, m.session_id, m.sequence
      LIMIT $1`,
    cursorValues: (last) => [String(last.session_created_at_cursor), String(last.session_id), Number(last.sequence)],
    toRow: (r) => [
      r.id, r.session_id, r.agent_code, r.context_code, r.sequence, r.role, r.content,
      r.is_fallback, r.client_message_id, r.created_at,
    ],
  },
  surveys: {
    columns: [
      'id', 'session_id', 'agent_code', 'context_code', 'completion_code', 'question_id',
      'response_value', 'created_at',
    ],
    pageSql: (withCursor) => `
      SELECT ${SURVEY_SELECT}, r.created_at::text AS created_at_cursor
      ${SURVEY_FROM}
      ${withCursor ? cursorWhere('r') : ''}
      ORDER BY r.created_at, r.id
      LIMIT $1`,
    cursorValues: (last) => [String(last.created_at_cursor), String(last.id)],
    toRow: (r) => [
      r.id, r.session_id, r.agent_code, r.context_code, r.completion_code, r.question_id,
      r.response_value, r.created_at,
    ],
  },
};

/** Leading characters that make Excel / LibreOffice evaluate an imported cell (OWASP CSV injection). */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/**
 * One CSV field. RFC 4180: quote fields containing a quote, comma, CR or LF; double
 * embedded quotes. In addition, a STRING that a spreadsheet would evaluate as a formula
 * (leading = + - @ TAB CR) is prefixed with a single quote and force-quoted, so content
 * typed by a participant (message content, clientMessageId, the ?rid= externalId) can
 * never execute when a researcher opens the export. Numbers, booleans and dates cannot
 * carry formulas and are emitted unchanged.
 */
export function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text: string;
  let forceQuote = false;
  if (value instanceof Date) {
    text = value.toISOString();
  } else if (typeof value === 'boolean') {
    text = value ? 'true' : 'false';
  } else if (typeof value === 'string') {
    text = value;
    if (FORMULA_LEAD.test(text)) {
      text = `'${text}`;
      forceQuote = true;
    }
  } else {
    text = String(value);
  }
  if (forceQuote || /[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function csvLine(values: unknown[]): string {
  return values.map(csvField).join(',') + '\r\n';
}

async function writeChunk(res: Response, chunk: string): Promise<void> {
  if (res.destroyed) return;
  if (!res.write(chunk)) {
    await new Promise<void>((resolve) => {
      const done = () => {
        res.off('drain', done);
        res.off('close', done);
        resolve();
      };
      res.once('drain', done);
      res.once('close', done);
    });
  }
}

export const exportCsv = async (
  req: AdminRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const type = req.query.type;
  if (typeof type !== 'string' || !(type in EXPORT_SPECS)) {
    next(new ValidationError('type must be one of sessions, messages, surveys'));
    return;
  }
  const spec = EXPORT_SPECS[type as ExportType];
  const date = new Date().toISOString().slice(0, 10);

  res.status(200);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="study2-${type}-${date}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.flushHeaders();

  try {
    await writeChunk(res, csvLine(spec.columns));

    let cursor: ExportCursor | null = null;
    for (;;) {
      if (res.destroyed) break;
      const page: QueryResult<any> = cursor
        ? await query(spec.pageSql(true), [EXPORT_BATCH_SIZE, ...cursor])
        : await query(spec.pageSql(false), [EXPORT_BATCH_SIZE]);

      if (page.rows.length === 0) break;

      let chunk = '';
      for (const row of page.rows) {
        chunk += csvLine(spec.toRow(row));
      }
      await writeChunk(res, chunk);

      const last: any = page.rows[page.rows.length - 1];
      const next: ExportCursor = spec.cursorValues(last);
      if (cursor && JSON.stringify(next) === JSON.stringify(cursor)) {
        // Impossible with a lossless cursor; guards against ever streaming forever.
        throw new Error(`CSV export cursor did not advance (${type})`);
      }
      cursor = next;
      if (page.rows.length < EXPORT_BATCH_SIZE) break;
    }

    res.end();
  } catch (error) {
    // Headers are already sent; the error handler will terminate the response.
    next(error);
  }
};
