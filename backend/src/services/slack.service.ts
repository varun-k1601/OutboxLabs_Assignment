import { signStateToken, verifyStateToken } from '../auth/session';
import { env } from '../config/env';
import type { SlackConnection } from '../db/schema';
import {
  SlackApiError,
  buildSlackAuthorizeUrl,
  exchangeSlackCode,
  postWebhookMessage,
  revokeSlackToken,
  type SlackMessage,
} from '../integrations/slack-api';
import { AppError } from '../lib/errors';
import { logger } from '../lib/logger';
import { describeWindow } from '../lib/time';
import { slackRepository } from '../repositories/slack.repository';

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channelName: string | null;
  connectedAt: string | null;
}

// Slack mrkdwn only needs &, < and > escaped
export const escapeMrkdwn = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const connectedMessage = (connection: SlackConnection): SlackMessage => ({
  text: 'ReachInbox is connected to this channel.',
  blocks: [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          ':white_check_mark: *ReachInbox is connected.*\n' +
          `You'll get a message in ${connection.channelName ? escapeMrkdwn(connection.channelName) : 'this channel'} ` +
          `whenever a sender hits its limit of emails per ${describeWindow(env.rateLimitWindowMs)}.`,
      },
    },
  ],
});

export const slackService = {
  async getStatus(userId: string): Promise<SlackStatus> {
    const connection = await slackRepository.findByUser(userId);
    return {
      configured: env.slackEnabled,
      connected: Boolean(connection),
      teamName: connection?.teamName ?? null,
      channelName: connection?.channelName ?? null,
      connectedAt: connection?.updatedAt.toISOString() ?? null,
    };
  },

  async createAuthorizeUrl(userId: string): Promise<string> {
    if (!env.slackEnabled) {
      throw new AppError(503, 'SLACK_NOT_CONFIGURED', 'Slack is not configured on the server (SLACK_CLIENT_ID / SLACK_CLIENT_SECRET)');
    }
    // signed state ties the callback to this user (CSRF), valid for 10 min
    const state = await signStateToken('slack', { sub: userId });
    return buildSlackAuthorizeUrl(state);
  },

  async completeOAuth(code: string, state: string): Promise<SlackConnection> {
    const claims = await verifyStateToken<{ sub?: string }>('slack', state);
    if (!claims?.sub) throw AppError.badRequest('The Slack authorization request expired or is invalid. Please try again.');

    const installation = await exchangeSlackCode(code);
    const connection = await slackRepository.upsert({ userId: claims.sub, ...installation });
    await postWebhookMessage(connection.webhookUrl, connectedMessage(connection)).catch((err) =>
      logger.warn({ err }, 'Could not post the Slack welcome message'),
    );
    logger.info({ userId: claims.sub, team: connection.teamName, channel: connection.channelName }, 'Slack connected');
    return connection;
  },

  async disconnect(userId: string): Promise<boolean> {
    const connection = await slackRepository.deleteByUser(userId);
    if (connection?.accessToken) {
      await revokeSlackToken(connection.accessToken).catch((err) => logger.warn({ err }, 'Slack token revocation failed'));
    }
    return Boolean(connection);
  },

  async sendTestMessage(userId: string): Promise<void> {
    const connection = await slackRepository.findByUser(userId);
    if (!connection) throw AppError.badRequest('Slack is not connected');
    try {
      await postWebhookMessage(connection.webhookUrl, {
        text: `:wave: Test notification from ReachInbox. Alerts will arrive here when a sender hits its limit of emails per ${describeWindow(env.rateLimitWindowMs)}.`,
      });
    } catch (err) {
      if (err instanceof SlackApiError && err.isGone) {
        await slackRepository.deleteByUser(userId);
        throw new AppError(410, 'SLACK_DISCONNECTED', 'The Slack app was removed from your workspace. Please connect Slack again.');
      }
      throw new AppError(502, 'SLACK_ERROR', `Slack rejected the message: ${err instanceof Error ? err.message : String(err)}`);
    }
  },

  // Posts to the user's Slack if they're connected. The connection is looked up every time, so
  // connecting/disconnecting works straight away.
  async notify(userId: string, message: SlackMessage): Promise<boolean> {
    const connection = await slackRepository.findByUser(userId);
    if (!connection) return false;
    try {
      await postWebhookMessage(connection.webhookUrl, message);
      return true;
    } catch (err) {
      if (err instanceof SlackApiError && err.isGone) {
        // app was uninstalled or the channel deleted. Drop the connection so the dashboard shows
        // "Connect Slack" again
        logger.warn({ userId }, 'Slack webhook no longer exists; removing the connection');
        await slackRepository.deleteByUser(userId);
      } else {
        logger.warn({ err, userId }, 'Slack notification failed');
      }
      return false;
    }
  },
};
