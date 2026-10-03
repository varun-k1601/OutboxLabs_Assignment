import { env } from '../config/env';

const AUTHORIZE_URL = 'https://slack.com/oauth/v2/authorize';
const OAUTH_ACCESS_URL = 'https://slack.com/api/oauth.v2.access';
const AUTH_REVOKE_URL = 'https://slack.com/api/auth.revoke';
const REQUEST_TIMEOUT_MS = 10_000;

// incoming-webhook lets the user pick a channel and gives us a webhook URL for it
export const SLACK_SCOPES = ['incoming-webhook'];

export interface SlackInstallation {
  teamId: string;
  teamName: string | null;
  channelId: string | null;
  channelName: string | null;
  webhookUrl: string;
  configurationUrl: string | null;
  accessToken: string | null;
}

interface OAuthAccessResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { id?: string; name?: string };
  incoming_webhook?: { url?: string; channel?: string; channel_id?: string; configuration_url?: string };
}

export interface SlackMessage {
  text: string;
  blocks?: unknown[];
}

export class SlackApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'SlackApiError';
  }

  // webhook is gone (app uninstalled, channel deleted...)
  get isGone(): boolean {
    return this.status === 404 || this.status === 410 || /no_service|channel_not_found|invalid_token/.test(this.message);
  }
}

export function buildSlackAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', SLACK_SCOPES.join(','));
  url.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

export async function exchangeSlackCode(code: string): Promise<SlackInstallation> {
  const response = await fetch(OAUTH_ACCESS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.SLACK_CLIENT_ID,
      client_secret: env.SLACK_CLIENT_SECRET,
      redirect_uri: env.SLACK_REDIRECT_URI,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const data = (await response.json()) as OAuthAccessResponse;
  if (!data.ok) throw new SlackApiError(data.error ?? `oauth.v2.access failed with HTTP ${response.status}`);
  const webhook = data.incoming_webhook;
  if (!webhook?.url) throw new SlackApiError('Slack did not return an incoming webhook (is the incoming-webhook scope enabled?)');

  return {
    teamId: data.team?.id ?? 'unknown',
    teamName: data.team?.name ?? null,
    channelId: webhook.channel_id ?? null,
    channelName: webhook.channel ?? null,
    webhookUrl: webhook.url,
    configurationUrl: webhook.configuration_url ?? null,
    accessToken: data.access_token ?? null,
  };
}

export async function postWebhookMessage(webhookUrl: string, message: SlackMessage): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new SlackApiError(body || `Slack webhook failed with HTTP ${response.status}`, response.status);
  }
}

// best effort, revokes the token so the webhook stops working on Slack's side too
export async function revokeSlackToken(accessToken: string): Promise<void> {
  await fetch(AUTH_REVOKE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${accessToken}` },
    body: new URLSearchParams({}),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
}
