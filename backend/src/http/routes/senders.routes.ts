import { Router } from 'express';
import { z } from 'zod';
import { parseInput } from '../../lib/errors';
import { usersRepository } from '../../repositories/users.repository';
import { senderService } from '../../services/sender.service';
import { toSenderDto } from '../dto';
import { requireAuth, userIdOf } from '../middleware/auth';

const CreateSenderSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
});

export const sendersRouter = Router();
sendersRouter.use(requireAuth);

sendersRouter.get('/', async (req, res) => {
  const senders = await senderService.list(userIdOf(req));
  res.json({ senders: senders.map(toSenderDto) });
});

// add another Ethereal sender for the user
sendersRouter.post('/', async (req, res) => {
  const userId = userIdOf(req);
  const body = parseInput(CreateSenderSchema, req.body ?? {});
  const displayName = body.name ?? (await usersRepository.findById(userId))?.name ?? 'ReachInbox sender';
  const sender = await senderService.createEtherealSender(userId, displayName);
  res.status(201).json({ sender: toSenderDto(sender) });
});
