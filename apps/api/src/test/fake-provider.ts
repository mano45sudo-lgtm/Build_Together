import type { ChatProvider, IssuedToken, ProviderFailure } from '../modules/chat/provider.types';
import { ProviderError } from '../modules/chat/provider.types';

/**
 * A scripted in-memory `ChatProvider` for integration tests. It proves BuildTogether's OWN logic —
 * identity mapping, workspace isolation, conversation authorization and provider orchestration —
 * WITHOUT any Nexconn credentials or network. It records every provider call so tests can assert the
 * exact side effects, and can be armed to fail a specific method to exercise error mapping.
 *
 * IMPORTANT (brief §12): this validates our code against a mock. It is NOT evidence that the real
 * Nexconn provider works — that is a separate, credential-gated concern, never claimed here.
 */

export type ProviderMethod =
  'issueToken' | 'expireTokens' | 'createGroup' | 'joinGroup' | 'leaveGroup' | 'dismissGroup';

export class FakeProvider implements ChatProvider {
  readonly tokensIssued: string[] = [];
  readonly tokensExpired: string[] = [];
  readonly groupsCreated: string[] = [];
  readonly membersJoined: string[] = [];
  readonly membersLeft: string[] = [];
  readonly groupsDismissed: string[] = [];

  configured = true;
  private faults = new Map<ProviderMethod, ProviderFailure>();

  /** Make the next call to `method` throw a `ProviderError` (until cleared). */
  arm(method: ProviderMethod, failure: ProviderFailure): void {
    this.faults.set(method, failure);
  }
  disarm(method: ProviderMethod): void {
    this.faults.delete(method);
  }
  reset(): void {
    this.tokensIssued.length = 0;
    this.tokensExpired.length = 0;
    this.groupsCreated.length = 0;
    this.membersJoined.length = 0;
    this.membersLeft.length = 0;
    this.groupsDismissed.length = 0;
    this.faults.clear();
    this.configured = true;
  }

  private throwIfArmed(method: ProviderMethod): void {
    const fault = this.faults.get(method);
    if (fault) throw new ProviderError(fault, `fake provider fault: ${method}`);
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async issueToken(input: { externalId: string }): Promise<IssuedToken> {
    this.throwIfArmed('issueToken');
    this.tokensIssued.push(input.externalId);
    return { accessToken: `tok-${input.externalId}`, externalId: input.externalId };
  }

  async expireTokens(externalIds: string[]): Promise<void> {
    this.throwIfArmed('expireTokens');
    this.tokensExpired.push(...externalIds);
  }

  async createGroup(input: { channelId: string }): Promise<void> {
    this.throwIfArmed('createGroup');
    this.groupsCreated.push(input.channelId);
  }

  async joinGroup(input: { memberExternalIds: string[] }): Promise<void> {
    this.throwIfArmed('joinGroup');
    this.membersJoined.push(...input.memberExternalIds);
  }

  async leaveGroup(input: { memberExternalIds: string[] }): Promise<void> {
    this.throwIfArmed('leaveGroup');
    this.membersLeft.push(...input.memberExternalIds);
  }

  async dismissGroup(input: { channelId: string }): Promise<void> {
    this.throwIfArmed('dismissGroup');
    this.groupsDismissed.push(input.channelId);
  }
}
