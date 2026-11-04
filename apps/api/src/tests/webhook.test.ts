import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import { errorHandler } from '../middlewares/error-handler.js';
import { requestLog } from '../middlewares/request-log.js';
import { makeChatLimiter } from '../middlewares/rate-limit.js';
import { env } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';
import { resetDb, TestApi } from '../test/harness.js';
import { externalIdForUser, newProviderChannelId } from '../modules/chat/ids.js';

/**
 * Provider-callback security (brief §7/§12): the webhook is the one UNAUTHENTICATED entry point, so its
 * authenticity rests entirely on the App-Secret signature. These tests drive the real HTTP route and
 * assert the five verification gates (configured → signed → fresh → correct signature → idempotent) and
 * that a processed event is audited WITHOUT any message body. Plus the chat rate limiter and the pure
 * id helpers. No live Nexconn involved — the signature scheme is reproduced locally.
 */

const WEBHOOK_PATH = '/api/v1/webhooks/nexconn';

/** Reproduce the provider's scheme: SHA1(AppSecret + nonce + timestamp), hex. */
function sign(nonce: string, timestamp: string): string {
  return createHash('sha1')
    .update(`${env.nexconnAppSecret ?? ''}${nonce}${timestamp}`)
    .digest('hex');
}

interface WebhookCall {
  nonce?: string;
  timestamp?: string;
  signature?: string;
  payload?: unknown;
}

interface WebhookBody {
  code?: number;
  sign?: string;
  error?: { code?: string };
}

async function callWebhook(
  api: TestApi,
  call: WebhookCall,
): Promise<{ status: number; body: WebhookBody }> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (call.nonce !== undefined) headers['nonce'] = call.nonce;
  if (call.timestamp !== undefined) headers['timestamp'] = call.timestamp;
  if (call.signature !== undefined) headers['signature'] = call.signature;
  const res = await fetch(api.baseUrl + WEBHOOK_PATH, {
    method: 'POST',
    headers,
    body: JSON.stringify(call.payload ?? {}),
  });
  const body = (await res.json().catch(() => ({}))) as WebhookBody;
  return { status: res.status, body };
}

describe('chat webhook: signature verification & idempotency', () => {
  let api: TestApi;

  beforeAll(async () => {
    api = await TestApi.start();
  });
  afterAll(async () => {
    await api?.stop();
  });
  beforeEach(async () => {
    await resetDb();
  });

  it('accepts a correctly signed callback, echoes the ack sign, and audits it as PROCESSED', async () => {
    const nonce = 'abc123';
    const timestamp = String(Date.now());
    const signature = sign(nonce, timestamp);

    const res = await callWebhook(api, {
      nonce,
      timestamp,
      signature,
      payload: { msgUID: 'msg-0001', type: 'CU:Message' },
    });

    expect(res.status).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.sign).toBe(signature);

    const row = await prisma.nexconnWebhookEvent.findUnique({
      where: { providerEventId: 'rc:msg-0001' },
    });
    expect(row?.status).toBe('PROCESSED');
    expect(row?.processedAt).not.toBeNull();
    expect(row?.type).toBe('CU:Message');
    // Message bodies are never stored — only a bounded audit reference (here the small event object).
    expect(JSON.stringify(row?.payload)).not.toMatch(/text|content|message body/i);
  });

  it('is idempotent: a redelivered event is accepted but recorded exactly once', async () => {
    const nonce = 'n2';
    const timestamp = String(Date.now());
    const signature = sign(nonce, timestamp);
    const payload = { msgUID: 'dup-9', type: 'CU:Message' };

    const first = await callWebhook(api, { nonce, timestamp, signature, payload });
    const second = await callWebhook(api, { nonce, timestamp, signature, payload });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await prisma.nexconnWebhookEvent.count({ where: { providerEventId: 'rc:dup-9' } })).toBe(
      1,
    );
  });

  it('rejects a tampered signature (401) and records nothing', async () => {
    const nonce = 'n3';
    const timestamp = String(Date.now());
    const res = await callWebhook(api, {
      nonce,
      timestamp,
      signature: sign(nonce, timestamp).replace(/^./, 'z'),
      payload: { msgUID: 'forged' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('WEBHOOK_SIGNATURE');
    expect(await prisma.nexconnWebhookEvent.count()).toBe(0);
  });

  it('rejects a stale timestamp outside the replay window (401), even when correctly signed', async () => {
    const nonce = 'n4';
    const stale = String(Date.now() - env.nexconnWebhookMaxSkewMs - 5_000);
    const res = await callWebhook(api, {
      nonce,
      timestamp: stale,
      signature: sign(nonce, stale), // valid for its (old) timestamp — proves the reject is about freshness
      payload: { msgUID: 'old' },
    });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('WEBHOOK_STALE');
  });

  it('rejects a missing-signature callback (401) before doing any work', async () => {
    const res = await callWebhook(api, { payload: { msgUID: 'unsigned' } });
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('WEBHOOK_UNSIGNED');
    expect(await prisma.nexconnWebhookEvent.count()).toBe(0);
  });

  it('rejects a non-numeric timestamp (400)', async () => {
    const nonce = 'n5';
    const res = await callWebhook(api, {
      nonce,
      timestamp: 'not-a-number',
      signature: sign(nonce, 'not-a-number'),
      payload: { msgUID: 'bad-ts' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('WEBHOOK_TIMESTAMP');
  });

  it('derives a stable id from a content hash when no provider id is present (dedupes retries)', async () => {
    const payload = { type: 'CU:Join', data: { conversationId: 'grp-x', member: 'bt-42' } };
    const nonce = 'n6';
    const timestamp = String(Date.now());
    const signature = sign(nonce, timestamp);

    await callWebhook(api, { nonce, timestamp, signature, payload });
    await callWebhook(api, { nonce, timestamp, signature, payload });

    // No msgUID/id → hashed from the body; the two identical deliveries collapse into one row.
    expect(await prisma.nexconnWebhookEvent.count()).toBe(1);
  });
});

describe('chat rate limiter + identity helpers', () => {
  it('throttles repeated chat management calls (all requests counted)', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(requestLog);
    // Chat limiter counts every request (live polling), so 3 pass then the 4th is limited.
    app.post('/chat-op', makeChatLimiter(3), (_req, res) => res.status(200).json({ ok: true }));
    app.use(errorHandler);

    const server = app.listen(0);
    await new Promise<void>((resolve) => server.once('listening', () => resolve()));
    const { port } = server.address() as AddressInfo;
    const base = `http://127.0.0.1:${port}`;
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await fetch(`${base}/chat-op`, { method: 'POST' });
        codes.push(res.status);
      }
      expect(codes.slice(0, 3)).toEqual([200, 200, 200]);
      expect(codes[3]).toBe(429);
      const limited = await fetch(`${base}/chat-op`, { method: 'POST' });
      expect(limited.status).toBe(429);
      const body = (await limited.json()) as { error?: { code?: string } };
      expect(body.error?.code).toBe('RATE_LIMITED');
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('maps a BT user to a deterministic, prefix-stable external id', () => {
    expect(externalIdForUser('user-1')).toBe('bt-user-1');
    // Same input → same id, always (impersonation-proof: never derived from client text).
    expect(externalIdForUser('user-1')).toBe(externalIdForUser('user-1'));
  });

  it('mints provider channel ids that are unique, bounded, and Nexconn-safe', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const id = newProviderChannelId();
      // Group ids forbid '_' and must stay within the provider's 20-char cap.
      expect(id).toMatch(/^grp[0-9a-f]{16}$/);
      expect(id.length).toBeLessThanOrEqual(20);
      expect(id).not.toContain('_');
      ids.add(id);
    }
    expect(ids.size).toBe(200);
  });
});
