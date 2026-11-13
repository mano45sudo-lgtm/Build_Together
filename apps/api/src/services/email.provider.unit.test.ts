import { describe, expect, it, vi } from 'vitest';
import { buildAcceptUrl, getEmailProvider, shareableInvite } from './email.provider.js';
import { logger } from '../lib/logger.js';

describe('invitation sharing', () => {
  const token = 'tok_' + 'a'.repeat(40);

  it('builds the dev accept link from a base URL', () => {
    expect(buildAcceptUrl(token, 'http://localhost:5173/')).toBe(
      `http://localhost:5173/invite/accept?token=${token}`,
    );
  });

  it('builds no link when no base applies (production)', () => {
    expect(buildAcceptUrl(token, undefined)).toBeUndefined();
  });

  it('shares the link when one exists, otherwise the bare invite code', () => {
    expect(shareableInvite(token, 'http://localhost:5173/invite/accept?token=x')).toContain(
      '/invite/accept',
    );
    expect(shareableInvite(token, undefined)).toBe(token);
  });

  it('logs invitation metadata without the invitee email or any link', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    await getEmailProvider().sendInvitation({
      workspaceName: 'Acme',
      inviteeEmail: 'person@example.com',
      inviterName: 'Ada',
      role: 'MEMBER',
      acceptUrl: `http://localhost:5173/invite/accept?token=${token}`,
    });
    const logged = JSON.stringify(info.mock.calls);
    info.mockRestore();
    expect(logged).toContain('Acme');
    expect(logged).not.toContain('person@example.com');
    expect(logged).not.toContain(token);
  });
});
