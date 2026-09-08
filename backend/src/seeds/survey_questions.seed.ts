import { Pool } from 'pg';
import pool from '../config/database';

/**
 * Post-chat survey items. Text and category are copied VERBATIM from
 * src/data/mockData.ts (postTopicSurveyQuestions) at baseline commit 4116767.
 *
 * NOTE (open researcher decision — see docs/STUDY2_PLAN.md, launch checklist):
 * post-6 ("resolved my issue") and post-10 ("sharing my concerns") presuppose a
 * service issue, which the no-issue informational control context (context 3)
 * does not have. Items are deliberately held constant across all contexts until
 * the researcher decides to keep, reword, or condition them; do not reword here
 * without that sign-off.
 */
export const SURVEY_VERSION = '1.0';

export const surveyQuestions = [
  { id: 'post-1', text: 'The agent understood my questions and concerns.', category: 'Understanding' },
  { id: 'post-2', text: 'The agent provided helpful and relevant information.', category: 'Helpfulness' },
  { id: 'post-3', text: 'The agent communicated in a clear and understandable way.', category: 'Clarity' },
  { id: 'post-4', text: 'The agent showed empathy towards my situation.', category: 'Empathy' },
  { id: 'post-5', text: 'I felt the agent was professional throughout the conversation.', category: 'Professionalism' },
  { id: 'post-6', text: 'The agent resolved my issue to my satisfaction.', category: 'Resolution' },
  { id: 'post-7', text: 'I would interact with this agent again for future inquiries.', category: 'Future Intent' },
  { id: 'post-8', text: 'The response time during the conversation was acceptable.', category: 'Efficiency' },
  { id: 'post-9', text: 'The agent provided accurate information.', category: 'Accuracy' },
  { id: 'post-10', text: 'I felt comfortable sharing my concerns with the agent.', category: 'Comfort' },
  { id: 'post-11', text: 'The agent anticipated my needs before I expressed them.', category: 'Proactivity' },
  { id: 'post-12', text: 'The conversation felt natural and human-like.', category: 'Naturalness' },
  { id: 'post-13', text: 'The agent handled any confusion or misunderstanding well.', category: 'Error Handling' },
  { id: 'post-14', text: 'I trust the information provided by the agent.', category: 'Trust' },
  { id: 'post-15', text: 'The overall experience met my expectations.', category: 'Satisfaction' },
  { id: 'post-16', text: 'I would recommend this service to others.', category: 'Recommendation' },
];

export async function seedSurveyQuestions(db: Pool = pool): Promise<void> {
  for (const [index, question] of surveyQuestions.entries()) {
    await db.query(
      `INSERT INTO survey_questions (question_id, text, category, position, version)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (question_id) DO UPDATE SET
         text = EXCLUDED.text,
         category = EXCLUDED.category,
         position = EXCLUDED.position,
         version = EXCLUDED.version`,
      [question.id, question.text, question.category, index + 1, SURVEY_VERSION]
    );
  }
}
