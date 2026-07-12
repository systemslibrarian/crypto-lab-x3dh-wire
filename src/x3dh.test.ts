import { describe, expect, it } from "vitest";
import {
  buildDemoState,
  bytesToHex,
  computeAliceDhSet,
  computeBobDhSet,
  createAliceState,
  createBobState,
  decryptInitialMessage,
  deriveX3dhSharedSecret,
  encryptInitialMessage,
  equalBytes,
  verifySpkSignature
} from "./x3dh";

describe("bytesToHex", () => {
  it("lower-cases and zero-pads each byte", () => {
    expect(bytesToHex(new Uint8Array([0, 15, 255, 16]))).toBe("000fff10");
  });

  it("returns an empty string for empty input", () => {
    expect(bytesToHex(new Uint8Array(0))).toBe("");
  });
});

describe("equalBytes (constant-time compare)", () => {
  it("is true for identical content", () => {
    expect(equalBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3]))).toBe(true);
  });

  it("is false when any byte differs", () => {
    expect(equalBytes(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4]))).toBe(false);
  });

  it("is false for differing lengths", () => {
    expect(equalBytes(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3]))).toBe(false);
  });
});

describe("SPK signature authentication", () => {
  it("verifies a well-formed signed prekey", () => {
    const bob = createBobState();
    expect(verifySpkSignature(bob.bundle)).toBe(true);
  });

  it("rejects a tampered signed prekey", () => {
    const bob = createBobState();
    bob.bundle.spkBPub[0] ^= 0xff;
    expect(verifySpkSignature(bob.bundle)).toBe(false);
  });

  it("rejects a tampered signature", () => {
    const bob = createBobState();
    bob.bundle.spkSignature[0] ^= 0xff;
    expect(verifySpkSignature(bob.bundle)).toBe(false);
  });
});

describe("X3DH agreement symmetry", () => {
  it("Alice and Bob derive the same DH set and shared secret", async () => {
    const bob = createBobState();
    const alice = createAliceState();

    const aliceDh = computeAliceDhSet(alice, bob.bundle);
    const bobDh = computeBobDhSet(bob, alice.ikA.publicKey, alice.ekA.publicKey);

    // Each Diffie-Hellman pair must match across the two participants.
    expect(equalBytes(aliceDh.dh1, bobDh.dh1)).toBe(true);
    expect(equalBytes(aliceDh.dh2, bobDh.dh2)).toBe(true);
    expect(equalBytes(aliceDh.dh3, bobDh.dh3)).toBe(true);
    expect(equalBytes(aliceDh.dh4, bobDh.dh4)).toBe(true);

    const aliceSk = await deriveX3dhSharedSecret(aliceDh);
    const bobSk = await deriveX3dhSharedSecret(bobDh);
    expect(equalBytes(aliceSk, bobSk)).toBe(true);
    expect(aliceSk.length).toBe(32);
  });

  it("produces different secrets for independent sessions", async () => {
    const a = await deriveX3dhSharedSecret(computeAliceDhSet(createAliceState(), createBobState().bundle));
    const b = await deriveX3dhSharedSecret(computeAliceDhSet(createAliceState(), createBobState().bundle));
    expect(equalBytes(a, b)).toBe(false);
  });
});

describe("AES-GCM initial message", () => {
  it("round-trips plaintext under the derived shared secret", async () => {
    const bob = createBobState();
    const alice = createAliceState();
    const sk = await deriveX3dhSharedSecret(computeAliceDhSet(alice, bob.bundle));

    const message = "Hi Bob — first contact over X3DH.";
    const { iv, ciphertext } = await encryptInitialMessage(sk, message);
    const recovered = await decryptInitialMessage(sk, iv, ciphertext);
    expect(recovered).toBe(message);
  });

  it("fails authentication under a wrong key", async () => {
    const sk = await deriveX3dhSharedSecret(computeAliceDhSet(createAliceState(), createBobState().bundle));
    const wrong = await deriveX3dhSharedSecret(computeAliceDhSet(createAliceState(), createBobState().bundle));
    const { iv, ciphertext } = await encryptInitialMessage(sk, "secret");
    await expect(decryptInitialMessage(wrong, iv, ciphertext)).rejects.toThrow();
  });

  it("fails authentication when ciphertext is tampered", async () => {
    const sk = await deriveX3dhSharedSecret(computeAliceDhSet(createAliceState(), createBobState().bundle));
    const { iv, ciphertext } = await encryptInitialMessage(sk, "secret");
    ciphertext[0] ^= 0xff;
    await expect(decryptInitialMessage(sk, iv, ciphertext)).rejects.toThrow();
  });
});

describe("dropping the one-time prekey (DH4)", () => {
  it("omits DH4 yet Alice and Bob still derive an identical secret", async () => {
    const bob = createBobState();
    const alice = createAliceState();

    const aliceDh = computeAliceDhSet(alice, bob.bundle, false);
    const bobDh = computeBobDhSet(bob, alice.ikA.publicKey, alice.ekA.publicKey, false);

    expect(aliceDh.dh4).toBeNull();
    expect(bobDh.dh4).toBeNull();

    const aliceSk = await deriveX3dhSharedSecret(aliceDh);
    const bobSk = await deriveX3dhSharedSecret(bobDh);
    expect(equalBytes(aliceSk, bobSk)).toBe(true);
  });

  it("derives a DIFFERENT secret than the OPK-included run (DH4 changed the input)", async () => {
    const bob = createBobState();
    const alice = createAliceState();

    const withOpk = await deriveX3dhSharedSecret(computeAliceDhSet(alice, bob.bundle, true));
    const noOpk = await deriveX3dhSharedSecret(computeAliceDhSet(alice, bob.bundle, false));
    expect(equalBytes(withOpk, noOpk)).toBe(false);
  });
});

describe("buildDemoState (full end-to-end flow)", () => {
  it("yields matching secrets and a correct decryption", async () => {
    const demo = await buildDemoState();
    expect(demo.signatureOk).toBe(true);
    expect(demo.matchingSecrets).toBe(true);
    expect(demo.decryptedByBob).toBe(demo.firstPlaintext);
  });

  it("scenario: tampering the SPK signature flips verification to invalid but the secret still forms", async () => {
    const demo = await buildDemoState({ tamperSpkSignature: true, dropOpk: false, corruptEkA: false });
    expect(demo.signatureOk).toBe(false);
    // The DH agreement does not depend on the signature, so SK still matches.
    expect(demo.matchingSecrets).toBe(true);
  });

  it("scenario: dropping the OPK still yields matching secrets (weaker forward secrecy, not broken)", async () => {
    const demo = await buildDemoState({ tamperSpkSignature: false, dropOpk: true, corruptEkA: false });
    expect(demo.withOpk).toBe(false);
    expect(demo.aliceDh.dh4).toBeNull();
    expect(demo.matchingSecrets).toBe(true);
    expect(demo.decryptedByBob).toBe(demo.firstPlaintext);
  });

  it("scenario: corrupting one byte of EK_A on the wire breaks the shared secret and decryption", async () => {
    const demo = await buildDemoState({ tamperSpkSignature: false, dropOpk: false, corruptEkA: true });
    expect(demo.matchingSecrets).toBe(false);
    // AES-GCM authentication genuinely fails under the mismatched key.
    expect(demo.decryptedByBob).toBeNull();
  });
});
