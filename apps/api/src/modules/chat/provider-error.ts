import type { AppError } from '../../errors/app-error.js';
import { badRequest, serviceUnavailable, tooManyRequests } from '../../errors/app-error.js';
import { ProviderError } from './provider.types.js';

/**
 * Map a provider failure to a safe HTTP `AppError` (single place). The provider's own status/body is
 * NEVER surfaced — a client only ever sees a coarse, secret-free message. Provider `unauthorized` /
 * `forbidden` mean OUR App Key/Secret is wrong (a server-side config fault) → reported as 503, not
 * passed through, so a misconfiguration can't be distinguished (or exploited) from the outside.
 */
export function mapProviderError(error: unknown): AppError {
  if (error instanceof ProviderError) {
    switch (error.failure) {
      case 'bad_request':
        return badRequest('CHAT_BAD_REQUEST', 'Chat provider rejected the request');
      case 'rate_limited':
        return tooManyRequests(
          'CHAT_RATE_LIMITED',
          'Chat provider is limiting requests, try later',
        );
      case 'unconfigured':
      case 'unavailable':
      case 'unauthorized':
      case 'forbidden':
      case 'not_found':
      case 'conflict':
      case 'unknown':
        return serviceUnavailable('CHAT_UNAVAILABLE', 'Chat is temporarily unavailable');
    }
  }
  return serviceUnavailable('CHAT_UNAVAILABLE', 'Chat is temporarily unavailable');
}
