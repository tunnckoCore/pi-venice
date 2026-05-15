import { describe, expect, test } from "bun:test";
import {
  decryptVeniceE2EEChunk,
  encryptForVeniceE2EE,
  generateVeniceE2EEKeypair,
  isVeniceE2EEPayload,
  normalizeAttestedPublicKeyHex,
} from "../src/e2ee.ts";

describe("e2ee", () => {
  test("generates valid unique secp256k1 keypairs", () => {
    const a = generateVeniceE2EEKeypair();
    const b = generateVeniceE2EEKeypair();

    expect(a.privateKey).toBeInstanceOf(Uint8Array);
    expect(a.privateKey.length).toBe(32);
    expect(a.publicKeyHex).toHaveLength(130);
    expect(a.publicKeyHex.startsWith("04")).toBe(true);
    expect(a.publicKeyHex).not.toBe(b.publicKeyHex);
  });

  test("encrypts all messages with the caller-provided client session key", () => {
    const recipient = generateVeniceE2EEKeypair();
    const clientSession = generateVeniceE2EEKeypair();

    const first = encryptForVeniceE2EE(
      "first",
      clientSession.privateKey,
      recipient.publicKeyHex,
    );
    const second = encryptForVeniceE2EE(
      "second",
      clientSession.privateKey,
      recipient.publicKeyHex,
    );

    expect(isVeniceE2EEPayload(first)).toBe(true);
    expect(isVeniceE2EEPayload(second)).toBe(true);
    expect(first.slice(0, 130)).toBe(clientSession.publicKeyHex);
    expect(second.slice(0, 130)).toBe(clientSession.publicKeyHex);
    expect(first).not.toBe(second);
    expect(decryptVeniceE2EEChunk(first, recipient.privateKey)).toBe("first");
    expect(decryptVeniceE2EEChunk(second, recipient.privateKey)).toBe("second");
  });

  test("roundtrips multiline and unicode content", () => {
    const recipient = generateVeniceE2EEKeypair();
    const clientSession = generateVeniceE2EEKeypair();
    const plaintext = "line one\n你好世界 🌍\nline three";

    const ciphertext = encryptForVeniceE2EE(
      plaintext,
      clientSession.privateKey,
      recipient.publicKeyHex,
    );

    expect(decryptVeniceE2EEChunk(ciphertext, recipient.privateKey)).toBe(
      plaintext,
    );
  });

  test("rejects non-E2EE-looking payloads", () => {
    expect(isVeniceE2EEPayload("not hex at all!")).toBe(false);
    expect(isVeniceE2EEPayload("04abcd")).toBe(false);
    expect(isVeniceE2EEPayload("00" + "ab".repeat(92))).toBe(false);
    expect(isVeniceE2EEPayload("04" + "a".repeat(185))).toBe(false);
  });

  test("normalizes attested public keys", () => {
    const keypair = generateVeniceE2EEKeypair();
    const rawKey = keypair.publicKeyHex.slice(2);

    expect(normalizeAttestedPublicKeyHex(keypair.publicKeyHex)).toBe(
      keypair.publicKeyHex.toLowerCase(),
    );
    expect(normalizeAttestedPublicKeyHex(rawKey)).toBe(
      keypair.publicKeyHex.toLowerCase(),
    );
    expect(() => normalizeAttestedPublicKeyHex("not-a-key")).toThrow();
  });
});
