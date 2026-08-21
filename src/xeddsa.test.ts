import { x25519 } from "@noble/curves/ed25519.js";
import { numberToBytesLE } from "@noble/curves/utils.js";
import { describe, expect, it } from "vitest";
import {
  calculateKeyPair,
  montgomeryPublicToEdwards,
  XEDDSA_HASH1_PREFIX,
  xeddsaSign,
  xeddsaVerify
} from "./xeddsa";

const P = 2n ** 255n - 19n;

function secret(): Uint8Array {
  return x25519.utils.randomSecretKey();
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

describe("XEdDSA spec constants", () => {
  // hash_i(X) = SHA-512(2^b - 1 - i || X) with b = 256, so hash_1 prefixes
  // 2^256 - 2 little-endian. libsignal's sign_modified.c writes exactly this.
  it("hash_1 prefixes 0xFE followed by 31 bytes of 0xFF", () => {
    expect(XEDDSA_HASH1_PREFIX.length).toBe(32);
    expect(XEDDSA_HASH1_PREFIX[0]).toBe(0xfe);
    expect(Array.from(XEDDSA_HASH1_PREFIX.slice(1)).every((b) => b === 0xff)).toBe(true);
  });
});

describe("convert_mont (birational map)", () => {
  it("recovers, from the X25519 public key alone, the same A that signing uses", () => {
    for (let i = 0; i < 25; i += 1) {
      const k = secret();
      const fromPublic = montgomeryPublicToEdwards(x25519.getPublicKey(k));
      expect(fromPublic).not.toBeNull();
      expect(bytesEqual(fromPublic!, calculateKeyPair(k).edwardsPublic)).toBe(true);
    }
  });

  it("always yields sign bit 0, which is what makes A unambiguous", () => {
    for (let i = 0; i < 25; i += 1) {
      const A = montgomeryPublicToEdwards(x25519.getPublicKey(secret()))!;
      expect(A[31] & 0x80).toBe(0);
    }
  });

  it("rejects u = p - 1, where u + 1 has no inverse", () => {
    expect(montgomeryPublicToEdwards(numberToBytesLE(P - 1n, 32))).toBeNull();
  });

  it("rejects a wrong-length public key", () => {
    expect(montgomeryPublicToEdwards(new Uint8Array(31))).toBeNull();
  });
});

describe("XEdDSA sign / verify", () => {
  it("round-trips: a signature made with an X25519 secret verifies against its X25519 public key", () => {
    for (let i = 0; i < 25; i += 1) {
      const k = secret();
      const message = crypto.getRandomValues(new Uint8Array(32));
      expect(xeddsaVerify(x25519.getPublicKey(k), message, xeddsaSign(k, message))).toBe(true);
    }
  });

  it("emits 64-byte R‖s signatures", () => {
    expect(xeddsaSign(secret(), new Uint8Array(32)).length).toBe(64);
  });

  it("is deterministic for a pinned nonce Z and randomised otherwise", () => {
    const k = secret();
    const message = new Uint8Array(32).fill(9);
    const Z = new Uint8Array(64).fill(3);
    expect(bytesEqual(xeddsaSign(k, message, Z), xeddsaSign(k, message, Z))).toBe(true);
    expect(bytesEqual(xeddsaSign(k, message), xeddsaSign(k, message))).toBe(false);
  });

  it("rejects a tampered message", () => {
    const k = secret();
    const message = new Uint8Array(32).fill(1);
    const signature = xeddsaSign(k, message);
    const altered = Uint8Array.from(message);
    altered[0] ^= 0xff;
    expect(xeddsaVerify(x25519.getPublicKey(k), altered, signature)).toBe(false);
  });

  it("rejects tampering in either half of the signature", () => {
    const k = secret();
    const message = new Uint8Array(32).fill(1);
    const publicKey = x25519.getPublicKey(k);
    const signature = xeddsaSign(k, message);

    for (const index of [0, 31, 32, 63]) {
      const altered = Uint8Array.from(signature);
      altered[index] ^= index === 63 ? 0x01 : 0xff;
      expect(xeddsaVerify(publicKey, message, altered)).toBe(false);
    }
  });

  it("rejects a wrong-length signature", () => {
    const k = secret();
    expect(xeddsaVerify(x25519.getPublicKey(k), new Uint8Array(32), new Uint8Array(63))).toBe(false);
  });

  // The whole point: the verifier's key comes from the DH key, so a signature
  // made under any other secret cannot be presented as this key's.
  it("rejects a signature made under a different secret — the identity binding", () => {
    const message = new Uint8Array(32).fill(4);
    const bob = secret();
    const attacker = secret();
    const attackerSignature = xeddsaSign(attacker, message);

    expect(xeddsaVerify(x25519.getPublicKey(bob), message, attackerSignature)).toBe(false);
    expect(xeddsaVerify(x25519.getPublicKey(attacker), message, attackerSignature)).toBe(true);
  });
});
