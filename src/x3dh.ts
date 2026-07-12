import { ed25519, x25519 } from "@noble/curves/ed25519";
import { concatDhWithDomainSeparator, hkdfSha256 } from "./kdf";

const encoder = new TextEncoder();

export const X3DH_INFO_STRING = "WhisperText";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

export type X25519KeyPair = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
};

export type Ed25519KeyPair = {
  privateKey: Uint8Array;
  publicKey: Uint8Array;
};

export type BobBundle = {
  ikBPub: Uint8Array;
  spkBPub: Uint8Array;
  opkBPub: Uint8Array;
  opkId: number;
  spkSignature: Uint8Array;
  signingPub: Uint8Array;
};

export type BobState = {
  ikB: X25519KeyPair;
  spkB: X25519KeyPair;
  opkB: X25519KeyPair;
  signing: Ed25519KeyPair;
  bundle: BobBundle;
};

export type AliceState = {
  ikA: X25519KeyPair;
  ekA: X25519KeyPair;
};

export type DhSet = {
  dh1: Uint8Array;
  dh2: Uint8Array;
  dh3: Uint8Array;
  dh4: Uint8Array | null;
};

export type InitialMessage = {
  ikAPub: Uint8Array;
  ekAPub: Uint8Array;
  opkId: number;
  iv: Uint8Array;
  ciphertext: Uint8Array;
};

function generateX25519KeyPair(): X25519KeyPair {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

function generateEd25519KeyPair(): Ed25519KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { privateKey, publicKey };
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function equalBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

export function createBobState(): BobState {
  const ikB = generateX25519KeyPair();
  const spkB = generateX25519KeyPair();
  const opkB = generateX25519KeyPair();
  const signing = generateEd25519KeyPair();

  const spkSignature = ed25519.sign(spkB.publicKey, signing.privateKey);

  return {
    ikB,
    spkB,
    opkB,
    signing,
    bundle: {
      ikBPub: ikB.publicKey,
      spkBPub: spkB.publicKey,
      opkBPub: opkB.publicKey,
      opkId: 100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000),
      spkSignature,
      signingPub: signing.publicKey
    }
  };
}

export function verifySpkSignature(bundle: BobBundle): boolean {
  return ed25519.verify(bundle.spkSignature, bundle.spkBPub, bundle.signingPub);
}

export function createAliceState(): AliceState {
  return {
    ikA: generateX25519KeyPair(),
    ekA: generateX25519KeyPair()
  };
}

function dh(priv: Uint8Array, pub: Uint8Array): Uint8Array {
  return x25519.getSharedSecret(priv, pub);
}

export function computeAliceDhSet(alice: AliceState, bundle: BobBundle, withOpk = true): DhSet {
  return {
    dh1: dh(alice.ikA.privateKey, bundle.spkBPub),
    dh2: dh(alice.ekA.privateKey, bundle.ikBPub),
    dh3: dh(alice.ekA.privateKey, bundle.spkBPub),
    dh4: withOpk ? dh(alice.ekA.privateKey, bundle.opkBPub) : null
  };
}

export function computeBobDhSet(
  bob: BobState,
  ikAPub: Uint8Array,
  ekAPub: Uint8Array,
  withOpk = true
): DhSet {
  return {
    dh1: dh(bob.spkB.privateKey, ikAPub),
    dh2: dh(bob.ikB.privateKey, ekAPub),
    dh3: dh(bob.spkB.privateKey, ekAPub),
    dh4: withOpk ? dh(bob.opkB.privateKey, ekAPub) : null
  };
}

export async function deriveX3dhSharedSecret(dhSet: DhSet): Promise<Uint8Array> {
  // Per the X3DH spec, DH4 (the one-time prekey term) is simply omitted from
  // the concatenation when no OPK is available — the secret still forms from
  // DH1..DH3, it just loses the extra one-time forward-secrecy contribution.
  const dhParts = [dhSet.dh1, dhSet.dh2, dhSet.dh3];
  if (dhSet.dh4) {
    dhParts.push(dhSet.dh4);
  }
  const km = concatDhWithDomainSeparator(dhParts);
  const salt = new Uint8Array(32);
  const info = encoder.encode(X3DH_INFO_STRING);
  return hkdfSha256(km, salt, info, 32);
}

async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptInitialMessage(sharedSecret: Uint8Array, plaintext: string): Promise<{
  iv: Uint8Array;
  ciphertext: Uint8Array;
}> {
  const key = await importAesKey(sharedSecret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(plaintext);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: Uint8Array.from(iv) },
    key,
    toArrayBuffer(data)
  );
  return { iv, ciphertext: new Uint8Array(encrypted) };
}

export async function decryptInitialMessage(
  sharedSecret: Uint8Array,
  iv: Uint8Array,
  ciphertext: Uint8Array
): Promise<string> {
  const key = await importAesKey(sharedSecret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: Uint8Array.from(iv) },
    key,
    toArrayBuffer(ciphertext)
  );
  return new TextDecoder().decode(new Uint8Array(decrypted));
}

/**
 * The four experiments a learner can toggle. Each one performs REAL crypto:
 * `tamperSpkSignature` flips a byte and the Ed25519 verify genuinely fails;
 * `dropOpk` genuinely omits DH4 from both derivations; `corruptEkA` genuinely
 * corrupts the public EK_A Alice sends so Bob's reconstructed key no longer
 * matches. Nothing here fakes an outcome — the visualization reads the truth.
 */
export type Scenario = {
  tamperSpkSignature: boolean;
  dropOpk: boolean;
  corruptEkA: boolean;
};

export const DEFAULT_SCENARIO: Scenario = {
  tamperSpkSignature: false,
  dropOpk: false,
  corruptEkA: false
};

export async function buildDemoState(
  scenario: Scenario = DEFAULT_SCENARIO,
  seed?: { bob: BobState; alice: AliceState }
) {
  const bob = seed?.bob ?? createBobState();
  const alice = seed?.alice ?? createAliceState();

  // (b) Tamper the SPK signature: flip a byte on a COPY of the bundle so the
  // Ed25519 verification honestly fails, without corrupting the raw keypair.
  const bundle: BobBundle = { ...bob.bundle, spkSignature: Uint8Array.from(bob.bundle.spkSignature) };
  if (scenario.tamperSpkSignature) {
    bundle.spkSignature[0] ^= 0xff;
  }
  const signatureOk = verifySpkSignature(bundle);

  const withOpk = !scenario.dropOpk;

  // (d) Corrupt one byte of the EK_A public that travels to Bob. Alice still
  // computes her DH set with her REAL private/public pair, but the header Bob
  // receives is corrupted, so Bob's DH2/DH3/DH4 diverge and SK no longer matches.
  const ekAPubOnWire = Uint8Array.from(alice.ekA.publicKey);
  if (scenario.corruptEkA) {
    ekAPubOnWire[0] ^= 0xff;
  }

  const aliceDh = computeAliceDhSet(alice, bundle, withOpk);
  const bobDh = computeBobDhSet(bob, alice.ikA.publicKey, ekAPubOnWire, withOpk);

  const aliceSk = await deriveX3dhSharedSecret(aliceDh);
  const bobSk = await deriveX3dhSharedSecret(bobDh);
  const matchingSecrets = equalBytes(aliceSk, bobSk);

  const firstPlaintext = "Hi Bob, this first message is established with X3DH-derived SK.";
  const encrypted = await encryptInitialMessage(aliceSk, firstPlaintext);

  // Bob decrypts with HIS reconstructed key. If EK_A was corrupted the keys
  // differ and AES-GCM authentication genuinely throws — we surface that, we
  // do not fake a "match".
  let decryptedByBob: string | null = null;
  try {
    decryptedByBob = await decryptInitialMessage(bobSk, encrypted.iv, encrypted.ciphertext);
  } catch {
    decryptedByBob = null;
  }

  const initialMessage: InitialMessage = {
    ikAPub: alice.ikA.publicKey,
    ekAPub: ekAPubOnWire,
    opkId: bundle.opkId,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext
  };

  return {
    scenario,
    bob,
    alice,
    bundle,
    withOpk,
    signatureOk,
    aliceDh,
    bobDh,
    aliceSk,
    bobSk,
    matchingSecrets,
    initialMessage,
    firstPlaintext,
    decryptedByBob
  };
}
