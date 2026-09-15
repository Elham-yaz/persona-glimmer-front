import { Pool } from 'pg';
import pool from '../config/database';

/**
 * Post-chat survey instrument, version '2.0' (researchers' instrument, transcribed from
 * their screenshot on 2026-09-14; supersedes the '1.0' items that were copied from
 * src/data/mockData.ts at baseline commit 4116767).
 *
 * - ids stay post-1..post-16 and the ORDER IS MANDATED by the researchers: position = list index + 1.
 * - Scale is unchanged: 1 = Strongly disagree ... 7 = Strongly agree (config/study.ts).
 * - `category` is ANALYSIS METADATA ONLY. It must never be shown to participants: the
 *   researchers' instrument displays no category labels, and EI/CI-labelled headings
 *   would prime participants.
 * - Instruction sentence shown above the items (rendered by the frontend):
 *   "Please indicate the extent to which you agree with the following statements about the
 *    AI agent you interacted with during the service recovery."
 * - Trailing periods were normalized for consistency; the wording is otherwise verbatim.
 *
 * Exported sessions can be split by instrument via survey_questions.version ('1.0' vs '2.0')
 * together with sessions.prompt_version ('2.2' introduced this instrument).
 */
export const SURVEY_VERSION = '2.0';

export const surveyQuestions = [
  { id: 'post-1', text: "I am satisfied with the AI agent's help regarding my problem.", category: 'Satisfaction' },
  { id: 'post-2', text: "I am satisfied with the AI agent's responses to my problem.", category: 'Satisfaction' },
  { id: 'post-3', text: "It's likely that I follow the steps suggested by the agent.", category: 'Compliance intention' },
  { id: 'post-4', text: 'If I experience the same problem again, I would prefer to interact with an AI agent rather than a human service representative.', category: 'AI preference' },
  { id: 'post-5', text: 'The AI agent accurately recognized how I was feeling about the service problem.', category: 'Perceived emotional intelligence' },
  { id: 'post-6', text: 'The AI agent showed a clear understanding of why the situation was emotionally frustrating or upsetting for me.', category: 'Perceived emotional intelligence' },
  { id: 'post-7', text: 'The AI agent responded to my emotions in a way that felt appropriate to the situation.', category: 'Perceived emotional intelligence' },
  { id: 'post-8', text: 'The AI agent helped reduce my negative emotions (e.g., frustration, anger, disappointment) during the interaction.', category: 'Perceived emotional intelligence' },
  { id: 'post-9', text: 'The AI agent used my emotional cues to guide how it handled the service recovery.', category: 'Perceived emotional intelligence' },
  { id: 'post-10', text: 'The AI provided accurate and factually correct information in response to my service issue.', category: 'Perceived cognitive intelligence' },
  { id: 'post-11', text: 'The AI effectively solved or helped resolve the problem I encountered.', category: 'Perceived cognitive intelligence' },
  { id: 'post-12', text: "The AI's responses were logically reasoned and made sense in context.", category: 'Perceived cognitive intelligence' },
  { id: 'post-13', text: 'The AI adapted its responses based on the details of my situation.', category: 'Perceived cognitive intelligence' },
  { id: 'post-14', text: 'The AI handled the task quickly and competently without unnecessary delays.', category: 'Perceived cognitive intelligence' },
  { id: 'post-15', text: 'My experience with the AI agent felt realistic.', category: 'Realism' },
  { id: 'post-16', text: 'I engaged with the task seriously.', category: 'Engagement' },
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
