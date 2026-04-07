# crypto-lab-x3dh-wire

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://systemslibrarian.github.io/crypto-lab-x3dh-wire/)

`X25519 · HKDF-SHA-256 · Ed25519`

Browser-based interactive demonstration of the Extended Triple Diffie-Hellman (X3DH) key agreement protocol used before the Double Ratchet in secure messengers.

Signal X3DH specification reference: https://signal.org/docs/specifications/x3dh/

**Live demo:** https://systemslibrarian.github.io/crypto-lab-x3dh-wire/

## Overview

`crypto-lab-x3dh-wire` visualizes the asynchronous setup handshake where Alice can establish a shared secret with Bob even when Bob is offline.

The demo includes:

1. Bob prekey bundle creation (`IK_B`, `SPK_B`, `OPK_B`) and SPK signature verification.
2. Alice identity/ephemeral key generation and bundle fetch.
3. Four real X25519 operations (`DH1`, `DH2`, `DH3`, `DH4`).
4. X3DH key derivation using HKDF-SHA-256 with the spec-aligned construction.
5. Handoff message framing that transitions into the Double Ratchet root key flow.

## Protocol Steps

1. Bob publishes a prekey bundle containing `IK_B`, signed `SPK_B`, and `OPK_B`.
2. Alice creates `IK_A` and `EK_A`, fetches Bob's bundle, and verifies `SPK_B` signature.
3. Alice computes:
	- `DH1 = DH(IK_A, SPK_B)`
	- `DH2 = DH(EK_A, IK_B)`
	- `DH3 = DH(EK_A, SPK_B)`
	- `DH4 = DH(EK_A, OPK_B)`
4. Bob computes the corresponding DH values from his side.
5. Both parties derive `SK` from `F || DH1 || DH2 || DH3 || DH4` with HKDF-SHA-256 and the `WhisperText` info string.
6. Alice sends an initial message header (`IK_A`, `EK_A`, `OPK id`) plus ciphertext; Bob derives the same `SK` and decrypts.

## Primitives Used

1. `X25519` for all Diffie-Hellman operations.
2. `HKDF-SHA-256` for key derivation.
3. `Ed25519` for signed prekey authentication in this demo as an in-spec equivalent for SPK signature verification.

## Running Locally

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Build for production:

```bash
npm run build
```

## Security Notes

1. This demo performs real X25519 arithmetic with `@noble/curves`; no simulated DH outputs.
2. HKDF is implemented with SHA-256 via WebCrypto.
3. In X3DH, `OPK` is consumed after use. This one-time prekey consumption is what adds the one-time forward secrecy guarantee for initial asynchronous messages.
4. This project is educational and omits production concerns such as device trust UX, server trust, deniability subtleties, and replay policy enforcement.

## Why This Matters

1. Asynchronous secure messaging works even when recipients are offline.
2. Authentication and forward secrecy begin from the first encrypted message.
3. X3DH provides the initial shared secret that becomes the root key input for Double Ratchet.

## Related Demos

1. `crypto-lab-ratchet-wire`: https://github.com/systemslibrarian/crypto-lab-ratchet-wire
2. `crypto-compare` (Key Agreement category): https://github.com/systemslibrarian/crypto-compare
3. `crypto-lab` landing page: https://github.com/systemslibrarian/crypto-lab

## GitHub Pages

This site is deployed automatically via GitHub Actions to:
https://systemslibrarian.github.io/crypto-lab-x3dh-wire/

So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31