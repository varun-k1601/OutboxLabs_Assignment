import type { Sender, User } from '../db/schema';
import { createEtherealAccount } from '../integrations/mailer';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { sendersRepository } from '../repositories/senders.repository';

export const senderService = {
  list(userId: string): Promise<Sender[]> {
    return sendersRepository.listByUser(userId);
  },

  // creates a new Ethereal mailbox and saves it as a sender
  async createEtherealSender(userId: string, displayName: string): Promise<Sender> {
    let account;
    try {
      account = await createEtherealAccount();
    } catch (err) {
      logger.error({ err }, 'Could not create an Ethereal account');
      throw AppError.serviceUnavailable('Could not reach Ethereal to create a sender mailbox. Please try again.');
    }
    const sender = await sendersRepository.create({
      userId,
      name: displayName,
      email: account.user,
      provider: 'ethereal',
      smtpHost: account.host,
      smtpPort: account.port,
      smtpSecure: account.secure,
      smtpUser: account.user,
      smtpPass: account.pass,
    });
    logger.info({ userId, sender: sender.email }, 'Ethereal sender created');
    return sender;
  },

  // every user gets one sender on first login so they can start right away
  async ensureDefaultSender(user: User): Promise<void> {
    if ((await sendersRepository.countByUser(user.id)) > 0) return;
    await senderService.createEtherealSender(user.id, user.name);
  },
};
