import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { randomBytes } from "crypto";
import { encryptSecret, decryptSecret, timingSafeEqualString } from "./secretBox";

const ORIGINAL_KEY = process.env.EMAIL_TOKEN_ENCRYPTION_KEY;

beforeEach(() => {
  process.env.EMAIL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
  else process.env.EMAIL_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a plaintext secret", () => {
    const plaintext = "1//0gRefreshTokenLooksLikeThis-abc123";
    const envelope = encryptSecret(plaintext);
    expect(decryptSecret(envelope)).toBe(plaintext);
  });

  it("produces a different ciphertext each time (random IV) even for the same plaintext", () => {
    const plaintext = "same-secret";
    const a = encryptSecret(plaintext);
    const b = encryptSecret(plaintext);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plaintext);
    expect(decryptSecret(b)).toBe(plaintext);
  });

  it("never includes the plaintext verbatim in the envelope", () => {
    const plaintext = "super-secret-refresh-token-value";
    const envelope = encryptSecret(plaintext);
    expect(envelope).not.toContain(plaintext);
  });

  it("is versioned", () => {
    const envelope = encryptSecret("x");
    expect(envelope.startsWith("v1.")).toBe(true);
  });

  it("throws on a corrupted ciphertext instead of returning garbage", () => {
    const envelope = encryptSecret("secret-value");
    const parts = envelope.split(".");
    // Flip the ciphertext segment -- must fail GCM auth, not just decode differently.
    const tampered = [parts[0], parts[1], Buffer.from("not the real ciphertext").toString("base64"), parts[3]].join(
      ".",
    );
    expect(() => decryptSecret(tampered)).toThrow(/failed/i);
  });

  it("throws when the auth tag is tampered with", () => {
    const envelope = encryptSecret("secret-value");
    const parts = envelope.split(".");
    const tamperedTag = Buffer.from(parts[3], "base64");
    tamperedTag[0] ^= 0xff;
    const tampered = [parts[0], parts[1], parts[2], tamperedTag.toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow(/failed/i);
  });

  it("throws on an unrecognized envelope version", () => {
    const envelope = encryptSecret("secret-value");
    const parts = envelope.split(".");
    const futureVersion = ["v99", parts[1], parts[2], parts[3]].join(".");
    expect(() => decryptSecret(futureVersion)).toThrow(/unrecognized|corrupted/i);
  });

  it("throws on a completely malformed envelope", () => {
    expect(() => decryptSecret("not-an-envelope-at-all")).toThrow();
    expect(() => decryptSecret("")).toThrow();
  });

  it("throws when decrypting under a different key", () => {
    const envelope = encryptSecret("secret-value");
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(() => decryptSecret(envelope)).toThrow(/failed/i);
  });

  it("throws a clear error when EMAIL_TOKEN_ENCRYPTION_KEY is missing", () => {
    delete process.env.EMAIL_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptSecret("x")).toThrow(/EMAIL_TOKEN_ENCRYPTION_KEY/);
  });

  it("throws a clear error when EMAIL_TOKEN_ENCRYPTION_KEY is the wrong length", () => {
    process.env.EMAIL_TOKEN_ENCRYPTION_KEY = Buffer.from("too-short").toString("base64");
    expect(() => encryptSecret("x")).toThrow(/256 bits|32 bytes/i);
  });
});

describe("timingSafeEqualString", () => {
  it("returns true for identical strings", () => {
    expect(timingSafeEqualString("abc123", "abc123")).toBe(true);
  });

  it("returns false for different strings of the same length", () => {
    expect(timingSafeEqualString("abc123", "abc124")).toBe(false);
  });

  it("returns false for different-length strings without throwing", () => {
    expect(timingSafeEqualString("short", "a-much-longer-string")).toBe(false);
  });
});
