import type { CookieOptions } from 'express';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env';

const secret = new TextEncoder().encode(env.SESSION_SECRET);
const ALGORITHM = 'HS256';

export const SESSION_COOKIE = 'ri_session';
export const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: env.isProduction,
  path: '/',
  maxAge: SESSION_TTL_SECONDS * 1000,
};

export async function createSessionToken(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: ALGORITHM })
    .setSubject(userId)
    .setAudience('session')
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secret);
}

// user id if the token is valid, otherwise null
export async function verifySessionToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: 'session', algorithms: [ALGORITHM] });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

// short-lived signed token for the OAuth state (Slack) and the state cookie (Google)
export async function signStateToken(purpose: string, claims: JWTPayload, ttl = '10m'): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM })
    .setAudience(`oauth:${purpose}`)
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(secret);
}

export async function verifyStateToken<T extends JWTPayload>(purpose: string, token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { audience: `oauth:${purpose}`, algorithms: [ALGORITHM] });
    return payload as T;
  } catch {
    return null;
  }
}
