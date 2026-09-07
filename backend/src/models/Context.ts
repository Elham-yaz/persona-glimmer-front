import { Queryable, db } from './db';

export type ScenarioType = 'utilitarian' | 'hedonic' | 'informational';

export interface Context {
  id: number;
  code: string;
  title: string;
  domain: string;
  scenario_type: ScenarioType;
  participant_scenario: string;
  agent_policy: string;
  created_at: Date;
  updated_at: Date;
}

/** Participant-facing view: never includes agent_policy. */
export interface ContextPublic {
  id: number;
  code: string;
  title: string;
  scenarioType: ScenarioType;
  participantScenario: string;
}

export class ContextModel {
  static async findById(id: number, client?: Queryable): Promise<Context | null> {
    const result = await db(client).query('SELECT * FROM contexts WHERE id = $1', [id]);
    return (result.rows[0] as Context) || null;
  }

  static async findAll(client?: Queryable): Promise<Context[]> {
    const result = await db(client).query('SELECT * FROM contexts ORDER BY id');
    return result.rows as Context[];
  }

  static toPublic(context: Context): ContextPublic {
    return {
      id: context.id,
      code: context.code,
      title: context.title,
      scenarioType: context.scenario_type,
      participantScenario: context.participant_scenario,
    };
  }
}
