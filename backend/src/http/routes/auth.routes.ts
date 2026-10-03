import { Router, type CookieOptions } from 'express';
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  signStateToken,
  verifyStateToken,
} from '../../auth/session';
import { env } from '../../config/env';
import { createGoogleAuthRequest, exchangeGoogleCode } from '../../integrations/google-oauth';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { usersRepository } from '../../repositories/users.repository';
import { senderService } from '../../services/sender.service';
import { toUserDto } from '../dto';
import { requireAuth, userIdOf } from '../middleware/auth';

const GOOGLE_STATE_COOKIE = 'ri_google_oauth';
const googleStateCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/api/auth',
  maxAge: 10 * 60 * 1000,
};

export const authRouter = Router();

// step 1: send the user to Google (auth code flow with PKCE + state)
authRouter.get('/google', async (_req, res) => {
  if (!env.googleAuthEnabled) {
    res.redirect(`${env.FRONTEND_URL}/login?error=google_not_configured`);
    return;
  }
  const request = await createGoogleAuthRequest();
  const stateCookie = await signStateToken('google', { nonce: request.nonce, cv: request.codeVerifier });
  res.cookie(GOOGLE_STATE_COOKIE, stateCookie, googleStateCookieOptions);
  res.redirect(request.url);
});

// step 2: Google sends them back here. Check state, exchange the code, create the session
authRouter.get('/google/callback', async (req, res) => {
  const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);
  const stateCookie: string | undefined = req.cookies?.[GOOGLE_STATE_COOKIE];
  res.clearCookie(GOOGLE_STATE_COOKIE, { path: googleStateCookieOptions.path });

  if (typeof req.query.error === 'string') return fail(req.query.error);
  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const stored = stateCookie ? await verifyStateToken<{ nonce?: string; cv?: string }>('google', stateCookie) : null;
  if (!code || !stored?.cv || stored.nonce !== state) return fail('invalid_state');

  let profile;
  try {
    profile = await exchangeGoogleCode(code, stored.cv);
  } catch (err) {
    logger.warn({ err }, 'Google sign-in failed');
    return fail('google_signin_failed');
  }

  const user = await usersRepository.upsertFromGoogle(profile);
  try {
    await senderService.ensureDefaultSender(user);
  } catch (err) {
    // not fatal, they can create a sender from the compose page
    logger.warn({ err, userId: user.id }, 'Could not provision a default sender');
  }

  res.cookie(SESSION_COOKIE, await createSessionToken(user.id), sessionCookieOptions);
  logger.info({ userId: user.id, email: user.email }, 'User signed in with Google');
  res.redirect(`${env.FRONTEND_URL}/dashboard`);
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await usersRepository.findById(userIdOf(req));
  if (!user) {
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    throw AppError.unauthorized();
  }
  res.json({ user: toUserDto(user) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: env.isProduction });
  res.status(204).end();
});
