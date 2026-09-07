import { Router, Request, Response, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { areRateLimitsDisabled } from '../config/study';
import {
  requireAdmin,
  verifyAdminKey,
  getDashboard,
  listSessions,
  getSession,
  listMessages,
  listSurveys,
  exportCsv,
} from '../controllers/admin.controller';

// Rate limiting for admin endpoints — also throttles brute-forcing of the API key,
// since failed (401) attempts count against the limit
const adminRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => areRateLimitsDisabled(),
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: { message: 'Too many admin requests, please try again later.', code: 'RATE_LIMITED' },
    });
  },
});

const router = Router();

// All admin routes are rate-limited, read-only, and require the admin API key
router.use(adminRateLimiter);
router.use(requireAdmin as RequestHandler);

// Key verification (used by the admin dashboard login form)
router.get('/verify', verifyAdminKey as RequestHandler);

// Totals + 4x3 cell grid
router.get('/dashboard', getDashboard as RequestHandler);

// Sessions (?limit&offset&agentConditionId&contextId&status=in_progress|locked|completed)
router.get('/sessions', listSessions as RequestHandler);
router.get('/sessions/:id', getSession as RequestHandler);

// Messages (?limit&offset&sessionId&agentConditionId&contextId)
router.get('/messages', listMessages as RequestHandler);

// Survey responses (?limit&offset&sessionId)
router.get('/surveys', listSurveys as RequestHandler);

// Streamed CSV export (?type=sessions|messages|surveys)
router.get('/export', exportCsv as RequestHandler);

export default router;
