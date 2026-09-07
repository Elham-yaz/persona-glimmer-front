import { Queryable, db } from './db';

export interface GlobalGuardrail {
  id: number;
  title: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export class GlobalGuardrailModel {
  /** The singleton row (id = 1), or null if not seeded. */
  static async find(client?: Queryable): Promise<GlobalGuardrail | null> {
    const result = await db(client).query('SELECT * FROM global_guardrails WHERE id = 1');
    return (result.rows[0] as GlobalGuardrail) || null;
  }
}
