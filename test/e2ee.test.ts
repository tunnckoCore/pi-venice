import { describe, expect, test } from "bun:test";
import {
  generateVeniceE2EEKeypair,
  encryptForVeniceE2EE,
  decryptVeniceE2EEChunk,
  isVeniceE2EEPayload,
  normalizeAttestedPublicKeyHex,
} from "../src/e2ee.ts";

describe("e2ee", () => {
  describe("generateVeniceE2EEKeypair", () => {
    test("produces a valid secp256k1 keypair", () => {
      const keypair = generateVeniceE2EEKeypair();
      expect(keypair.privateKey).toBeInstanceOf(Uint8Array);
      expect(keypair.privateKey.length).toBe(32);
      expect(keypair.publicKeyHex).toHaveLength(130);
      expect(keypair.publicKeyHex.startsWith("04")).toBe(true);
      expect(/^[0-9a-f]+$/.test(keypair.publicKeyHex)).toBe(true);
    });

    test("produces unique keypairs each call", () => {
      const a = generateVeniceE2EEKeypair();
      const b = generateVeniceE2EEKeypair();
      expect(a.privateKey).not.toEqual(b.privateKey);
      expect(a.publicKeyHex).not.toBe(b.publicKeyHex);
    });
  });

  describe("encryptForVeniceE2EE + decryptVeniceE2EEChunk (roundtrip)", () => {
    test("encrypts and decrypts a plaintext message", () => {
      const recipientKeypair = generateVeniceE2EEKeypair();
      const plaintext = "Hello, Venice E2EE!";

      const ciphertext = encryptForVeniceE2EE(
        plaintext,
        recipientKeypair.publicKeyHex,
      );

      // Ciphertext should be hex, start with 04 (sender public key)
      expect(isVeniceE2EEPayload(ciphertext)).toBe(true);
      expect(ciphertext.startsWith("04")).toBe(true);

      // Decrypt with recipient private key
      const decrypted = decryptVeniceE2EEChunk(
        ciphertext,
        recipientKeypair.privateKey,
      );
      expect(decrypted).toBe(plaintext);
    });

    test("roundtrips multiline content", () => {
      const keypair = generateVeniceE2EEKeypair();
      const plaintext = "line one\nline two\nline three";
      const ciphertext = encryptForVeniceE2EE(plaintext, keypair.publicKeyHex);
      const decrypted = decryptVeniceE2EEChunk(ciphertext, keypair.privateKey);
      expect(decrypted).toBe(plaintext);
    });

    test("roundtrips unicode content", () => {
      const keypair = generateVeniceE2EEKeypair();
      const plaintext = "你好世界 🌍 こんにちは";
      const ciphertext = encryptForVeniceE2EE(plaintext, keypair.publicKeyHex);
      const decrypted = decryptVeniceE2EEChunk(ciphertext, keypair.privateKey);
      expect(decrypted).toBe(plaintext);
    });

    test("roundtrips empty string", () => {
      const keypair = generateVeniceE2EEKeypair();
      const plaintext = "";
      const ciphertext = encryptForVeniceE2EE(plaintext, keypair.publicKeyHex);
      const decrypted = decryptVeniceE2EEChunk(ciphertext, keypair.privateKey);
      expect(decrypted).toBe(plaintext);
    });

    test("produces different ciphertext each encryption (random nonce)", () => {
      const keypair = generateVeniceE2EEKeypair();
      const plaintext = "same message";
      const a = encryptForVeniceE2EE(plaintext, keypair.publicKeyHex);
      const b = encryptForVeniceE2EE(plaintext, keypair.publicKeyHex);
      expect(a).not.toBe(b);
    });

    test("fails to decrypt with wrong private key", () => {
      const recipientKeypair = generateVeniceE2EEKeypair();
      const wrongKeypair = generateVeniceE2EEKeypair();
      const ciphertext = encryptForVeniceE2EE(
        "secret",
        recipientKeypair.publicKeyHex,
      );
      expect(() =>
        decryptVeniceE2EEChunk(ciphertext, wrongKeypair.privateKey),
      ).toThrow();
    });
  });

  describe("isVeniceE2EEPayload", () => {
    test("accepts valid E2EE ciphertext", () => {
      const keypair = generateVeniceE2EEKeypair();
      const ciphertext = encryptForVeniceE2EE("test", keypair.publicKeyHex);
      expect(isVeniceE2EEPayload(ciphertext)).toBe(true);
    });

    test("rejects non-hex strings", () => {
      expect(isVeniceE2EEPayload("not hex at all!")).toBe(false);
    });

    test("rejects short hex strings", () => {
      expect(isVeniceE2EEPayload("04abcd")).toBe(false);
    });

    test("rejects hex strings that don't start with 04", () => {
      // 186 hex chars (93 bytes), all zeros, doesn't start with 04
      const longNon04Hex = "00" + "ab".repeat(92);
      expect(isVeniceE2EEPayload(longNon04Hex)).toBe(false);
    });

    test("rejects odd-length hex strings", () => {
      expect(isVeniceE2EEPayload("04" + "a".repeat(185))).toBe(false);
    });

    test("rejects empty string", () => {
      expect(isVeniceE2EEPayload("")).toBe(false);
    });
  });

  describe("normalizeAttestedPublicKeyHex", () => {
    test("normalizes uncompressed key with 04 prefix", () => {
      const keypair = generateVeniceE2EEKeypair();
      expect(normalizeAttestedPublicKeyHex(keypair.publicKeyHex)).toBe(
        keypair.publicKeyHex.toLowerCase(),
      );
    });

    test("prepends 04 to 128-hex raw key", () => {
      const keypair = generateVeniceE2EEKeypair();
      const rawKey = keypair.publicKeyHex.slice(2); // strip 04
      const normalized = normalizeAttestedPublicKeyHex(rawKey);
      expect(normalized).toBe(keypair.publicKeyHex.toLowerCase());
    });

    test("rejects invalid public keys", () => {
      expect(() => normalizeAttestedPublicKeyHex("not-a-key")).toThrow();
      expect(() => normalizeAttestedPublicKeyHex("04abcd")).toThrow();
    });
  });
});