import { randomBytes } from 'node:crypto';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { env } from '../config/env';
import type { GoogleProfile } from '../repositories/users.repository';

const client = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI,
});

export interface GoogleAuthRequest {
  url: string;
  // sent as `state` and checked on the way back (CSRF)
  nonce: string;
  // PKCE verifier, kept in a signed httpOnly cookie until the callback
  codeVerifier: string;
}

export async function createGoogleAuthRequest(): Promise<GoogleAuthRequest> {
  const { codeVerifier, codeChallenge } = await client.generateCodeVerifierAsync();
  const nonce = randomBytes(16).toString('hex');
  const url = client.generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    prompt: 'select_account',
    state: nonce,
    code_challenge: codeChallenge,
    code_challenge_method: CodeChallengeMethod.S256,
  });
  return { url, nonce, codeVerifier };
}

// swaps the code for tokens and verifies the ID token (signature, audience, expiry)
export async function exchangeGoogleCode(code: string, codeVerifier: string): Promise<GoogleProfile> {
  const { tokens } = await client.getToken({ code, codeVerifier });
  if (!tokens.id_token) throw new Error('Google did not return an ID token');

  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) throw new Error('Google ID token is missing the subject or email');
  if (payload.email_verified === false) throw new Error('Google account email is not verified');

  return {
    googleId: payload.sub,
    email: payload.email,
    name: payload.name ?? payload.email,
    avatarUrl: payload.picture ?? null,
  };
}
