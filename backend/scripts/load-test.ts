/**
 * Load test: schedules a lot of emails through the HTTP API, all due at about the same time.
 *
 *   npm run load-test -- --email you@gmail.com --count 1000
 *   npm run load-test -- --email you@gmail.com --count 1000 --campaigns 5 --in 30 --delay 0 --hourly 200
 *
 * --campaigns N splits the recipients into N campaigns on the same sender that start together,
 * so the limiter in the worker has to sort it out, not just the planner.
 * Recipients are fake @example.com addresses and Ethereal catches everything.
 */
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { createSessionToken } from '../src/auth/session';
import { env } from '../src/config/env';
import { closeDatabase } from '../src/db/client';
import { usersRepository } from '../src/repositories/users.repository';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    count: { type: 'string', default: '1000' },
    campaigns: { type: 'string', default: '1' },
    in: { type: 'string', default: '10' }, // seconds from now
    delay: { type: 'string', default: '0' }, // seconds between emails (the server has its own minimum)
    hourly: { type: 'string', default: String(env.MAX_EMAILS_PER_HOUR_PER_SENDER) },
    api: { type: 'string', default: `http://localhost:${env.PORT}` },
  },
});

async function main() {
  const email = values.email?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run load-test -- --email <user email> [--count 1000] [--in 10] [--delay 0] [--hourly 200]');
  const user = await usersRepository.findByEmail(email);
  if (!user) throw new Error(`No user with email ${email}. Sign in once (or run npm run token -- --email ${email} --create).`);

  const headers = { Authorization: `Bearer ${await createSessionToken(user.id)}`, 'Content-Type': 'application/json' };
  const sendersResponse = await fetch(`${values.api}/api/senders`, { headers });
  const { senders } = (await sendersResponse.json()) as { senders: { id: string; email: string }[] };
  const sender = senders[0];
  if (!sender) throw new Error('The user has no sender yet');

  const count = Number(values.count);
  const campaignCount = Math.max(1, Number(values.campaigns));
  const perCampaign = Math.ceil(count / campaignCount);
  const runId = Date.now().toString(36);
  const startAt = new Date(Date.now() + Number(values.in) * 1000).toISOString();

  const startedAt = Date.now();
  const results = await Promise.all(
    Array.from({ length: campaignCount }, async (_, c) => {
      const recipients = Array.from(
        { length: Math.min(perCampaign, count - c * perCampaign) },
        (_, i) => `lead-${runId}-${c + 1}-${i + 1}@example.com`,
      );
      const response = await fetch(`${values.api}/api/campaigns`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({
          senderId: sender.id,
          subject: `Load test ${runId} #${c + 1}`,
          bodyHtml: `<p>Hello! This is load-test message <b>${runId}</b> from campaign ${c + 1}.</p>`,
          recipients,
          startAt,
          delayBetweenEmailsSeconds: Number(values.delay),
          hourlyLimit: Number(values.hourly),
        }),
      });
      return { status: response.status, body: (await response.json()) as { campaign?: { firstSendAt: string; lastSendAt: string } } };
    }),
  );
  console.log(`Scheduled ${count} emails in ${campaignCount} campaign(s) in ${Date.now() - startedAt} ms (start ${startAt})`);
  for (const [index, { status, body }] of results.entries()) {
    console.log(`  #${index + 1}: HTTP ${status}, planned ${body.campaign?.firstSendAt} -> ${body.campaign?.lastSendAt}`);
  }
  console.log(`\nSender: ${sender.email}. Watch the queue drain at ${values.api}/admin/queues`);
}

main()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
