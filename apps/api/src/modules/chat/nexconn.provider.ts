import {
  ApiException,
  Configuration,
  GroupChannelManagementApi,
  UserManagementApi,
} from '@nexconn/server-sdk';
import type {
  AccessTokenExpireRequest,
  AccessTokenIssueRequest,
  GroupChannelCreateRequest,
  GroupChannelDismissRequest,
  GroupChannelJoinRequest,
  GroupChannelQuitRequest,
} from '@nexconn/server-sdk';
import { ProviderError } from './provider.types.js';
import type { ChatProvider, IssuedToken } from './provider.types.js';

/**
 * Nexconn adapter over `@nexconn/server-sdk` (ADR-0004). This is the ONLY file that imports the
 * provider SDK. Method names, request models and response fields are all taken from the installed
 * SDK's type declarations — nothing is invented:
 *   - `UserManagementApi.issueAccessToken(AccessTokenIssueRequest{userId,name,avatarUrl?})`
 *       → `{ code, result?: { userId?, accessToken? } }`
 *   - `UserManagementApi.expireAccessToken(AccessTokenExpireRequest{userIds[], expiresAt(ms)})`
 *   - `GroupChannelManagementApi.create/join/quit/dismiss…(…Request)`
 * Requests are auto-signed (App-Key/Nonce/Timestamp/Signature) once credentials + domains are set;
 * `setPrimaryBackupDomains` is REQUIRED because the SDK embeds no default domain.
 */

export interface NexconnConfig {
  appKey?: string | undefined;
  appSecret?: string | undefined;
  primaryDomain?: string | undefined;
  secondaryDomain?: string | undefined;
}

/** Map a provider `ApiException` (or thrown error) to a coarse, secret-free failure category. */
function toProviderError(error: unknown): ProviderError {
  if (error instanceof ApiException) {
    const status = error.httpStatus;
    const kind =
      status === 400
        ? 'bad_request'
        : status === 401
          ? 'unauthorized'
          : status === 403
            ? 'forbidden'
            : status === 404
              ? 'not_found'
              : status === 409
                ? 'conflict'
                : status === 429
                  ? 'rate_limited'
                  : status >= 500
                    ? 'unavailable'
                    : 'unknown';
    // Never surface the provider body/secret — a fixed, safe message only.
    return new ProviderError(kind, `Nexconn request failed (${status})`, status);
  }
  return new ProviderError('unavailable', 'Nexconn is unreachable');
}

export class NexconnChatProvider implements ChatProvider {
  private readonly configuration: Configuration | null;
  private readonly users: UserManagementApi | null;
  private readonly groups: GroupChannelManagementApi | null;

  constructor(config: NexconnConfig) {
    if (config.appKey && config.appSecret && config.primaryDomain && config.secondaryDomain) {
      const configuration = new Configuration();
      configuration.setNexconnCredentials(config.appKey, config.appSecret);
      configuration.setPrimaryBackupDomains(config.primaryDomain, config.secondaryDomain);
      this.configuration = configuration;
      this.users = new UserManagementApi(configuration);
      this.groups = new GroupChannelManagementApi(configuration);
    } else {
      this.configuration = null;
      this.users = null;
      this.groups = null;
    }
  }

  isConfigured(): boolean {
    return this.configuration !== null;
  }

  private requireUsers(): UserManagementApi {
    if (!this.users) throw new ProviderError('unconfigured', 'Nexconn provider is not configured');
    return this.users;
  }

  private requireGroups(): GroupChannelManagementApi {
    if (!this.groups) throw new ProviderError('unconfigured', 'Nexconn provider is not configured');
    return this.groups;
  }

  async issueToken(input: {
    externalId: string;
    name: string;
    avatarUrl?: string | null;
  }): Promise<IssuedToken> {
    const request: AccessTokenIssueRequest = {
      userId: input.externalId,
      name: input.name,
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    };
    try {
      const { data } = await this.requireUsers().issueAccessToken(request);
      const accessToken = data.result?.accessToken;
      if (data.code !== 0 || !accessToken) {
        throw new ProviderError('unavailable', 'Nexconn returned no access token', data.code);
      }
      return { accessToken, externalId: data.result?.userId ?? input.externalId };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw toProviderError(error);
    }
  }

  async expireTokens(externalIds: string[]): Promise<void> {
    if (externalIds.length === 0) return;
    const request: AccessTokenExpireRequest = {
      userIds: externalIds,
      // Expire "now" — every already-issued token for these identities stops working.
      expiresAt: Date.now(),
    };
    try {
      await this.requireUsers().expireAccessToken(request);
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async createGroup(input: {
    channelId: string;
    name: string;
    ownerExternalId: string;
  }): Promise<void> {
    const request: GroupChannelCreateRequest = {
      channelId: input.channelId,
      name: input.name,
      owner: input.ownerExternalId,
    };
    try {
      await this.requireGroups().createGroupChannel(request);
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async joinGroup(input: { channelId: string; memberExternalIds: string[] }): Promise<void> {
    if (input.memberExternalIds.length === 0) return;
    const request: GroupChannelJoinRequest = {
      channelId: input.channelId,
      userIds: input.memberExternalIds,
    };
    try {
      await this.requireGroups().joinGroupChannel(request);
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async leaveGroup(input: { channelId: string; memberExternalIds: string[] }): Promise<void> {
    if (input.memberExternalIds.length === 0) return;
    const request: GroupChannelQuitRequest = {
      channelId: input.channelId,
      userIds: input.memberExternalIds,
    };
    try {
      await this.requireGroups().quitGroupChannel(request);
    } catch (error) {
      throw toProviderError(error);
    }
  }

  async dismissGroup(input: { channelId: string }): Promise<void> {
    const request: GroupChannelDismissRequest = { channelId: input.channelId };
    try {
      await this.requireGroups().dismissGroupChannel(request);
    } catch (error) {
      throw toProviderError(error);
    }
  }
}
