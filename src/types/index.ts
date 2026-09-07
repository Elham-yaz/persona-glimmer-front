// Shared frontend types for Study 2 (single anonymous session).
// Shapes mirror docs/STUDY2_API.md — the backend contract is authoritative.

// ---------------------------------------------------------------------------
// Participant session API (docs/STUDY2_API.md §1)
// ---------------------------------------------------------------------------

export type MessageRole = 'user' | 'agent';

export interface ChatMessage {
  id: string;
  sequence: number;
  role: MessageRole;
  content: string;
  createdAt: string;
}

export interface SessionAgent {
  /** The only agent attribute ever shown to participants. */
  displayName: string;
}

export type ScenarioType = 'utilitarian' | 'hedonic' | 'informational';

export interface SessionContext {
  id: number;
  code: string;
  title: string;
  scenarioType: ScenarioType;
  /** Shown to the participant and auto-sent as their first message (D4). */
  participantScenario: string;
}

export interface SessionState {
  sessionId: string;
  agent: SessionAgent;
  context: SessionContext;
  openingMessage: string;
  maxInteractions: number;
  interactionCount: number;
  isLocked: boolean;
  surveyCompleted: boolean;
  completionCode: number | null;
  messages: ChatMessage[];
}

export interface ForcedAssignment {
  agentConditionId: number;
  contextId: number;
}

export interface CreateSessionRequest {
  externalId?: string;
  force?: ForcedAssignment;
}

export interface SendMessageRequest {
  clientMessageId: string;
  content: string;
}

export interface SendMessageResult {
  userMessage: ChatMessage;
  agentMessage: ChatMessage;
  interactionCount: number;
  isLocked: boolean;
  shouldShowSurvey: boolean;
}

export interface SurveyQuestion {
  id: string;
  text: string;
  category?: string;
}

export interface SurveyResponse {
  questionId: string;
  value: number; // 1-7 Likert scale
}

export interface SurveySubmitResult {
  completionCode: number;
  alreadyCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Admin API (docs/STUDY2_API.md §2)
// ---------------------------------------------------------------------------

export type SessionStatus = 'in_progress' | 'locked' | 'completed';

export interface AdminDashboardTotals {
  sessions: number;
  completed: number;
  locked: number;
  inProgress: number;
  messages: number;
  surveyResponses: number;
}

export interface AdminCellCount {
  agentConditionId: number;
  agentCode: string;
  contextId: number;
  contextCode: string;
  started: number;
  completed: number;
}

export interface AdminDashboardData {
  totals: AdminDashboardTotals;
  cells: AdminCellCount[];
  assignmentMode: string;
}

export interface AdminSession {
  id: string;
  externalId: string | null;
  agentConditionId: number;
  agentCode: string;
  contextId: number;
  contextCode: string;
  interactionCount: number;
  isLocked: boolean;
  surveyCompleted: boolean;
  completionCode: number | null;
  model: string;
  promptVersion: string;
  createdAt: string;
  lockedAt: string | null;
  completedAt: string | null;
}

export interface AdminSessionMessage {
  id: string;
  sessionId?: string;
  sequence: number;
  role: MessageRole;
  content: string;
  isFallback?: boolean;
  createdAt: string;
}

export interface AdminSessionSurveyResponse {
  id?: string;
  questionId: string;
  responseValue: number;
  createdAt?: string;
}

export interface AdminSessionDetail extends AdminSession {
  messages: AdminSessionMessage[];
  surveyResponses: AdminSessionSurveyResponse[];
}

export interface AdminSessionsQuery {
  limit?: number;
  offset?: number;
  agentConditionId?: number;
  contextId?: number;
  status?: SessionStatus;
}

export interface AdminMessage {
  id: string;
  sessionId: string;
  sequence: number;
  role: MessageRole;
  content: string;
  isFallback: boolean;
  createdAt: string;
  agentCode: string;
  contextCode: string;
}

export interface AdminMessagesQuery {
  limit?: number;
  offset?: number;
  sessionId?: string;
  agentConditionId?: number;
  contextId?: number;
}

export interface AdminSurveyResponse {
  id: string;
  sessionId: string;
  questionId: string;
  responseValue: number;
  createdAt: string;
  agentCode: string;
  contextCode: string;
  completionCode: number | null;
}

export interface AdminSurveysQuery {
  limit?: number;
  offset?: number;
  sessionId?: string;
}

export type AdminExportType = 'sessions' | 'messages' | 'surveys';
