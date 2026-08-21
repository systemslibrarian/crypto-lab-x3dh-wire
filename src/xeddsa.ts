/**
 * XEdDSA over Curve25519 — the signature scheme X3DH actually specifies.
 *
 * X3DH says Bob's prekey bundle carries `Sig(IK_B, Encode(SPK_B))`, where `Sig`
 * is "an XEdDSA signature on the byte sequence M". The point of XEdDSA is that
 * ONE key does double duty: the same Curve25519 secret that performs the four
 * Diffie-Hellmans also produces the signature, so the signature is bound to the
 * identity key Alice authenticates Bob by. A signature made with some separate,
 * freshly-generated signing key published in the same bundle would authenticate
 * nothing — an attacker who replaces the bundle replaces that key too.
 *
 * Implemented directly from the Signal specification
 * (https://signal.org/docs/specifications/xeddsa/), section 2.4 / 2.5:
 *
 *   calculate_key_pair(k):
 *       E = kB;  A.y = E.y;  A.s = 0
 *       a = -k (mod q) if E.s == 1 else k (mod q)
 *
 *   xeddsa_sign(k, M, Z):
 *       A, a = calculate_key_pair(k)
 *       r = hash_1(a || M || Z) (mod q)
 *       R = rB
 *       h = hash(R || A || M) (mod q)
 *       s = r + ha (mod q)
 *       return R || s
 *
 *   xeddsa_verify(u, M, (R || s)):
 *       if u >= p or s >= q: return false
 *       A = convert_mont(u)            // y = (u - 1) / (u + 1) mod p, sign bit 0
 *       if not on_curve(A): return false
 *       h = hash(R || A || M) (mod q)
 *       Rcheck = sB - hA
 *       return bytes_equal(R, Rcheck)
 *
 * `hash` is SHA-512 and `hash_i(X) = SHA-512(2^b - 1 - i || X)` with b = 256, so
 * `hash_1` prefixes 0xFE followed by 31 bytes of 0xFF (matching libsignal's
 * `sign_modified.c`). That prefix is what keeps signature hashing domain-separated
 * from the 32 bytes of 0xFF X3DH prepends to its KDF input.
 *
 * This is a teaching implementation: it is written for legibility against the
 * spec text above, not for constant-time execution or side-channel resistance.
 */
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { bytesToNumberLE, numberToBytesLE } from "@noble/curves/utils.js";
import { sha512 } from "@noble/hashes/sha2.js";

const Point = ed25519.Point;
/** Field of the curve coordinates, mod p = 2^255 - 19. */
const Fp = Point.Fp;
/** Field of the scalars, mod q = the prime order of the base point. */
const Fn = Point.Fn;
const BASE = Point.BASE;

/** `hash_i(X) = SHA-512(2^b - 1 - i || X)`, little-endian, b = 256. */
function hashPrefix(i: number): Uint8Array {
  const prefix = new Uint8Array(32).fill(0xff);
  prefix[0] = 0xff - i;
  return prefix;
}

/** 0xFE ‖ 0xFF × 31 — the `hash_1` domain separator used for the nonce. */
export const XEDDSA_HASH1_PREFIX = hashPrefix(1);

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/** X25519 secret-key clamping, as applied inside every X25519 scalar multiply. */
function clampMontgomerySecret(secret: Uint8Array): Uint8Array {
  const k = Uint8Array.from(secret);
  k[0] &= 248;
  k[31] &= 127;
  k[31] |= 64;
  return k;
}

/**
 * `calculate_key_pair(k)` — turn a Curve25519 secret into the Edwards scalar `a`
 * and the Edwards public key `A` whose encoding always has sign bit 0. Forcing
 * that bit is what makes `A` recoverable from the Montgomery public key alone:
 * the u-coordinate is the same for a point and its negation, so the convention
 * picks one of the two deterministically.
 */
export function calculateKeyPair(montgomerySecret: Uint8Array): { scalar: bigint; edwardsPublic: Uint8Array } {
  const k = Fn.create(bytesToNumberLE(clampMontgomerySecret(montgomerySecret)));
  const E = BASE.multiply(k);
  const encoded = E.toBytes();
  const signBit = (encoded[31] >>> 7) & 1;
  const scalar = signBit === 1 ? Fn.neg(k) : k;
  const edwardsPublic = Uint8Array.from(encoded);
  edwardsPublic[31] &= 0x7f; // A.s = 0
  return { scalar, edwardsPublic };
}

/**
 * `convert_mont(u)` — recover the Edwards public key from an X25519 public key
 * via the birational map `y = (u - 1) / (u + 1) mod p`, sign bit 0.
 *
 * This is the whole reason XEdDSA authenticates: the verifier does not need a
 * separately-published signing key, because the only key that can produce a
 * signature verifying here is the holder of the X25519 secret behind `u`.
 * Returns null when `u` has no valid conversion.
 */
export function montgomeryPublicToEdwards(montgomeryPublic: Uint8Array): Uint8Array | null {
  if (montgomeryPublic.length !== 32) return null;
  const masked = Uint8Array.from(montgomeryPublic);
  masked[31] &= 0x7f; // umasked = u (mod 2^|p|)
  const u = bytesToNumberLE(masked);
  if (u >= Fp.ORDER) return null; // spec: reject u >= p
  const denominator = Fp.add(u, 1n);
  if (Fp.is0(denominator)) return null; // u = -1 has no image
  const y = Fp.mul(Fp.sub(u, 1n), Fp.inv(denominator));
  return numberToBytesLE(y, 32); // y < p < 2^255, so the sign bit is already 0
}

/**
 * `xeddsa_sign(k, M, Z)`. `randomZ` (64 bytes) is exposed only so tests can pin
 * a nonce; production callers leave it out and get fresh randomness.
 */
export function xeddsaSign(montgomerySecret: Uint8Array, message: Uint8Array, randomZ?: Uint8Array): Uint8Array {
  const { scalar: a, edwardsPublic: A } = calculateKeyPair(montgomerySecret);
  const aBytes = numberToBytesLE(a, 32);

  for (;;) {
    const Z = randomZ ?? crypto.getRandomValues(new Uint8Array(64));
    if (Z.length !== 64) {
      throw new Error("XEdDSA nonce Z must be 64 bytes.");
    }
    const r = Fn.create(bytesToNumberLE(sha512(concatBytes(XEDDSA_HASH1_PREFIX, aBytes, message, Z))));
    if (r === 0n) {
      // Astronomically unlikely (~2^-252); redraw rather than multiply by zero.
      if (randomZ) throw new Error("XEdDSA nonce produced r = 0; choose a different Z.");
      continue;
    }
    const R = BASE.multiply(r);
    const rBytes = R.toBytes();
    const h = Fn.create(bytesToNumberLE(sha512(concatBytes(rBytes, A, message))));
    const s = Fn.add(r, Fn.mul(h, a));
    return concatBytes(rBytes, numberToBytesLE(s, 32));
  }
}

/**
 * `xeddsa_verify(u, M, (R || s))` — verify against the X25519 public key itself.
 * There is no separate signing public key to publish, and therefore none to swap.
 */
export function xeddsaVerify(montgomeryPublic: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean {
  if (signature.length !== 64) return false;

  const A = montgomeryPublicToEdwards(montgomeryPublic);
  if (!A) return false;

  let publicPoint;
  try {
    publicPoint = Point.fromBytes(A); // rejects a y with no point on the curve
  } catch {
    return false;
  }

  const rBytes = signature.slice(0, 32);
  const s = bytesToNumberLE(signature.slice(32, 64));
  if (s >= Fn.ORDER) return false; // spec: reject s >= q

  const h = Fn.create(bytesToNumberLE(sha512(concatBytes(rBytes, A, message))));
  const sB = s === 0n ? Point.ZERO : BASE.multiplyUnsafe(s);
  const hA = h === 0n ? Point.ZERO : publicPoint.multiplyUnsafe(h);
  const rCheck = sB.subtract(hA);

  return constantTimeEqual(rCheck.toBytes(), rBytes);
}

/** Convenience re-export so callers can generate the Curve25519 key this signs with. */
export function randomMontgomerySecret(): Uint8Array {
  return x25519.utils.randomSecretKey();
}
