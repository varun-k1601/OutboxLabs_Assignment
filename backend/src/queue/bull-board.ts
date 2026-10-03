import { timingSafeEqual } from 'node:crypto';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { RequestHandler, Router } from 'express';
import { env } from '../config/env';
import { getEmailQueue } from './email.queue';

export const BULL_BOARD_PATH = '/admin/queues';

// Bull Board UI for the email queue
export function createBullBoardRouter(): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(getEmailQueue(), { description: 'One delayed job per scheduled email' })],
    serverAdapter,
    options: { uiConfig: { boardTitle: 'ReachInbox queues' } },
  });
  return serverAdapter.getRouter() as Router;
}

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};

// basic auth, only if BULL_BOARD_USERNAME and BULL_BOARD_PASSWORD are set
export const bullBoardAuth: RequestHandler = (req, res, next) => {
  if (!env.bullBoardAuthEnabled) return next();
  const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString();
    const separator = decoded.indexOf(':');
    if (
      separator > 0 &&
      safeEqual(decoded.slice(0, separator), env.BULL_BOARD_USERNAME) &&
      safeEqual(decoded.slice(separator + 1), env.BULL_BOARD_PASSWORD)
    ) {
      return next();
    }
  }
  res.setHeader('WWW-Authenticate', 'Basic realm="Bull Board"');
  res.status(401).send('Authentication required');
};
