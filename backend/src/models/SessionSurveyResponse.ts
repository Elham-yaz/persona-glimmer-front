import { PoolClient } from 'pg';
import { Queryable, db } from './db';

export interface SessionSurveyResponse {
  id: string;
  session_id: string;
  question_id: string;
  response_value: number;
  created_at: Date;
}

export interface SurveyAnswer {
  questionId: string;
  value: number;
}

export class SessionSurveyResponseModel {
  /** Insert-or-update one answer (caller holds the session row lock). */
  static async upsert(
    client: PoolClient,
    sessionId: string,
    answer: SurveyAnswer
  ): Promise<SessionSurveyResponse> {
    const result = await client.query(
      `INSERT INTO session_survey_responses (session_id, question_id, response_value)
       VALUES ($1, $2, $3)
       ON CONFLICT (session_id, question_id)
       DO UPDATE SET response_value = EXCLUDED.response_value
       RETURNING *`,
      [sessionId, answer.questionId, answer.value]
    );
    return result.rows[0] as SessionSurveyResponse;
  }

  static async findBySession(
    sessionId: string,
    client?: Queryable
  ): Promise<SessionSurveyResponse[]> {
    const result = await db(client).query(
      `SELECT * FROM session_survey_responses WHERE session_id = $1 ORDER BY question_id`,
      [sessionId]
    );
    return result.rows as SessionSurveyResponse[];
  }
}
