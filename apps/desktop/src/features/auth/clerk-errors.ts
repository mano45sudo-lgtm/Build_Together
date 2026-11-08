/**
 * Turn whatever a Clerk call returned into one sentence a person can act on.
 *
 * `@clerk/react/errors` is not a dependency of this package (it arrives transitively through
 * `@clerk/electron`), so the API-error shape is read structurally instead of with its type guard:
 * `ClerkAPIResponseError.errors[] = { code, message, longMessage }`.
 */

interface ApiErrorEntry {
  code?: unknown;
  message?: unknown;
  longMessage?: unknown;
}

function firstApiError(error: unknown): ApiErrorEntry | null {
  if (typeof error !== 'object' || error === null) return null;
  const list = (error as { errors?: unknown }).errors;
  if (Array.isArray(list) && typeof list[0] === 'object' && list[0] !== null) {
    return list[0] as ApiErrorEntry;
  }
  return null;
}

/** True for Clerk Frontend API errors, which carry their own user-facing wording. */
export function isClerkApiError(error: unknown): boolean {
  return firstApiError(error) !== null;
}

/** The Clerk error code (API errors first, then runtime errors), or null. */
export function clerkErrorCode(error: unknown): string | null {
  const entry = firstApiError(error);
  if (typeof entry?.code === 'string') return entry.code;
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return null;
}

/** Codes whose Clerk wording is technical or leaks detail; everything else uses Clerk's message. */
const FRIENDLY: Record<string, string> = {
  form_code_incorrect: 'That code is incorrect. Check the email and try again.',
  verification_expired: 'That code has expired. Send a new one.',
  verification_failed: 'Too many attempts with that code. Send a new one.',
  form_password_incorrect: 'Incorrect password. Try again, or reset it.',
  form_identifier_exists: 'An account already exists for this email.',
  form_param_format_invalid: 'Enter a valid email address.',
  form_password_pwned: 'This password has appeared in a data breach. Choose a different password.',
  too_many_requests: 'Too many attempts. Wait a moment, then try again.',
  network_error: 'Cue could not reach the sign-in service. Check your connection.',
};

export function clerkErrorMessage(error: unknown, fallback = 'Something went wrong. Try again.') {
  const code = clerkErrorCode(error);
  if (code && FRIENDLY[code]) return FRIENDLY[code];
  const entry = firstApiError(error);
  for (const candidate of [entry?.longMessage, entry?.message]) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  if (error instanceof Error && error.message && !/^Clerk[:\s]/.test(error.message)) {
    return error.message;
  }
  return fallback;
}
