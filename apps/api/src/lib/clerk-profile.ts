import { normalizeEmail } from '../validation/schemas.js';

export interface ClerkEmailAddressLike {
  id: string;
  emailAddress: string;
  verification?: { status?: string | null } | null;
}

export interface ClerkEmailSelection {
  email: string;
  verifiedEmails: string[];
}

export interface ClerkBackendUserLike {
  emailAddresses: readonly ClerkEmailAddressLike[];
  primaryEmailAddressId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
}

export interface SelectedClerkProfile {
  email: string;
  name?: string;
  verifiedEmails: string[];
}

/**
 * Select only verified addresses: verified primary wins, otherwise the first verified address
 * in Clerk's stable emailAddresses ordering. No unverified value is ever a fallback.
 */
export function selectVerifiedClerkEmail(
  emailAddresses: readonly ClerkEmailAddressLike[],
  primaryEmailAddressId: string | null | undefined,
): ClerkEmailSelection | null {
  const verified = emailAddresses.filter(
    (entry) => entry.verification?.status === 'verified' && entry.emailAddress.trim().length > 0,
  );
  if (!verified.length) return null;

  const primary = verified.find((entry) => entry.id === primaryEmailAddressId);
  const selected = primary ?? verified[0]!;
  return {
    email: normalizeEmail(selected.emailAddress),
    verifiedEmails: [...new Set(verified.map((entry) => normalizeEmail(entry.emailAddress)))],
  };
}

export function selectClerkDisplayName(
  firstName?: string | null,
  lastName?: string | null,
): string | undefined {
  const name = [firstName, lastName]
    .filter((part) => typeof part === 'string')
    .join(' ')
    .trim();
  return name || undefined;
}

export function buildVerifiedClerkProfile(user: ClerkBackendUserLike): SelectedClerkProfile | null {
  const selection = selectVerifiedClerkEmail(user.emailAddresses, user.primaryEmailAddressId);
  if (!selection) return null;
  const name = selectClerkDisplayName(user.firstName, user.lastName);
  return {
    email: selection.email,
    ...(name ? { name } : {}),
    verifiedEmails: selection.verifiedEmails,
  };
}
