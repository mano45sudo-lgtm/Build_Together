import { act, configure, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionView, ConversationSummary, IpcOutcome } from '@buildtogether/shared';
import { MessagesScreen } from '../features/messages/MessagesScreen';
import { AuthProvider } from '../state/AuthProvider';
import type { ChatMessage } from '../lib/chat-client';

/**
 * Renderer tests for the Phase 3 Messages surface (brief §12). The Web-IMLib transport (`chat-client`)
 * is replaced by a controllable double — the real SDK cannot run in jsdom and the brief forbids claiming
 * live-provider success from a mock. These prove the UI's OWN guarantees: it renders only the
 * server-authorized conversations, loads/merges history and live traffic honestly, sends through the
 * transport, shows real typing, and — critically — never fabricates a thread when the provider is
 * unavailable (it surfaces a truthful error instead of fake messages).
 */

// Under the full monorepo run (the API integration suite saturates CPU/DB) the default 1s async-util
// timeout is flaky purely from scheduling contention — give these renderer awaits generous headroom.
configure({ asyncUtilTimeout: 8000 });

// Shared capture so tests can emit live SDK callbacks into the mounted screen.
const h = vi.hoisted(() => ({
  handlers: {} as {
    onMessage?: (m: ChatMessage) => void;
    onStatus?: (s: string, d?: string) => void;
    onTyping?: (signal: { conversationKey: string; userExternalId: string }) => void;
  },
}));

vi.mock('../lib/chat-client', () => ({
  ensureConnected: vi.fn(async () => 'bt-u_1'),
  subscribe: vi.fn((handlers: typeof h.handlers) => {
    Object.assign(h.handlers, handlers);
    return () => {
      h.handlers = {};
    };
  }),
  conversationKeyFor: vi.fn((c: ConversationSummary) =>
    c.kind === 'GROUP' ? `grp:${c.providerChannelId}` : `dm:${c.id}`,
  ),
  loadHistory: vi.fn(async () => ({ messages: [] as ChatMessage[], hasMore: false })),
  sendText: vi.fn(async (c: ConversationSummary, text: string): Promise<ChatMessage> => ({
    id: `ack-${text}`,
    conversationKey: `grp:${c.providerChannelId}`,
    senderExternalId: 'bt-u_1',
    text,
    sentAt: Date.now(),
    outgoing: true,
  })),
  sendTyping: vi.fn(async () => undefined),
  unreadCount: vi.fn(async () => 0),
  clearUnread: vi.fn(async () => undefined),
  currentExternalId: vi.fn(() => 'bt-u_1'),
  resolveTarget: vi.fn(() => null),
  disconnect: vi.fn(async () => undefined),
  teardown: vi.fn(async () => undefined),
}));

import * as chat from '../lib/chat-client';

const conversation: ConversationSummary = {
  id: 'c_1',
  kind: 'GROUP',
  title: 'Launch crew',
  providerChannelId: 'grp-abc',
  workspaceId: 'w_1',
  createdAt: '2026-01-05T00:00:00.000Z',
  participants: [
    { userId: 'u_1', name: 'Ada Lovelace', avatarUrl: null, externalId: 'bt-u_1' },
    { userId: 'u_2', name: 'Peter Peer', avatarUrl: null, externalId: 'bt-peter' },
  ],
};

const session: AuthSessionView = {
  user: {
    id: 'u_1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    avatarUrl: null,
    status: 'ACTIVE',
    createdAt: '2026-01-01T00:00:00.000Z',
  },
  workspaces: [
    {
      id: 'w_1',
      name: 'Acme Product',
      description: null,
      iconUrl: null,
      role: 'OWNER',
      memberCount: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  ],
};

const ok = <T,>(data: T): Promise<IpcOutcome<T>> => Promise.resolve({ ok: true, data });

function installBridge(conversations: ConversationSummary[] = [conversation]) {
  const bridge = {
    auth: { me: () => ok(session) },
    members: { list: () => ok([]) },
    chat: {
      getToken: () => ok({ appKey: 'k', token: 't', userId: 'bt-u_1', expiresAt: '' }),
      listConversations: () => ok(conversations),
      createConversation: () => ok(conversation),
      getConversation: () => ok(conversation),
      addMembers: () => ok(conversation),
      removeMember: () => ok(null),
    },
  };
  Object.defineProperty(window, 'bt', { value: bridge, configurable: true, writable: true });
}

function renderScreen() {
  return render(
    <AuthProvider>
      <MessagesScreen />
    </AuthProvider>,
  );
}

beforeEach(() => {
  h.handlers = {};
  vi.mocked(chat.ensureConnected).mockReset().mockResolvedValue('bt-u_1');
  vi.mocked(chat.loadHistory).mockReset().mockResolvedValue({ messages: [], hasMore: false });
  vi.mocked(chat.sendText)
    .mockReset()
    .mockImplementation(async (c: ConversationSummary, text: string) => ({
      id: `ack-${text}`,
      conversationKey: `grp:${c.providerChannelId}`,
      senderExternalId: 'bt-u_1',
      text,
      sentAt: Date.now(),
      outgoing: true,
    }));
  installBridge();
});

afterEach(() => {
  Object.defineProperty(window, 'bt', { value: undefined, configurable: true, writable: true });
});

describe('messages screen', () => {
  it('renders the server-authorized conversation and loads its history', async () => {
    vi.mocked(chat.loadHistory).mockResolvedValue({
      messages: [
        {
          id: 'm1',
          conversationKey: 'grp:grp-abc',
          senderExternalId: 'bt-peter',
          text: 'Kickoff at nine',
          sentAt: Date.parse('2026-01-05T09:00:00.000Z'),
          outgoing: false,
        },
        {
          id: 'm2',
          conversationKey: 'grp:grp-abc',
          senderExternalId: 'bt-u_1',
          text: 'Sounds good',
          sentAt: Date.parse('2026-01-05T09:01:00.000Z'),
          outgoing: true,
        },
      ],
      hasMore: false,
    });

    renderScreen();

    // The roster comes from the API (list); the thread content from the transport (history).
    expect(await screen.findByText('Launch crew')).toBeInTheDocument();
    expect(await screen.findByText('Kickoff at nine')).toBeInTheDocument();
    expect(screen.getByText('Sounds good')).toBeInTheDocument();
    expect(chat.loadHistory).toHaveBeenCalledWith(expect.objectContaining({ id: 'c_1' }), {
      count: 30,
    });
  });

  it('sends a message through the transport and shows it optimistically', async () => {
    renderScreen();
    const box = await screen.findByRole('textbox', { name: /message/i });
    fireEvent.change(box, { target: { value: 'Ship the release' } });
    fireEvent.click(screen.getByRole('button', { name: /send message/i }));

    await waitFor(() =>
      expect(chat.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'c_1' }),
        'Ship the release',
      ),
    );
    expect(await screen.findByText('Ship the release')).toBeInTheDocument();
  });

  it('renders a live incoming message via the subscription without duplicating it', async () => {
    renderScreen();
    await screen.findByText('Launch crew');

    const live: ChatMessage = {
      id: 'live1',
      conversationKey: 'grp:grp-abc',
      senderExternalId: 'bt-peter',
      text: 'On my way',
      sentAt: Date.now(),
      outgoing: false,
    };
    act(() => h.handlers.onMessage?.(live));
    expect(await screen.findByText('On my way')).toBeInTheDocument();

    // A redelivered echo of the same id must not add a second bubble.
    act(() => h.handlers.onMessage?.(live));
    await waitFor(() => expect(screen.getAllByText('On my way')).toHaveLength(1));
  });

  it('shows a real typing indicator mapped to the participant name', async () => {
    renderScreen();
    await screen.findByText('Launch crew');

    act(() =>
      h.handlers.onTyping?.({ conversationKey: 'grp:grp-abc', userExternalId: 'bt-peter' }),
    );
    expect(await screen.findByText(/Peter Peer is typing/i)).toBeInTheDocument();
  });

  it('does not fabricate a thread when the provider is unavailable — surfaces an honest error', async () => {
    vi.mocked(chat.ensureConnected).mockRejectedValue(new Error('provider is down'));
    renderScreen();

    expect(await screen.findByText(/Chat is currently unavailable/i)).toBeInTheDocument();
    // No history is fetched and the composer is disabled — no fake messages are shown.
    expect(chat.loadHistory).not.toHaveBeenCalled();
    const box = screen.getByRole('textbox', { name: /message/i });
    expect(box).toBeDisabled();
  });

  it('shows the empty state when there are no conversations', async () => {
    installBridge([]);
    renderScreen();
    expect(await screen.findByText(/No conversations yet/i)).toBeInTheDocument();
    expect(screen.getByText(/No conversation selected/i)).toBeInTheDocument();
  });
});
