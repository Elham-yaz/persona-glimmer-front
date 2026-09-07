import { Request, Response, NextFunction } from 'express';
import { Session, SessionModel } from '../models/Session';
import { SessionInvalidError } from '../utils/errors';

export interface SessionRequest extends Request {
  session?: Session;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Resolves `Authorization: Bearer <sessionId>` to req.session.
 * Missing, malformed, or unknown ids -> 401 SESSION_INVALID.
 */
export const requireSession = async (
  req: SessionRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new SessionInvalidError('Missing session credentials');
    }

    const sessionId = header.substring('Bearer '.length).trim();
    if (!isUuid(sessionId)) {
      throw new SessionInvalidError('Malformed session id');
    }

    const session = await SessionModel.findById(sessionId);
    if (!session) {
      throw new SessionInvalidError('Unknown session');
    }

    req.session = session;
    next();
  } catch (error) {
    next(error);
  }
};
