import { randomBytes } from "node:crypto";

import { gcm } from "@noble/ciphers/aes.js";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, hexToBytes } from "@noble/hashes/utils.js";

const HKDF_INFO = new TextEncoder().encode("ecdsa_encryption");
const PUBLIC_KEY_BYTES = 65;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MIN_ENCRYPTED_BYTES = PUBLIC_KEY_BYTES + NONCE_BYTES + TAG_BYTES;

export interface VeniceE2EEKeypair {
  privateKey: Uint8Array;
  publicKeyHex: string;
}

function normalizePublicKeyHex(value: string): string {
  const raw = value.trim().replace(/^0x/i, "");
  const normalized = raw.length === 128 ? `04${raw}` : raw;
  if (!/^04[0-9a-fA-F]{128}$/.test(normalized)) {
    throw new Error("Invalid Venice E2EE public key");
  }
  return normalized.toLowerCase();
}

function deriveAesKey(privateKey: Uint8Array, publicKeyHex: string): Uint8Array {
  const sharedSecret = secp256k1.getSharedSecret(
    privateKey,
    hexToBytes(normalizePublicKeyHex(publicKeyHex)),
    false,
  );
  return hkdf(sha256, sharedSecret.slice(1, 33), undefined, HKDF_INFO, 32);
}

function randomNonce(): Uint8Array {
  return new Uint8Array(randomBytes(NONCE_BYTES));
}

function encryptWithKey(
  plaintext: string,
  privateKey: Uint8Array,
  publicKeyHex: string,
): string {
  const nonce = randomNonce();
  const aesKey = deriveAesKey(privateKey, publicKeyHex);
  const ciphertext = gcm(aesKey, nonce).encrypt(
    new TextEncoder().encode(plaintext),
  );
  return bytesToHex(
    concatBytes(secp256k1.getPublicKey(privateKey, false), nonce, ciphertext),
  );
}

export function generateVeniceE2EEKeypair(): VeniceE2EEKeypair {
  const privateKey = secp256k1.utils.randomSecretKey();
  return {
    privateKey,
    publicKeyHex: bytesToHex(secp256k1.getPublicKey(privateKey, false)),
  };
}

export function encryptForVeniceE2EE(
  plaintext: string,
  attestedPublicKeyHex: string,
): string {
  const requestKeypair = generateVeniceE2EEKeypair();
  return encryptWithKey(
    plaintext,
    requestKeypair.privateKey,
    normalizePublicKeyHex(attestedPublicKeyHex),
  );
}

export function isVeniceE2EEPayload(value: string): boolean {
  return (
    value.length >= MIN_ENCRYPTED_BYTES * 2 &&
    value.length % 2 === 0 &&
    value.startsWith("04") &&
    /^[0-9a-fA-F]+$/.test(value)
  );
}

export function decryptVeniceE2EEChunk(
  ciphertextHex: string,
  clientSessionPrivateKey: Uint8Array,
): string {
  if (!isVeniceE2EEPayload(ciphertextHex)) {
    throw new Error("Invalid Venice E2EE response chunk");
  }

  const raw = hexToBytes(ciphertextHex);
  const responsePublicKeyHex = bytesToHex(raw.slice(0, PUBLIC_KEY_BYTES));
  const nonce = raw.slice(PUBLIC_KEY_BYTES, PUBLIC_KEY_BYTES + NONCE_BYTES);
  const ciphertext = raw.slice(PUBLIC_KEY_BYTES + NONCE_BYTES);
  const aesKey = deriveAesKey(clientSessionPrivateKey, responsePublicKeyHex);
  return new TextDecoder().decode(gcm(aesKey, nonce).decrypt(ciphertext));
}

export function normalizeAttestedPublicKeyHex(value: string): string {
  return normalizePublicKeyHex(value);
}
