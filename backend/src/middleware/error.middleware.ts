import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export const errorHandler = (
  err: Error | AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
): void => {
  if (res.headersSent) {
    // A streamed response (e.g. CSV export) already started; nothing sensible to send.
    console.error('Error after headers were sent:', err.message);
    res.destroy();
    return;
  }

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        message: err.message,
        code: err.code,
      },
    });
    return;
  }

  // Request body over the express.json limit (body-parser) -> 413 instead of 500
  if ((err as any).type === 'entity.too.large') {
    res.status(413).json({
      success: false,
      error: { message: 'Request body too large', code: 'PAYLOAD_TOO_LARGE' },
    });
    return;
  }

  // Malformed JSON body (body-parser) -> 400 instead of 500
  if ((err as any).type === 'entity.parse.failed') {
    res.status(400).json({
      success: false,
      error: { message: 'Malformed JSON request body', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  if (process.env.NODE_ENV === 'development') {
    console.error('Unhandled error:', err);
  } else {
    console.error('Unhandled error:', err.name, err.message);
  }

  const errorMessage = process.env.NODE_ENV === 'development'
    ? (err.message || 'Internal server error')
    : 'An unexpected error occurred. Please try again or contact support if the problem persists.';

  res.status(500).json({
    success: false,
    error: {
      message: errorMessage,
      code: 'INTERNAL_ERROR',
    },
  });
};
