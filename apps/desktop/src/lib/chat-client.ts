import {
  ConversationType,
  Events,
  MessageDirection,
  addEventListener,
  clearUnreadCountByTimestamp,
  connect as rcConnect,
  disconnect as rcDisconnect,
  destroy as rcDestroy,
  getHistoryMessages,
  getUnreadCount,
  getCurrentUserId,
  init as rcInit,
  sendTextMessage,
  sendTypingStatusMessage,
} from '@rongcloud/imlib-next';
import type { IAReceivedMessage, IMessagesEvent } from '@rongcloud/imlib-next';
import type { ConversationSummary } from '@buildtogether/shared';
import { api } from './data';

/**
 * The renderer↔Nexconn realtime transport layer (Web IMLib, ADR-0004). This is the ONLY module that
 * imports the client SDK, and it lives entirely in the sandboxed renderer: it talks to Nexconn's public
 * edge using a SHORT-LIVED, user-scoped token the trusted main process minted over IPC (never a BT
 * session token, never the App Secret). BuildTogether still owns WHO may converse (workspace +
 * conversation authorization on the API); Nexconn only carries the bytes.
 *
 * App-level operations (list/create conversation, membership) go through `api.chat.*` (IPC → API).
 * Message operations (send / history / typing / unread / live events) go DIRECTLY to Nexconn here.
 */

/** Renderer-normalized message (what the UI renders). Raw SDK fields are read defensively. */
export interface ChatMessage {
  id: string;
  /** `${conversationType}:${targetId}:${channelId}` — lets the UI route a live message to the open thread. */
  conversationKey: string;
  senderExternalId: string;
  text: string;
  sentAt: number;
  outgoing: boolean;
}

export type ConnectionState = 'disconnected' | 'connecting' | 'connected';

/** A resolved conversation target the SDK can address. */
export interface ConversationTarget {
  conversationType: ConversationType;
  targetId: string;
}

// ---- module singleton state ----
let sdkInitialized = false;
let connected = false;
let myExternalId = '';

/** A live "is typing" signal, routed to the thread it belongs to (verified SDK `Events.TYPING_STATUS`). */
export interface TypingSignal {
  conversationKey: string;
  userExternalId: string;
}

type MessageListener = (message: ChatMessage) => void;
type StatusListener = (state: ConnectionState, detail?: string) => void;
type TypingListener = (signal: TypingSignal) => void;
const messageListeners = new Set<MessageListener>();
const statusListeners = new Set<StatusListener>();
const typingListeners = new Set<TypingListener>();
const seenMessageIds = new Set<string>();

function emitStatus(state: ConnectionState, detail?: string): void {
  for (const listener of statusListeners) listener(state, detail);
}

function normalize(msg: IAReceivedMessage): ChatMessage {
  const content = (msg as { content?: { content?: unknown } }).content;
  const text = typeof content?.content === 'string' ? content.content : '';
  return {
    id: msg.messageUId ?? '',
    // Route by the addressing identity the SDK uses for the thread (`ConversationType:targetId`);
    // this is exactly what `conversationKeyFor` derives, so live + history + send agree on one key.
    conversationKey: `${msg.conversationType}:${msg.targetId}`,
    senderExternalId: msg.senderUserId ?? '',
    text,
    sentAt: msg.sentTime ?? Date.now(),
    outgoing: msg.messageDirection === MessageDirection.SEND,
  };
}

/**
 * The SDK's `addEventListener` is a heavily generic overload (`T extends Events` → `EventListeners[T]`)
 * whose union is too large for `tsc` to resolve at a call site. We bind through ONE narrow, cast
 * reference — the runtime signature is `(eventType, listener)`; each per-event payload is asserted
 * inside its handler, exactly how the SDK is documented to be consumed.
 */
type SdkEventBinding = (eventType: Events, listener: (arg: unknown) => void) => void;
const onEvent = addEventListener as unknown as SdkEventBinding;

function attachSdkListeners(): void {
  onEvent(Events.MESSAGES, (arg) => {
    const event = arg as IMessagesEvent;
    for (const raw of event.messages ?? []) {
      const message = normalize(raw);
      // De-duplicate: the SDK can surface a message both from send-ack and the live event.
      if (message.id) {
        if (seenMessageIds.has(message.id)) continue;
        seenMessageIds.add(message.id);
      }
      for (const listener of messageListeners) listener(message);
    }
  });
  onEvent(Events.CONNECTED, () => {
    connected = true;
    emitStatus('connected');
  });
  onEvent(Events.DISCONNECT, () => {
    connected = false;
    emitStatus('disconnected', 'Connection to the chat server was lost');
  });
  onEvent(Events.SUSPEND, () => {
    connected = false;
    emitStatus('disconnected', 'Chat connection is suspended');
  });
  // Incoming typing (transient, never persisted). Payload groups the typing users per thread.
  onEvent(Events.TYPING_STATUS, (arg) => {
    const event = arg as {
      status?: Array<{
        conversationType: ConversationType;
        targetId: string;
        list?: Array<{ userId: string }>;
      }>;
    };
    for (const group of event.status ?? []) {
      const key = `${group.conversationType}:${group.targetId}`;
      for (const user of group.list ?? []) {
        if (user.userId === myExternalId) continue; // ignore our own echo
        for (const listener of typingListeners)
          listener({ conversationKey: key, userExternalId: user.userId });
      }
    }
  });
}

/**
 * Ensure a live Nexconn connection for the ACTIVE workspace, minting a fresh client token through the
 * trusted main process (which verifies BT identity + workspace membership server-side). Idempotent:
 * reuses an existing connection; re-mints when disconnected (covers token expiry / reconnect / network
 * recovery / workspace switch). Returns the caller's own Nexconn external id.
 */
export async function ensureConnected(workspaceId: string): Promise<string> {
  const token = await api.chat.getToken(workspaceId); // ephemeral, user-scoped; NOT the BT session
  if (!sdkInitialized) {
    rcInit({ appkey: token.appKey });
    attachSdkListeners();
    sdkInitialized = true;
  }
  if (connected && myExternalId) return myExternalId;

  emitStatus('connecting');
  const result = await rcConnect(token.token);
  if (!result.isOk) {
    emitStatus('disconnected', result.msg || 'Chat connection failed');
    throw new Error(result.msg || 'Could not connect to chat');
  }
  connected = true;
  myExternalId = result.data?.userId || token.userId || getCurrentUserId() || '';
  return myExternalId;
}

/** Map a conversation summary to an SDK-addressable target. DIRECT targets the peer's external id. */
export function resolveTarget(conversation: ConversationSummary): ConversationTarget | null {
  if (conversation.kind === 'GROUP') {
    if (!conversation.providerChannelId) return null;
    return { conversationType: ConversationType.GROUP, targetId: conversation.providerChannelId };
  }
  const peer = conversation.participants.find((p) => p.externalId !== myExternalId);
  if (!peer) return null;
  return { conversationType: ConversationType.PRIVATE, targetId: peer.externalId };
}

/** The routing key a message/typing signal carries for this conversation (null when unaddressable). */
export function conversationKeyFor(conversation: ConversationSummary): string | null {
  const target = resolveTarget(conversation);
  if (!target) return null;
  return `${target.conversationType}:${target.targetId}`;
}

export function currentExternalId(): string {
  return myExternalId;
}

/** Send a text message to a conversation. Throws on a provider failure (mapped to a UI error upstream). */
export async function sendText(
  conversation: ConversationSummary,
  text: string,
): Promise<ChatMessage> {
  const target = resolveTarget(conversation);
  if (!target) throw new Error('This conversation cannot be opened.');
  const result = await sendTextMessage(target, { content: text });
  if (!result.isOk || !result.data) throw new Error(result.msg || 'Message failed to send');
  return normalize(result.data);
}

/** Load a page of history (newest first from `beforeTime`, 0 = now). */
export async function loadHistory(
  conversation: ConversationSummary,
  options: { count?: number; beforeTime?: number } = {},
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const target = resolveTarget(conversation);
  if (!target) return { messages: [], hasMore: false };
  const result = await getHistoryMessages(target, {
    count: options.count ?? 30,
    timestamp: options.beforeTime ?? 0,
  });
  const list = result.data?.list ?? [];
  return { messages: list.map(normalize), hasMore: result.data?.hasMore ?? false };
}

/** Live typing indicator (transient, not persisted by Nexconn). */
export async function sendTyping(conversation: ConversationSummary): Promise<void> {
  const target = resolveTarget(conversation);
  if (!target) return;
  await sendTypingStatusMessage(target, 'RC:TxtMsg').catch(() => undefined);
}

export async function unreadCount(conversation: ConversationSummary): Promise<number> {
  const target = resolveTarget(conversation);
  if (!target) return 0;
  const result = await getUnreadCount(target);
  return result.isOk ? (result.data ?? 0) : 0;
}

export async function clearUnread(conversation: ConversationSummary): Promise<void> {
  const target = resolveTarget(conversation);
  if (!target) return;
  await clearUnreadCountByTimestamp(target, Date.now()).catch(() => undefined);
}

/** Subscribe to live messages + connection status. Returns an unsubscribe function. */
export function subscribe(handlers: {
  onMessage: MessageListener;
  onStatus: StatusListener;
  onTyping?: TypingListener;
}): () => void {
  messageListeners.add(handlers.onMessage);
  statusListeners.add(handlers.onStatus);
  const typing = handlers.onTyping;
  if (typing) typingListeners.add(typing);
  return () => {
    messageListeners.delete(handlers.onMessage);
    statusListeners.delete(handlers.onStatus);
    if (typing) typingListeners.delete(typing);
  };
}

/** Soft disconnect (keeps the SDK initialized for a quick re-connect). */
export async function disconnect(): Promise<void> {
  if (!sdkInitialized) return;
  await rcDisconnect().catch(() => undefined);
  connected = false;
  emitStatus('disconnected');
}

/** Full teardown — used on LOGOUT / session expiry / workspace destruction so no stale Nexconn session,
 * in-memory token, or listener survives. The next `ensureConnected` re-initializes cleanly. */
export async function teardown(): Promise<void> {
  if (!sdkInitialized) return;
  await rcDestroy().catch(() => undefined);
  sdkInitialized = false;
  connected = false;
  myExternalId = '';
  seenMessageIds.clear();
  typingListeners.clear();
  emitStatus('disconnected');
}
