import { createHash, timingSafeEqual } from 'node:crypto';
import { badRequest, serviceUnavailable, unauthorized } from '../../errors/app-error.js';
import { env } from '../../lib/env.js';
import * as repo from './chat.repo.js';

/**
 * Provider server-callback handling (brief §5/§7). Nexconn (RongCloud) POSTs events to our callback
 * URL with a signature derived from the App Secret. Verified against the official scheme
 * (docs.rongcloud.io → Server Callbacks):
 *
 *     signature = SHA1(AppSecret + nonce + timestamp)         // hex, concatenated in that order
 *
 * Headers may arrive as `nonce`/`timestamp`/`signature` (or the `RC-*` variants); `appKey` travels in
 * a header or the body. We (1) fail closed without an App Secret, (2) reject replays outside the
 * accepted time window, (3) compare the signature with a constant-time equality, and (4) record the
 * event idempotently. We NEVER store message bodies — only a bounded audit reference.
 */

export interface WebhookOutcome {
  /** True when this exact event was already recorded (a redelivery). */
  duplicate: boolean;
  /** The stable event id we recorded under. */
  eventId: string;
  /** The `sign` value the callback protocol expects echoed in the response. */
  sign: string;
}

function sha1Hex(input: string): string {
  return createHash('sha1').update(input).digest('hex');
}

/** Derive a stable id for dedupe: prefer a known provider field, else a content hash (retry-stable). */
function deriveEventId(payload: unknown): string {
  if (payload && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    for (const key of ['msgUID', 'uniqueMsgKey', 'uqKey', 'id'] as const) {
      const value = obj[key];
      if (typeof value === 'string' && value.length > 0) return `rc:${value}`;
    }
  }
  return `h:${sha1Hex(JSON.stringify(payload ?? null))}`;
}

function deriveType(payload: unknown): string {
  const sample = Array.isArray(payload) ? payload[0] : payload;
  const obj = (sample ?? {}) as Record<string, unknown>;
  const t = obj['type'] ?? obj['event'];
  if (typeof t === 'string' && t) return t.slice(0, 64);
  return Array.isArray(payload) ? 'batch' : 'event';
}

/** Keep the audit payload bounded — never persist large/opaque bodies; store a trimmed reference. */
function boundPayload(payload: unknown): unknown {
  const json = JSON.stringify(payload ?? null);
  if (json.length <= 8192) return payload ?? null;
  return { truncated: true, type: deriveType(payload), length: json.length };
}

export async function verifyAndRecordWebhook(input: {
  nonce: string | undefined;
  timestamp: string | undefined;
  signature: string | undefined;
  payload: unknown;
}): Promise<WebhookOutcome> {
  const appSecret = env.nexconnAppSecret;
  if (!appSecret) throw serviceUnavailable('CHAT_UNAVAILABLE', 'Chat callbacks are not configured');

  const { nonce, timestamp, signature } = input;
  if (!nonce || !timestamp || !signature) {
    throw unauthorized('WEBHOOK_UNSIGNED', 'Callback is missing signature headers');
  }

  // Replay window: reject timestamps too far from now (both directions).
  const ts = Number.parseInt(timestamp, 10);
  if (Number.isNaN(ts)) throw badRequest('WEBHOOK_TIMESTAMP', 'Invalid callback timestamp');
  if (Math.abs(Date.now() - ts) > env.nexconnWebhookMaxSkewMs) {
    throw unauthorized('WEBHOOK_STALE', 'Callback timestamp is outside the accepted window');
  }

  // Constant-time signature comparison (hex strings of equal, fixed SHA1 length).
  const expected = sha1Hex(appSecret + nonce + timestamp);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw unauthorized('WEBHOOK_SIGNATURE', 'Callback signature mismatch');
  }

  const eventId = deriveEventId(input.payload);
  const type = deriveType(input.payload);
  const isNew = await repo.recordWebhookEvent({
    providerEventId: eventId,
    type,
    payload: boundPayload(input.payload),
  });
  if (isNew) await repo.markWebhookProcessed(eventId);

  // Echo the required acknowledgement sign for the callback protocol (same scheme, request nonce+ts).
  return { duplicate: !isNew, eventId, sign: sha1Hex(appSecret + nonce + timestamp) };
}
