import { env } from '../lib/env.js';
import { logger } from '../lib/logger.js';

/**
 * Invitation-delivery abstraction (ADR-0003 / brief §8). The API depends on this interface, never
 * on a concrete provider, so a real transactional-email service can be dropped in without touching
 * the invitation service.
 *
 * NO paid/external email provider is configured in Phase 2 (adding one needs an approved service +
 * credentials). So the only implementation here is the **development** transport: it does NOT send
 * mail — it returns the invite link so the caller can surface it in-UI, clearly labelled dev-only.
 * The system NEVER pretends an email was delivered. Production configuration (SMTP/Provider env + a
 * concrete provider) is documented in docs; when those vars are present `getEmailProvider()` will be
 * extended to return a real sender instead of the dev transport.
 */
export interface InvitationEmail {
  workspaceName: string;
  inviteeEmail: string;
  inviterName: string;
  role: string;
  /** The accept URL, built from PUBLIC_APP_BASE_URL + token (never persisted). */
  acceptUrl: string;
}

export interface EmailProvider {
  /** True when mail is actually dispatched (a real provider). False for the dev transport. */
  readonly delivers: boolean;
  sendInvitation(mail: InvitationEmail): Promise<void>;
}

/** Dev transport: logs a redacted notice; delivery is faked and the link is shown in the UI. */
class DevelopmentEmailProvider implements EmailProvider {
  readonly delivers = false;

  async sendInvitation(mail: InvitationEmail): Promise<void> {
    // Log metadata only — never the token-bearing link (it is a live credential) to stdout.
    logger.info('invitation (dev transport, not emailed)', {
      workspace: mail.workspaceName,
      to: mail.inviteeEmail,
      role: mail.role,
    });
  }
}

// A single instance is sufficient; a real provider would be constructed here from env when
// credentials are present (e.g. `if (env.smtpHost) return new SmtpProvider(...)`).
const provider: EmailProvider = new DevelopmentEmailProvider();

export function getEmailProvider(): EmailProvider {
  return provider;
}

/** Build the accept link the client uses. Only ever surfaced to the invitor in dev mode. */
export function buildAcceptUrl(token: string): string {
  const base = env.publicAppBaseUrl.replace(/\/+$/, '');
  return `${base}/invite/accept?token=${encodeURIComponent(token)}`;
}
