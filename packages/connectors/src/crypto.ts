import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Authenticated encryption for OAuth tokens at rest (AES-256-GCM).
 *
 * Tokens are never stored in plaintext. Ciphertext is a single self-describing
 * string: `v1:<iv>:<authTag>:<ciphertext>` (each part base64). The version
 * prefix lets us rotate the scheme later without ambiguity.
 *
 * Key: `TOKEN_ENCRYPTION_KEY` must decode to exactly 32 bytes. Accepts either a
 * 64-char hex string or a base64 string. Generate one with:
 *   openssl rand -base64 32
 */

const ALGORITHM = 'aes-256-gcm';
const VERSION = 'v1';
const IV_BYTES = 12;

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY is not set. Generate one with `openssl rand -base64 32`.',
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}).`);
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function decryptSecret(payload: string): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error('Malformed or unsupported encrypted secret.');
  }
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export function encryptNullable(value: string | null | undefined): string | null {
  return value == null ? null : encryptSecret(value);
}

export function decryptNullable(value: string | null | undefined): string | null {
  return value == null ? null : decryptSecret(value);
}

// ---------------------------------------------------------------------------
// OAuth state + PKCE helpers
// ---------------------------------------------------------------------------

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Opaque anti-CSRF value tied to a single authorization request. */
export function generateState(): string {
  return base64url(randomBytes(24));
}

/** PKCE code verifier (RFC 7636) — high-entropy URL-safe string. */
export function generateCodeVerifier(): string {
  return base64url(randomBytes(32));
}

/** S256 PKCE challenge derived from a verifier. */
export function deriveCodeChallenge(codeVerifier: string): string {
  return base64url(createHash('sha256').update(codeVerifier).digest());
}
