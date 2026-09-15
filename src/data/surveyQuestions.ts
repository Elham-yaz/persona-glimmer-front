import { SurveyQuestion } from '@/types';

/**
 * Post-chat survey instrument (16 items, 7-point Likert: 1 = Strongly disagree,
 * 7 = Strongly agree), supplied by the research team on 2026-09-14 and mirrored
 * by the backend `survey_questions` seed (version 2.0). Ids post-1 … post-16 are
 * what the backend validates against, and the order is mandated by the
 * researchers — do not reorder or renumber.
 *
 * `category` is analysis metadata only (Satisfaction, Compliance intention,
 * AI preference, Perceived emotional intelligence, Perceived cognitive
 * intelligence, Realism, Engagement). It must never be displayed: the
 * researchers' instrument shows no category labels, and an EI/CI-labelled
 * heading would prime the very perception the items measure.
 */
export const postChatSurveyInstruction =
  'Please indicate the extent to which you agree with the following statements about the AI agent you interacted with during the service recovery.';

export const postChatSurveyQuestions: SurveyQuestion[] = [
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
