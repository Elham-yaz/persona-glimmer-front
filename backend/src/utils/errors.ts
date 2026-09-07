export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', code: string = 'AUTHENTICATION_ERROR') {
    super(401, message, code);
    this.name = 'AuthenticationError';
  }
}

/** Authorization: Bearer <sessionId> missing, malformed, or unknown. */
export class SessionInvalidError extends AuthenticationError {
  constructor(message: string = 'Invalid or unknown session') {
    super(message, 'SESSION_INVALID');
    this.name = 'SessionInvalidError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code: string = 'CONFLICT') {
    super(409, message, code);
    this.name = 'ConflictError';
  }
}

/** The language model did not return a usable reply; nothing was persisted. */
export class AgentUnavailableError extends AppError {
  constructor() {
    super(
      502,
      'The agent is temporarily unavailable. Please try sending your message again.',
      'AGENT_UNAVAILABLE'
    );
    this.name = 'AgentUnavailableError';
  }
}
