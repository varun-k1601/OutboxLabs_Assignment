import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from '../config/env';
import { logger } from '../lib/logger';
import { BULL_BOARD_PATH, bullBoardAuth, createBullBoardRouter } from '../queue/bull-board';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { authRouter } from './routes/auth.routes';
import { campaignsRouter } from './routes/campaigns.routes';
import { emailsRouter } from './routes/emails.routes';
import { sendersRouter } from './routes/senders.routes';
import { slackRouter } from './routes/slack.routes';
import { systemRouter } from './routes/system.routes';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    pinoHttp({
      logger,
      autoLogging: { ignore: (req) => Boolean(req.url?.startsWith(BULL_BOARD_PATH)) },
      customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'debug'),
    }),
  );
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(cookieParser());

  // Bull Board, without helmet since its UI uses inline scripts
  app.use(BULL_BOARD_PATH, bullBoardAuth, createBullBoardRouter());

  const api = Router();
  api.use(systemRouter);
  api.use('/auth', authRouter);
  api.use('/senders', sendersRouter);
  api.use('/campaigns', campaignsRouter);
  api.use('/emails', emailsRouter);
  api.use('/slack', slackRouter);
  app.use('/api', helmet(), express.json({ limit: '2mb' }), api);

  app.get('/', (_req, res) => res.redirect(env.FRONTEND_URL));
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
