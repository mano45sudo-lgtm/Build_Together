import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing via Argon2id (established KDF; no custom crypto). Parameters follow the
 * OWASP minimum recommendation. @node-rs/argon2's DEFAULT algorithm is Argon2id (its docs mark
 * value 2 "the default algorithm for normative recommendations"), so we intentionally do NOT name
 * the ambient `Algorithm` const enum here — it cannot be imported under `verbatimModuleSyntax`, and
 * the default is exactly what we want. The produced hash embeds `$argon2id$` + its own parameters +
 * salt, so verification needs only the stored hash. Plaintext passwords are never stored or logged.
 */
const ARGON2_OPTIONS = {
  memoryCost: 19456, // 19 MiB
  timeCost: 2,
  outputLen: 32,
  parallelism: 1,
};

export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Constant-time verification. Returns false (never throws) for malformed/stale hashes. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
