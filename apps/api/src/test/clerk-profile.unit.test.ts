import { describe, expect, it } from 'vitest';
import {
  buildVerifiedClerkProfile,
  selectClerkDisplayName,
  selectVerifiedClerkEmail,
} from '../lib/clerk-profile.js';

const address = (id: string, emailAddress: string, status: string) => ({
  id,
  emailAddress,
  verification: { status },
});

describe('Clerk verified profile selection', () => {
  it('selects the verified primary address and normalizes it', () => {
    expect(
      selectVerifiedClerkEmail(
        [
          address('primary', ' Primary@Example.com ', 'verified'),
          address('secondary', 'b@example.com', 'verified'),
        ],
        'primary',
      ),
    ).toEqual({
      email: 'primary@example.com',
      verifiedEmails: ['primary@example.com', 'b@example.com'],
    });
  });

  it('falls back deterministically to the first verified secondary when primary is unverified', () => {
    expect(
      selectVerifiedClerkEmail(
        [
          address('primary', 'unverified@example.com', 'unverified'),
          address('secondary-1', 'second@example.com', 'verified'),
          address('secondary-2', 'third@example.com', 'verified'),
        ],
        'primary',
      )?.email,
    ).toBe('second@example.com');
  });

  it('rejects missing or all-unverified addresses', () => {
    expect(selectVerifiedClerkEmail([], null)).toBeNull();
    expect(selectVerifiedClerkEmail([address('a', 'a@example.com', 'unverified')], 'a')).toBeNull();
  });

  it('does not build a provisioning profile when no verified address is available', () => {
    expect(
      buildVerifiedClerkProfile({
        emailAddresses: [address('primary', 'unverified@example.com', 'unverified')],
        primaryEmailAddressId: 'primary',
        firstName: 'Unverified',
      }),
    ).toBeNull();
  });

  it('does not replace a useful name with an absent provider name', () => {
    expect(selectClerkDisplayName(null, '')).toBeUndefined();
    expect(selectClerkDisplayName('Ada', 'Lovelace')).toBe('Ada Lovelace');
  });
});
