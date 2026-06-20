import { describe, expect, it } from "vitest";
import { concatDhWithDomainSeparator, hkdfSha256 } from "./kdf";

function hex(s: string): Uint8Array {
  const clean = s.replace(/\s+/g, "");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Known-answer tests from RFC 5869, Appendix A.
 * https://datatracker.ietf.org/doc/html/rfc5869#appendix-A
 *
 * If these pass, our HKDF-SHA-256 extract-and-expand is byte-for-byte
 * interoperable with every conforming implementation.
 */
describe("hkdfSha256 — RFC 5869 known-answer vectors", () => {
  it("Test Case 1: basic SHA-256", async () => {
    const ikm = hex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
    const salt = hex("000102030405060708090a0b0c");
    const info = hex("f0f1f2f3f4f5f6f7f8f9");
    const okm = await hkdfSha256(ikm, salt, info, 42);
    expect(toHex(okm)).toBe(
      "3cb25f25faacd57a90434f64d0362f2a" +
        "2d2d0a90cf1a5a4c5db02d56ecc4c5bf" +
        "34007208d5b887185865"
    );
  });

  it("Test Case 2: longer inputs and output (L=82)", async () => {
    const ikm = hex(
      "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f" +
        "202122232425262728292a2b2c2d2e2f303132333435363738393a3b3c3d3e3f" +
        "404142434445464748494a4b4c4d4e4f"
    );
    const salt = hex(
      "606162636465666768696a6b6c6d6e6f707172737475767778797a7b7c7d7e7f" +
        "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f" +
        "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf"
    );
    const info = hex(
      "b0b1b2b3b4b5b6b7b8b9babbbcbdbebfc0c1c2c3c4c5c6c7c8c9cacbcccdcecf" +
        "d0d1d2d3d4d5d6d7d8d9dadbdcdddedfe0e1e2e3e4e5e6e7e8e9eaebecedeeef" +
        "f0f1f2f3f4f5f6f7f8f9fafbfcfdfeff"
    );
    const okm = await hkdfSha256(ikm, salt, info, 82);
    expect(toHex(okm)).toBe(
      "b11e398dc80327a1c8e7f78c596a4934" +
        "4f012eda2d4efad8a050cc4c19afa97c" +
        "59045a99cac7827271cb41c65e590e09" +
        "da3275600c2f09b8367793a9aca3db71" +
        "cc30c58179ec3e87c14c01d5c1f3434f" +
        "1d87"
    );
  });

  it("Test Case 3: zero-length salt and info", async () => {
    const ikm = hex("0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b0b");
    const okm = await hkdfSha256(ikm, new Uint8Array(0), new Uint8Array(0), 42);
    expect(toHex(okm)).toBe(
      "8da4e775a563c18f715f802a063c5a31" +
        "b8a11f5c5ee1879ec3454e5f3c738d2d" +
        "9d201395faa4b61a96c8"
    );
  });
});

describe("hkdfSha256 — length guards", () => {
  it("rejects zero length", async () => {
    await expect(hkdfSha256(new Uint8Array(8), new Uint8Array(0), new Uint8Array(0), 0)).rejects.toThrow();
  });

  it("rejects length above 255*HashLen", async () => {
    await expect(
      hkdfSha256(new Uint8Array(8), new Uint8Array(0), new Uint8Array(0), 255 * 32 + 1)
    ).rejects.toThrow();
  });

  it("produces exactly the requested length at the 8160-byte ceiling", async () => {
    const okm = await hkdfSha256(new Uint8Array(8), new Uint8Array(0), new Uint8Array(0), 255 * 32);
    expect(okm.length).toBe(255 * 32);
  });
});

describe("concatDhWithDomainSeparator", () => {
  it("prepends the 32-byte 0xFF X25519 domain separator", () => {
    const part = new Uint8Array([1, 2, 3]);
    const out = concatDhWithDomainSeparator([part]);
    expect(out.length).toBe(32 + 3);
    expect(Array.from(out.slice(0, 32)).every((b) => b === 0xff)).toBe(true);
    expect(Array.from(out.slice(32))).toEqual([1, 2, 3]);
  });

  it("concatenates DH parts in order after the separator", () => {
    const a = new Uint8Array([0xaa]);
    const b = new Uint8Array([0xbb]);
    const out = concatDhWithDomainSeparator([a, b]);
    expect(out[32]).toBe(0xaa);
    expect(out[33]).toBe(0xbb);
  });
});
