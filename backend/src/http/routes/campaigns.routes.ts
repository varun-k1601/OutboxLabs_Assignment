import { Router } from 'express';
import { AppError, parseInput } from '../../lib/errors';
import { ScheduleCampaignSchema, campaignService } from '../../services/campaign.service';
import { requireAuth, userIdOf } from '../middleware/auth';

export const campaignsRouter = Router();
campaignsRouter.use(requireAuth);

// Schedules an email to a list of recipients. If the same Idempotency-Key comes in again we
// return the original campaign instead of scheduling it twice.
campaignsRouter.post('/', async (req, res) => {
  const input = parseInput(ScheduleCampaignSchema, req.body);
  const idempotencyKey = req.get('Idempotency-Key')?.trim() || null;
  if (idempotencyKey && idempotencyKey.length > 200) throw AppError.badRequest('Idempotency-Key is too long');

  const result = await campaignService.schedule(userIdOf(req), input, idempotencyKey);
  res.status(result.replayed ? 200 : 201).json(result);
});
