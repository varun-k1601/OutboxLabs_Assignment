import { Router } from 'express';
import { z } from 'zod';
import { parseInput } from '../../lib/errors';
import { emailService } from '../../services/email.service';
import { requireAuth, userIdOf } from '../middleware/auth';

const ListEmailsQuerySchema = z.object({
  view: z.enum(['scheduled', 'sent']).default('scheduled'),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const EmailIdSchema = z.object({ id: z.uuid('Invalid email id') });

export const emailsRouter = Router();
emailsRouter.use(requireAuth);

// GET /api/emails?view=scheduled|sent&q=&page=&pageSize=  (q searches Elasticsearch)
emailsRouter.get('/', async (req, res) => {
  const query = parseInput(ListEmailsQuerySchema, req.query);
  res.json(await emailService.list(userIdOf(req), query));
});

emailsRouter.get('/counts', async (req, res) => {
  res.json(await emailService.counts(userIdOf(req)));
});

emailsRouter.get('/:id', async (req, res) => {
  const { id } = parseInput(EmailIdSchema, req.params);
  res.json({ email: await emailService.get(userIdOf(req), id) });
});
