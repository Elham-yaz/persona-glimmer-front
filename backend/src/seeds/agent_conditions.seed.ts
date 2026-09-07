import { Pool } from 'pg';
import pool from '../config/database';

/**
 * The four agent conditions of the 2x2 design. All four share one neutral display name and
 * one context-agnostic base persona; the EI/CI manipulation lives ONLY in the guidance blocks
 * that services/agent.service.ts appends (there is deliberately no EI/CI wording below).
 */

export const AGENT_DISPLAY_NAME = 'Alex';

export const SHARED_SYSTEM_PROMPT_TEMPLATE = `You are Alex, a customer support agent for the company the customer is contacting. You are chatting with a customer through the company's online support chat.

Speak in the first person as Alex, in natural, conversational English. Everything you say about the company's policies, records, options, and remedies must come from the reference information you are given. The customer's first message describes their situation; your job is to help them with that situation from their first message onward.`;

export const agentConditions = [
  { id: 1, code: 'hiEI_hiCI', emotional_intelligence: 'high', cognitive_intelligence: 'high' },
  { id: 2, code: 'hiEI_loCI', emotional_intelligence: 'high', cognitive_intelligence: 'low' },
  { id: 3, code: 'loEI_hiCI', emotional_intelligence: 'low', cognitive_intelligence: 'high' },
  { id: 4, code: 'loEI_loCI', emotional_intelligence: 'low', cognitive_intelligence: 'low' },
] as const;

export async function seedAgentConditions(db: Pool = pool): Promise<void> {
  for (const condition of agentConditions) {
    await db.query(
      `INSERT INTO agent_conditions
         (id, code, emotional_intelligence, cognitive_intelligence, display_name, system_prompt_template)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         code = EXCLUDED.code,
         emotional_intelligence = EXCLUDED.emotional_intelligence,
         cognitive_intelligence = EXCLUDED.cognitive_intelligence,
         display_name = EXCLUDED.display_name,
         system_prompt_template = EXCLUDED.system_prompt_template,
         updated_at = NOW()`,
      [
        condition.id,
        condition.code,
        condition.emotional_intelligence,
        condition.cognitive_intelligence,
        AGENT_DISPLAY_NAME,
        SHARED_SYSTEM_PROMPT_TEMPLATE,
      ]
    );
  }
}
