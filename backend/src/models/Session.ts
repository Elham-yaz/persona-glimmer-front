import { PoolClient } from 'pg';
import { Queryable, db } from './db';

export interface Session {
  id: string;
  agent_condition_id: number;
  context_id: number;
  external_id: string | null;
  interaction_count: number;
  is_locked: boolean;
  survey_completed: boolean;
  completion_code: number | null;
  model: string;
  prompt_version: string;
  created_at: Date;
  locked_at: Date | null;
  completed_at: Date | null;
  updated_at: Date;
}

export interface CreateSessionData {
  agentConditionId: number;
  contextId: number;
  externalId: string | null;
  model: string;
  promptVersion: string;
}

export interface CellCount {
  agent_condition_id: number;
  context_id: number;
  started: number;
}

export class SessionModel {
  static async create(data: CreateSessionData, client?: Queryable): Promise<Session> {
    const result = await db(client).query(
      `INSERT INTO sessions (agent_condition_id, context_id, external_id, model, prompt_version)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [data.agentConditionId, data.contextId, data.externalId, data.model, data.promptVersion]
    );
    return result.rows[0] as Session;
  }

  static async findById(id: string, client?: Queryable): Promise<Session | null> {
    const result = await db(client).query('SELECT * FROM sessions WHERE id = $1', [id]);
    return (result.rows[0] as Session) || null;
  }

  /** Lock the session row for the rest of the transaction. */
  static async lockForUpdate(client: PoolClient, id: string): Promise<Session | null> {
    const result = await client.query('SELECT * FROM sessions WHERE id = $1 FOR UPDATE', [id]);
    return (result.rows[0] as Session) || null;
  }

  /**
   * Increment the interaction counter (caller holds the row lock).
   * Locks the session when the new count reaches `maxInteractions`.
   */
  static async incrementInteraction(
    client: PoolClient,
    id: string,
    maxInteractions: number
  ): Promise<Session> {
    const result = await client.query(
      `UPDATE sessions
       SET interaction_count = interaction_count + 1,
           is_locked = (interaction_count + 1 >= $2),
           locked_at = CASE
             WHEN interaction_count + 1 >= $2 AND locked_at IS NULL THEN NOW()
             ELSE locked_at
           END
       WHERE id = $1
       RETURNING *`,
      [id, maxInteractions]
    );
    return result.rows[0] as Session;
  }

  static async markSurveyCompleted(client: PoolClient, id: string): Promise<Session> {
    const result = await client.query(
      `UPDATE sessions
       SET survey_completed = TRUE,
           completed_at = COALESCE(completed_at, NOW())
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0] as Session;
  }

  /**
   * Number of started sessions for every (agent condition x context) cell,
   * including cells with zero sessions.
   */
  static async countStartedPerCell(client?: Queryable): Promise<CellCount[]> {
    const result = await db(client).query(
      `SELECT ac.id AS agent_condition_id,
              c.id AS context_id,
              COUNT(s.id)::int AS started
       FROM agent_conditions ac
       CROSS JOIN contexts c
       LEFT JOIN sessions s
         ON s.agent_condition_id = ac.id AND s.context_id = c.id
       GROUP BY ac.id, c.id
       ORDER BY ac.id, c.id`
    );
    return result.rows as CellCount[];
  }
}
