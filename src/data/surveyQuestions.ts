import { SurveyQuestion } from '@/types';

// Post-chat survey instrument (16 items, 7-point Likert). Item text and
// categories are verbatim from Study 1 and mirror backend `survey_questions`
// (version 1.0). Ids post-1 … post-16 are what the backend validates against.
export const postChatSurveyQuestions: SurveyQuestion[] = [
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
