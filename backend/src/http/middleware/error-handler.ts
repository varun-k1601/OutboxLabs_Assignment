import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } });
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  // body-parser errors (bad JSON, body too large) come with their own status
  const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
  if (status < 500) {
    res.status(status).json({ error: { code: 'BAD_REQUEST', message: err.message ?? 'Bad request' } });
    return;
  }
  logger.error({ err, method: req.method, path: req.path }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
