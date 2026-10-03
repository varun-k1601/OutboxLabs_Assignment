import {
  searchDocumentToDto,
  toEmailDetailDto,
  toEmailListItemDto,
  type EmailDetailDto,
  type EmailListItemDto,
  type PaginatedDto,
} from '../http/dto';
import { searchEmailDocuments } from '../integrations/search-index';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { VIEW_STATUSES, emailsRepository, type EmailView } from '../repositories/emails.repository';

export interface ListEmailsParams {
  view: EmailView;
  page: number;
  pageSize: number;
  q?: string;
}

export interface EmailCountsDto {
  // scheduled + rate_limited + sending
  scheduled: number;
  rateLimited: number;
  // sent + failed (the Sent tab)
  sent: number;
  failed: number;
}

export const emailService = {
  // No query: read from Postgres. With a query: search Elasticsearch, and fall back to an ILIKE
  // query in Postgres if ES is down.
  async list(userId: string, { view, page, pageSize, q }: ListEmailsParams): Promise<PaginatedDto<EmailListItemDto>> {
    const query = q?.trim();
    if (query) {
      try {
        const { total, documents } = await searchEmailDocuments({
          userId,
          query,
          statuses: VIEW_STATUSES[view],
          from: (page - 1) * pageSize,
          size: pageSize,
          sort: view,
        });
        return { items: documents.map(searchDocumentToDto), total, page, pageSize, source: 'elasticsearch' };
      } catch (err) {
        logger.warn({ err }, 'Elasticsearch search failed; falling back to Postgres');
      }
    }
    const { rows, total } = await emailsRepository.listForUser({ userId, view, page, pageSize, search: query });
    return { items: rows.map(toEmailListItemDto), total, page, pageSize, source: 'database' };
  },

  async counts(userId: string): Promise<EmailCountsDto> {
    const counts = await emailsRepository.countsByStatus(userId);
    return {
      scheduled: counts.scheduled + counts.rate_limited + counts.sending,
      rateLimited: counts.rate_limited,
      sent: counts.sent + counts.failed,
      failed: counts.failed,
    };
  },

  async get(userId: string, emailId: string): Promise<EmailDetailDto> {
    const row = await emailsRepository.findForUser(emailId, userId);
    if (!row) throw AppError.notFound('Email not found');
    return toEmailDetailDto(row);
  },
};
