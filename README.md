# crypto-lab-x3dh-wire

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://systemslibrarian.github.io/crypto-lab-x3dh-wire/)
[![CI](https://github.com/systemslibrarian/crypto-lab-x3dh-wire/actions/workflows/ci.yml/badge.svg)](https://github.com/systemslibrarian/crypto-lab-x3dh-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

## 1. What It Is

This project is a browser demo of the Extended Triple Diffie-Hellman (X3DH) handshake used to establish an initial shared secret for secure messaging. It uses X25519 for Diffie-Hellman operations, HKDF-SHA-256 for key derivation, and Ed25519 for signed prekey authentication in the demo flow. The protocol solves asynchronous first-contact key agreement so Alice can start a secure session while Bob is offline. In security-model terms, this is an asymmetric key agreement design that provides authentication and forward-secrecy properties for initial messages when one-time prekeys are used.

## 2. When to Use It

- Use it for asynchronous secure messaging bootstrapping: X3DH is designed so the initiator can derive a shared secret from published prekeys even when the recipient is offline.
- Use it when you need authenticated initial key agreement: signed prekeys bind the setup to recipient identity material before ratcheting starts.
- Use it when your system will transition into a ratchet protocol: X3DH cleanly produces the initial secret that feeds a Double Ratchet-style root key.
- Do not use it as a standalone long-term session protocol: X3DH establishes the starting secret, but ongoing message security needs a post-handshake ratchet and replay-handling design.

## 3. Live Demo

Live demo: https://systemslibrarian.github.io/crypto-lab-x3dh-wire/

The demo walks through Bob prekey bundle publication, Alice initiation, four DH computations, and final shared-secret derivation. You can navigate each protocol stage with the panel step buttons and Previous/Next controls while inspecting concrete key and ciphertext values rendered in each panel. The interface includes a dark/light theme toggle and does not expose user-tunable crypto parameters such as key size or iteration count.

## 4. How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-x3dh-wire.git
cd crypto-lab-x3dh-wire
npm install
npm run dev
```

No environment variables are required for local development.

## 5. Tests and Verification

```bash
npm run typecheck   # strict TypeScript, no emit
npm test            # Vitest suite
```

The cryptography is checked against known-answer test vectors and protocol invariants, not just exercised:

- **HKDF-SHA-256** is verified byte-for-byte against the [RFC 5869](https://datatracker.ietf.org/doc/html/rfc5869#appendix-A) Appendix A test vectors, so key derivation is interoperable with any conforming implementation.
- **X3DH agreement symmetry**: Alice's and Bob's four Diffie-Hellman results and the final derived shared secret are asserted equal, and independent sessions are asserted to differ.
- **Signed-prekey authentication**: valid bundles verify; tampered prekeys and tampered signatures are rejected.
- **AES-GCM initial message**: round-trips under the derived key, and fails authentication under a wrong key or a tampered ciphertext.

Every push and pull request runs typecheck plus the full suite via GitHub Actions (`.github/workflows/ci.yml`), and a deploy only ships after those pass.

## 6. Security Note

This is an **educational demonstration**, not a production cryptography library. It runs both sides of the handshake in a single browser tab to make every intermediate value visible, performs no networking or persistence, and signs the signed prekey with plain Ed25519 as an in-spec stand-in for the XEdDSA construction used in real X3DH deployments. Do not use it to secure real communications — use a vetted library such as [libsignal](https://github.com/signalfoundation/libsignal).

## 7. Part of the Crypto-Lab Suite

This demo is one module in the broader Crypto-Lab collection at https://systemslibrarian.github.io/crypto-lab/.

## 8. License

Released under the [MIT License](./LICENSE).

So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31