import type { Request, RequestHandler } from 'express';
import { SESSION_COOKIE, verifySessionToken } from '../../auth/session';
import { AppError } from '../../lib/errors';

// Takes the session cookie (browser, after Google login) or the same token as a Bearer header
// (curl/Postman, see npm run token).
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.headers.authorization;
  const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  const token: string | undefined = req.cookies?.[SESSION_COOKIE] ?? bearer;
  const userId = token ? await verifySessionToken(token) : null;
  if (!userId) throw AppError.unauthorized();
  req.userId = userId;
  next();
};

export function userIdOf(req: Request): string {
  if (!req.userId) throw AppError.unauthorized();
  return req.userId;
}
