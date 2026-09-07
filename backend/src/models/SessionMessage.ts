import { PoolClient } from 'pg';
import { Queryable, db } from './db';

export type MessageRole = 'user' | 'agent';

export interface SessionMessage {
  id: string;
  session_id: string;
  sequence: number;
  role: MessageRole;
  content: string;
  is_fallback: boolean;
  client_message_id: string | null;
  created_at: Date;
}

export interface SessionMessagePublic {
  id: string;
  sequence: number;
  role: MessageRole;
  content: string;
  createdAt: Date;
}

export interface InsertMessageData {
  sessionId: string;
  sequence: number;
  role: MessageRole;
  content: string;
  clientMessageId?: string | null;
  isFallback?: boolean;
}

export class SessionMessageModel {
  static async insert(client: PoolClient, data: InsertMessageData): Promise<SessionMessage> {
    const result = await client.query(
      `INSERT INTO session_messages (session_id, sequence, role, content, is_fallback, client_message_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        data.sessionId,
        data.sequence,
        data.role,
        data.content,
        data.isFallback ?? false,
        data.clientMessageId ?? null,
      ]
    );
    return result.rows[0] as SessionMessage;
  }

  static async findBySession(sessionId: string, client?: Queryable): Promise<SessionMessage[]> {
    const result = await db(client).query(
      `SELECT * FROM session_messages WHERE session_id = $1 ORDER BY sequence ASC`,
      [sessionId]
    );
    return result.rows as SessionMessage[];
  }

  static async findByClientMessageId(
    sessionId: string,
    clientMessageId: string,
    client?: Queryable
  ): Promise<SessionMessage | null> {
    const result = await db(client).query(
      `SELECT * FROM session_messages WHERE session_id = $1 AND client_message_id = $2`,
      [sessionId, clientMessageId]
    );
    return (result.rows[0] as SessionMessage) || null;
  }

  static async findBySequence(
    sessionId: string,
    sequence: number,
    client?: Queryable
  ): Promise<SessionMessage | null> {
    const result = await db(client).query(
      `SELECT * FROM session_messages WHERE session_id = $1 AND sequence = $2`,
      [sessionId, sequence]
    );
    return (result.rows[0] as SessionMessage) || null;
  }

  static toPublic(message: SessionMessage): SessionMessagePublic {
    return {
      id: message.id,
      sequence: message.sequence,
      role: message.role,
      content: message.content,
      createdAt: message.created_at,
    };
  }
}
