/**
 * Dev helper: prints a session token so you can call the API from curl/Postman or the load test.
 * The dashboard only logs in through Google. This needs SESSION_SECRET and DB access, so it's
 * basically an admin handing out a token.
 *
 *   npm run token -- --email you@gmail.com              # user must have logged in with Google once
 *   npm run token -- --email test@example.com --create  # local testing without Google set up
 */
import { parseArgs } from 'node:util';
import { createSessionToken } from '../src/auth/session';
import { closeDatabase } from '../src/db/client';
import { usersRepository } from '../src/repositories/users.repository';
import { senderService } from '../src/services/sender.service';

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    create: { type: 'boolean', default: false },
    name: { type: 'string' },
  },
});

async function main() {
  const email = values.email?.trim().toLowerCase();
  if (!email) throw new Error('Usage: npm run token -- --email <address> [--create] [--name "Display Name"]');

  let user = await usersRepository.findByEmail(email);
  if (!user && values.create) {
    user = await usersRepository.upsertFromGoogle({
      googleId: `local:${email}`,
      email,
      name: values.name ?? email.split('@')[0]!,
      avatarUrl: null,
    });
    console.log(`Created local test user ${email}`);
  }
  if (!user) throw new Error(`No user with email ${email}. Sign in with Google first, or pass --create for a local test user.`);

  await senderService.ensureDefaultSender(user);
  const token = await createSessionToken(user.id);
  console.log(`\nUser:  ${user.name} <${user.email}> (${user.id})`);
  console.log(`Token: ${token}\n`);
  console.log(`curl -H "Authorization: Bearer ${token}" http://localhost:4000/api/senders`);
}

main()
  .then(() => closeDatabase())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
