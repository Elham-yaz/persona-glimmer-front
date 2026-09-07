import { Router, Request, Response, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { areRateLimitsDisabled, getMessageLimitPerMinute, getSessionCreateLimitPerHour } from '../config/study';
import {
  createSession,
  createSessionSchema,
  getMySession,
  sendMessage,
  sendMessageSchema,
  submitSurvey,
  submitSurveySchema,
} from '../controllers/session.controller';
import { requireSession, SessionRequest } from '../middleware/session.middleware';
import { validate } from '../middleware/validation.middleware';

const rateLimitHandler = (req: Request, res: Response): void => {
  res.status(429).json({
    success: false,
    error: { message: 'Too many requests, please try again later.', code: 'RATE_LIMITED' },
  });
};

// POST /api/sessions: per IP per hour (default 60; env SESSION_CREATE_LIMIT_PER_HOUR).
// Read at request time so the limit can be raised without a code change when many
// participants share one public IP (labs, campus NAT).
const createSessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: () => getSessionCreateLimitPerHour(),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => areRateLimitsDisabled(),
  handler: rateLimitHandler,
});

// POST /api/sessions/me/messages: per session per minute (default 30; env MESSAGE_LIMIT_PER_MINUTE)
const messageLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: () => getMessageLimitPerMinute(),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `session:${(req as SessionRequest).session?.id ?? 'none'}`,
  skip: () => areRateLimitsDisabled(),
  handler: rateLimitHandler,
});

const router = Router();

router.post('/', createSessionLimiter, validate(createSessionSchema), createSession);
router.get('/me', requireSession as RequestHandler, getMySession as RequestHandler);
router.post(
  '/me/messages',
  requireSession as RequestHandler,
  messageLimiter,
  validate(sendMessageSchema),
  sendMessage as RequestHandler
);
router.post(
  '/me/survey',
  requireSession as RequestHandler,
  validate(submitSurveySchema),
  submitSurvey as RequestHandler
);

export default router;
