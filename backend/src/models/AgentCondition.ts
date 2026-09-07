import { Queryable, db } from './db';

export type IntelligenceLevel = 'low' | 'high';

export interface AgentCondition {
  id: number;
  code: string;
  emotional_intelligence: IntelligenceLevel;
  cognitive_intelligence: IntelligenceLevel;
  display_name: string;
  system_prompt_template: string;
  created_at: Date;
  updated_at: Date;
}

/** The only agent information ever exposed to participants. */
export interface AgentConditionPublic {
  displayName: string;
}

export class AgentConditionModel {
  static async findById(id: number, client?: Queryable): Promise<AgentCondition | null> {
    const result = await db(client).query('SELECT * FROM agent_conditions WHERE id = $1', [id]);
    return (result.rows[0] as AgentCondition) || null;
  }

  static async findAll(client?: Queryable): Promise<AgentCondition[]> {
    const result = await db(client).query('SELECT * FROM agent_conditions ORDER BY id');
    return result.rows as AgentCondition[];
  }

  static toPublic(condition: AgentCondition): AgentConditionPublic {
    return { displayName: condition.display_name };
  }
}
