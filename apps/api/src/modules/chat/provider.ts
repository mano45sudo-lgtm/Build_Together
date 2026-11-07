import { env } from '../../lib/env.js';
import { NexconnChatProvider } from './nexconn.provider.js';
import type { ChatProvider } from './provider.types.js';

/**
 * Resolve the chat provider singleton from server-side env (backend-engineering: config is read
 * only in `lib/env.ts`, never scattered). The provider is created lazily and is inert (unconfigured)
 * when Nexconn credentials are absent — every entrypoint then fails closed. `setChatProvider` is the
 * test seam: unit/integration tests inject a fake provider so the messaging logic is verified without
 * live credentials, while the real adapter is exercised only by credential-gated integration tests.
 */
let instance: ChatProvider | null = null;

export function getChatProvider(): ChatProvider {
  if (!instance) {
    instance = new NexconnChatProvider({
      appKey: env.nexconnAppKey,
      appSecret: env.nexconnAppSecret,
      primaryDomain: env.nexconnPrimaryApiDomain,
      secondaryDomain: env.nexconnSecondaryApiDomain,
    });
  }
  return instance;
}

/** Test seam: override (or with `null`, reset) the resolved provider. Never used in production code. */
export function setChatProvider(provider: ChatProvider | null): void {
  instance = provider;
}
