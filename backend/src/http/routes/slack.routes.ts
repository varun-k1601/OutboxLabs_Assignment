import { Router } from 'express';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { slackService } from '../../services/slack.service';
import { requireAuth, userIdOf } from '../middleware/auth';

export const slackRouter = Router();

slackRouter.get('/status', requireAuth, async (req, res) => {
  res.json(await slackService.getStatus(userIdOf(req)));
});

// returns the Slack authorize URL, the frontend redirects to it
slackRouter.post('/install', requireAuth, async (req, res) => {
  res.json({ url: await slackService.createAuthorizeUrl(userIdOf(req)) });
});

// Slack sends the user back here after they approve or cancel
slackRouter.get('/callback', async (req, res) => {
  const backToDashboard = (outcome: string) => res.redirect(`${env.FRONTEND_URL}/dashboard?slack=${outcome}`);
  if (typeof req.query.error === 'string') return backToDashboard(req.query.error === 'access_denied' ? 'cancelled' : 'error');

  const code = typeof req.query.code === 'string' ? req.query.code : '';
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  if (!code || !state) return backToDashboard('error');
  try {
    await slackService.completeOAuth(code, state);
    return backToDashboard('connected');
  } catch (err) {
    logger.warn({ err }, 'Slack OAuth callback failed');
    return backToDashboard('error');
  }
});

slackRouter.post('/test', requireAuth, async (req, res) => {
  await slackService.sendTestMessage(userIdOf(req));
  res.status(204).end();
});

slackRouter.delete('/', requireAuth, async (req, res) => {
  await slackService.disconnect(userIdOf(req));
  res.status(204).end();
});
