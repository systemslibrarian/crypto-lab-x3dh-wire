const HMAC_NAME = "HMAC";
const HASH_NAME = "SHA-256";

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;

  for (const p of parts) {
    merged.set(p, offset);
    offset += p.length;
  }

  return merged;
}

async function importHmacKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    toArrayBuffer(rawKey),
    { name: HMAC_NAME, hash: HASH_NAME },
    false,
    ["sign"]
  );
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const cryptoKey = await importHmacKey(key);
  const signature = await crypto.subtle.sign(HMAC_NAME, cryptoKey, toArrayBuffer(data));
  return Uint8Array.from(new Uint8Array(signature));
}

export async function hkdfSha256(
  ikm: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  if (length <= 0 || length > 255 * 32) {
    throw new Error("HKDF length must be between 1 and 8160 bytes for SHA-256.");
  }

  const effectiveSalt = salt.length === 0 ? new Uint8Array(32) : salt;
  const prk = await hmacSha256(effectiveSalt, ikm);

  const blocks: Uint8Array[] = [];
  let previous: Uint8Array = new Uint8Array(0);
  let generated = 0;
  let counter = 1;

  while (generated < length) {
    const input = concatBytes(previous, info, new Uint8Array([counter]));
    previous = Uint8Array.from(await hmacSha256(prk, input));
    blocks.push(previous);
    generated += previous.length;
    counter += 1;
  }

  return concatBytes(...blocks).slice(0, length);
}

export function concatDhWithDomainSeparator(dhParts: Uint8Array[]): Uint8Array {
  const f = new Uint8Array(32).fill(0xff);
  return concatBytes(f, ...dhParts);
}
