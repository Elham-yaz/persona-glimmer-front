import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PoolClient } from 'pg';
import { withTransaction } from '../config/database';
import {
  MAX_INTERACTIONS,
  PROMPT_VERSION,
  SURVEY_MAX_VALUE,
  SURVEY_MIN_VALUE,
  SURVEY_QUESTION_IDS,
} from '../config/study';
import { SessionRequest } from '../middleware/session.middleware';
import { AgentConditionModel } from '../models/AgentCondition';
import { ContextModel } from '../models/Context';
import { GlobalGuardrailModel } from '../models/GlobalGuardrail';
import { Session, SessionModel } from '../models/Session';
import { SessionMessage, SessionMessageModel, SessionMessagePublic } from '../models/SessionMessage';
import { SessionSurveyResponseModel, SurveyAnswer } from '../models/SessionSurveyResponse';
import { AgentService } from '../services/agent.service';
import { AssignmentService } from '../services/assignment.service';
import { AgentReply, OpenAIService } from '../services/openai.service';
import { assignUniqueCompletionCode } from '../utils/completionCode';
import {
  AgentUnavailableError,
  ConflictError,
  SessionInvalidError,
  ValidationError,
} from '../utils/errors';
import { sanitizeMessageContent, sanitizeString } from '../utils/sanitize';

// ---------------------------------------------------------------------------
// Validation schemas (shape only; semantic checks happen in the handlers)
// ---------------------------------------------------------------------------

export const createSessionSchema = z.object({
  body: z
    .object({
      externalId: z.string().max(100, 'externalId must be at most 100 characters').nullable().optional(),
      force: z
        .object({
          agentConditionId: z.number().int().min(1).max(4),
          contextId: z.number().int().min(1).max(3),
        })
        .optional(),
    })
    .optional(),
});

export const sendMessageSchema = z.object({
  body: z.object({
    clientMessageId: z
      .string()
      .min(1, 'clientMessageId is required')
      .max(64, 'clientMessageId must be at most 64 characters'),
    content: z
      .string()
      .refine((s) => s.trim().length >= 1, 'content is required')
      .refine((s) => s.trim().length <= 5000, 'content must be at most 5000 characters'),
  }),
});

export const submitSurveySchema = z.object({
  body: z.object({
    responses: z
      .array(
        z.object({
          questionId: z.string().min(1).max(20),
          value: z.number().int(),
        })
      )
      .min(1)
      .max(100),
  }),
});

// ---------------------------------------------------------------------------
// Response builders
// ---------------------------------------------------------------------------

export interface SessionState {
  sessionId: string;
  agent: { displayName: string };
  context: {
    id: number;
    code: string;
    title: string;
    scenarioType: string;
    participantScenario: string;
  };
  openingMessage: string;
  maxInteractions: number;
  interactionCount: number;
  isLocked: boolean;
  surveyCompleted: boolean;
  completionCode: number | null;
  messages: SessionMessagePublic[];
}

export interface SendMessageResult {
  userMessage: SessionMessagePublic;
  agentMessage: SessionMessagePublic;
  interactionCount: number;
  isLocked: boolean;
  shouldShowSurvey: boolean;
}

async function buildSessionState(
  session: Session,
  messages?: SessionMessage[]
): Promise<SessionState> {
  const [condition, context, transcript] = await Promise.all([
    AgentConditionModel.findById(session.agent_condition_id),
    ContextModel.findById(session.context_id),
    messages ? Promise.resolve(messages) : SessionMessageModel.findBySession(session.id),
  ]);

  if (!condition || !context) {
    throw new Error(`Session ${session.id} references a missing agent condition or context`);
  }

  return {
    sessionId: session.id,
    agent: AgentConditionModel.toPublic(condition),
    context: ContextModel.toPublic(context),
    openingMessage: context.participant_scenario,
    maxInteractions: MAX_INTERACTIONS,
    interactionCount: session.interaction_count,
    isLocked: session.is_locked,
    surveyCompleted: session.survey_completed,
    completionCode: session.completion_code,
    messages: transcript.map(SessionMessageModel.toPublic),
  };
}

function buildSendMessageResult(
  userMessage: SessionMessage,
  agentMessage: SessionMessage,
  interactionCount: number,
  surveyCompleted: boolean
): SendMessageResult {
  const isLocked = interactionCount >= MAX_INTERACTIONS;
  return {
    userMessage: SessionMessageModel.toPublic(userMessage),
    agentMessage: SessionMessageModel.toPublic(agentMessage),
    interactionCount,
    isLocked,
    shouldShowSurvey: isLocked && !surveyCompleted,
  };
}

/**
 * If this clientMessageId was already processed, rebuild the original result
 * (user message + the agent reply that followed it). Returns null otherwise.
 */
async function findReplayResult(
  session: Session,
  clientMessageId: string,
  client?: PoolClient
): Promise<SendMessageResult | null> {
  const userMessage = await SessionMessageModel.findByClientMessageId(
    session.id,
    clientMessageId,
    client
  );
  if (!userMessage) return null;

  const agentMessage = await SessionMessageModel.findBySequence(
    session.id,
    userMessage.sequence + 1,
    client
  );
  if (!agentMessage) {
    // Cannot happen: both rows are written in one transaction.
    throw new Error(`Agent reply missing for message ${userMessage.id}`);
  }

  // The agent reply's sequence is 2 * interaction number.
  const interactionCountAtTheTime = agentMessage.sequence / 2;
  return buildSendMessageResult(
    userMessage,
    agentMessage,
    interactionCountAtTheTime,
    session.survey_completed
  );
}

function assertSessionAcceptsMessages(session: Session): void {
  if (session.survey_completed) {
    throw new ConflictError('This session has already been completed', 'SESSION_COMPLETED');
  }
  if (session.is_locked || session.interaction_count >= MAX_INTERACTIONS) {
    throw new ConflictError(
      'This session has reached the maximum number of interactions',
      'SESSION_LOCKED'
    );
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/** POST /api/sessions — create an anonymous session with a random (or balanced) assignment. */
export const createSession = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const body = (req.body ?? {}) as {
      externalId?: string | null;
      force?: { agentConditionId: number; contextId: number };
    };

    const externalId = body.externalId ? sanitizeString(body.externalId).slice(0, 100) || null : null;

    const session = await AssignmentService.createAssignedSession({
      externalId,
      model: OpenAIService.getModelName(),
      promptVersion: PROMPT_VERSION,
      force: body.force,
    });

    const state = await buildSessionState(session, []);
    res.status(201).json({ success: true, data: state });
  } catch (error) {
    next(error);
  }
};

/** GET /api/sessions/me — full state for resume. */
export const getMySession = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = req.session!;
    const state = await buildSessionState(session);
    res.json({ success: true, data: state });
  } catch (error) {
    next(error);
  }
};

/** POST /api/sessions/me/messages — one interaction: participant message + agent reply. */
export const sendMessage = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = req.session!;
    const { clientMessageId } = req.body as { clientMessageId: string; content: string };
    const content = sanitizeMessageContent(req.body.content);
    if (content.length === 0) {
      throw new ValidationError('content is required');
    }

    // 1. Idempotent replay: return the original result, write nothing.
    const replay = await findReplayResult(session, clientMessageId);
    if (replay) {
      res.json({ success: true, data: replay });
      return;
    }

    // 2. Fail fast on state before spending a model call.
    assertSessionAcceptsMessages(session);

    // 3. Assemble the prompt and generate the reply OUTSIDE any database lock.
    const [condition, context, guardrails, history] = await Promise.all([
      AgentConditionModel.findById(session.agent_condition_id),
      ContextModel.findById(session.context_id),
      GlobalGuardrailModel.find(),
      SessionMessageModel.findBySession(session.id),
    ]);
    if (!condition || !context) {
      throw new Error(`Session ${session.id} references a missing agent condition or context`);
    }

    const systemPrompt = AgentService.buildSystemPrompt(condition, context, guardrails);
    const promptMessages = AgentService.buildMessages(systemPrompt, history, content);
    let reply: AgentReply;
    try {
      reply = await OpenAIService.generateReply(promptMessages);
    } catch (error: any) {
      // Whatever went wrong with the model call, the participant gets a retryable 502
      // and nothing is persisted.
      if (!(error instanceof AgentUnavailableError)) {
        console.error('Agent reply generation failed:', error?.message ?? error);
      }
      throw new AgentUnavailableError();
    }

    // 4. Persist user message + agent reply + counter in ONE transaction under a row lock.
    const result = await withTransaction<SendMessageResult>(async (client) => {
      const locked = await SessionModel.lockForUpdate(client, session.id);
      if (!locked) {
        throw new SessionInvalidError('Unknown session');
      }

      // A concurrent retry with the same id may have won the race.
      const replayUnderLock = await findReplayResult(locked, clientMessageId, client);
      if (replayUnderLock) {
        return replayUnderLock;
      }

      assertSessionAcceptsMessages(locked);

      const userSequence = locked.interaction_count * 2 + 1;
      const userMessage = await SessionMessageModel.insert(client, {
        sessionId: locked.id,
        sequence: userSequence,
        role: 'user',
        content,
        clientMessageId,
      });
      const agentMessage = await SessionMessageModel.insert(client, {
        sessionId: locked.id,
        sequence: userSequence + 1,
        role: 'agent',
        content: reply.content,
        isFallback: false,
      });
      const updated = await SessionModel.incrementInteraction(client, locked.id, MAX_INTERACTIONS);

      return buildSendMessageResult(
        userMessage,
        agentMessage,
        updated.interaction_count,
        updated.survey_completed
      );
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

function validateSurveyAnswers(raw: Array<{ questionId: string; value: number }>): SurveyAnswer[] {
  const expectedIds = SURVEY_QUESTION_IDS;

  if (raw.length !== expectedIds.length) {
    throw new ValidationError(
      `Exactly ${expectedIds.length} responses are required (received ${raw.length})`
    );
  }

  const seen = new Set<string>();
  for (const answer of raw) {
    if (!expectedIds.includes(answer.questionId)) {
      throw new ValidationError(`Unknown questionId "${answer.questionId}"`);
    }
    if (seen.has(answer.questionId)) {
      throw new ValidationError(`Duplicate questionId "${answer.questionId}"`);
    }
    seen.add(answer.questionId);

    if (
      !Number.isInteger(answer.value) ||
      answer.value < SURVEY_MIN_VALUE ||
      answer.value > SURVEY_MAX_VALUE
    ) {
      throw new ValidationError(
        `Value for "${answer.questionId}" must be an integer between ${SURVEY_MIN_VALUE} and ${SURVEY_MAX_VALUE}`
      );
    }
  }

  return raw.map((answer) => ({ questionId: answer.questionId, value: answer.value }));
}

/** POST /api/sessions/me/survey — 16 responses, then a unique completion code (idempotent). */
export const submitSurvey = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const session = req.session!;
    const answers = validateSurveyAnswers(
      (req.body as { responses: Array<{ questionId: string; value: number }> }).responses
    );

    const result = await withTransaction(async (client) => {
      const locked = await SessionModel.lockForUpdate(client, session.id);
      if (!locked) {
        throw new SessionInvalidError('Unknown session');
      }

      if (locked.survey_completed) {
        return { completionCode: locked.completion_code, alreadyCompleted: true };
      }

      if (!locked.is_locked) {
        throw new ConflictError(
          `Complete all ${MAX_INTERACTIONS} interactions before submitting the survey`,
          'SESSION_NOT_LOCKED'
        );
      }

      for (const answer of answers) {
        await SessionSurveyResponseModel.upsert(client, locked.id, answer);
      }
      await SessionModel.markSurveyCompleted(client, locked.id);
      const completionCode = await assignUniqueCompletionCode(client, locked.id);

      return { completionCode, alreadyCompleted: false };
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
