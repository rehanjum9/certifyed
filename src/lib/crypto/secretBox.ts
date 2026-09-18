import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from "crypto";

// Application-level authenticated encryption for secrets that must be
// stored at rest (currently: per-organization Gmail OAuth refresh tokens --
// see lib/email/connections.ts). AES-256-GCM via Node's own `crypto`,
// nothing invented: a random 96-bit IV per call (GCM's recommended size),
// the GCM auth tag verified on every decrypt, and an explicit envelope
// version so a future key rotation or algorithm change has somewhere to
// branch from without breaking already-stored ciphertext.

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const ENVELOPE_VERSION = "v1";

function loadKey(): Buffer {
  const raw = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "Server misconfiguration: EMAIL_TOKEN_ENCRYPTION_KEY must be set (a base64-encoded 256-bit key; " +
        'generate one with `node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"`).',
    );
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("Server misconfiguration: EMAIL_TOKEN_ENCRYPTION_KEY is not valid base64.");
  }

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `Server misconfiguration: EMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly ${KEY_LENGTH_BYTES} bytes (256 bits); got ${key.length}.`,
    );
  }

  return key;
}

/**
 * Encrypts one secret string into a self-contained, versioned envelope:
 * "v1.<iv-b64>.<ciphertext-b64>.<authTag-b64>". Safe to store directly in a
 * text column -- decryptSecret is the only way back to plaintext, and it
 * requires both the correct key and an intact auth tag.
 */
export function encryptSecret(plaintext: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [ENVELOPE_VERSION, iv.toString("base64"), ciphertext.toString("base64"), authTag.toString("base64")].join(
    ".",
  );
}

/**
 * Decrypts an encryptSecret() envelope. Throws (never returns a partial or
 * garbage result) if the envelope is malformed, was produced by an
 * unrecognized version, or fails GCM authentication -- e.g. the ciphertext
 * was truncated, edited, or encrypted under a different key. The thrown
 * message never includes the raw ciphertext or key material.
 */
export function decryptSecret(envelope: string): string {
  const key = loadKey();
  const parts = envelope.split(".");

  if (parts.length !== 4 || parts[0] !== ENVELOPE_VERSION) {
    throw new Error("Failed to decrypt secret: unrecognized or corrupted envelope format.");
  }

  const [, ivB64, ciphertextB64, authTagB64] = parts;

  let iv: Buffer;
  let ciphertext: Buffer;
  let authTag: Buffer;
  try {
    iv = Buffer.from(ivB64, "base64");
    ciphertext = Buffer.from(ciphertextB64, "base64");
    authTag = Buffer.from(authTagB64, "base64");
  } catch {
    throw new Error("Failed to decrypt secret: corrupted envelope encoding.");
  }

  if (iv.length !== IV_LENGTH_BYTES || authTag.length === 0) {
    throw new Error("Failed to decrypt secret: corrupted envelope encoding.");
  }

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    // GCM authentication failure (tampered/corrupted ciphertext or auth
    // tag, or the wrong key) and any other decrypt error are deliberately
    // collapsed into one generic message -- never leak which specific
    // check failed, and never echo any part of the input back.
    throw new Error("Failed to decrypt secret: authentication failed.");
  }
}

/** Constant-time equality for comparing a caller-supplied token against a stored value (e.g. hashed OAuth state) -- never a plain `===`, which leaks timing information proportional to the first mismatched byte. */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}
