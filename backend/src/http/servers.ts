import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import type { Express } from 'express';
import { generate } from 'selfsigned';
import { env } from '../config/env';
import { logger } from '../lib/logger';

type Server = http.Server | https.Server;

const CERT_DIR = path.resolve(process.cwd(), '.certs');
const KEY_FILE = path.join(CERT_DIR, 'localhost-key.pem');
const CERT_FILE = path.join(CERT_DIR, 'localhost-cert.pem');

// Slack only accepts https redirect URLs, so in dev we also serve the app over https with a
// self-signed cert (created once, cached in .certs/). That way SLACK_REDIRECT_URI can be
// https://localhost:4443/api/slack/callback and no tunnel is needed.
async function loadDevCertificate(): Promise<{ key: string; cert: string }> {
  try {
    return { key: await readFile(KEY_FILE, 'utf8'), cert: await readFile(CERT_FILE, 'utf8') };
  } catch {
    const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
      keySize: 2048,
      algorithm: 'sha256',
      notAfterDate: new Date(Date.now() + 825 * 24 * 3600 * 1000),
      extensions: [
        { name: 'basicConstraints', cA: false },
        { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
        { name: 'extKeyUsage', serverAuth: true },
        { name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] },
      ],
    });
    await mkdir(CERT_DIR, { recursive: true });
    await writeFile(KEY_FILE, pems.private);
    await writeFile(CERT_FILE, pems.cert);
    logger.info({ dir: CERT_DIR }, 'Generated a self-signed localhost certificate for the HTTPS dev listener');
    return { key: pems.private, cert: pems.cert };
  }
}

function listen(server: Server, port: number): Promise<Server> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve(server);
    });
  });
}

export async function startHttpServers(app: Express): Promise<Server[]> {
  const servers: Server[] = [await listen(http.createServer(app), env.PORT)];
  logger.info(`API listening on http://localhost:${env.PORT} (Bull Board: http://localhost:${env.PORT}/admin/queues)`);

  if (env.HTTPS_DEV_PORT > 0 && !env.isProduction) {
    try {
      servers.push(await listen(https.createServer(await loadDevCertificate(), app), env.HTTPS_DEV_PORT));
      logger.info(`HTTPS dev listener on https://localhost:${env.HTTPS_DEV_PORT} (for Slack's OAuth redirect)`);
    } catch (err) {
      logger.warn({ err }, 'HTTPS dev listener could not start; Slack OAuth needs another HTTPS redirect URL');
    }
  }
  return servers;
}

export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeIdleConnections();
  });
}
