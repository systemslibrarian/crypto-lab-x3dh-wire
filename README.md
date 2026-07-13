# crypto-lab-x3dh-wire

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://systemslibrarian.github.io/crypto-lab-x3dh-wire/)
[![CI](https://github.com/systemslibrarian/crypto-lab-x3dh-wire/actions/workflows/ci.yml/badge.svg)](https://github.com/systemslibrarian/crypto-lab-x3dh-wire/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

## What It Is

This project is an interactive browser lab for the Extended Triple Diffie-Hellman (X3DH) handshake used to establish an initial shared secret for secure messaging. It uses X25519 for Diffie-Hellman operations, HKDF-SHA-256 for key derivation, and Ed25519 for signed prekey authentication in the demo flow. The protocol solves asynchronous first-contact key agreement so Alice can start a secure session while Bob is offline. In security-model terms, this is an asymmetric key agreement design that provides authentication and forward-secrecy properties for initial messages when one-time prekeys are used. Rather than paging through a fixed transcript, you can regenerate the keys, tamper the signed-prekey signature, drop the one-time prekey, or corrupt a byte of Alice's ephemeral key on the wire — and watch the real, in-browser handshake react, so each of the four DH operations turns from a claim into a demonstrated fact.

## When to Use It

- Use it for asynchronous secure messaging bootstrapping: X3DH is designed so the initiator can derive a shared secret from published prekeys even when the recipient is offline.
- Use it when you need authenticated initial key agreement: signed prekeys bind the setup to recipient identity material before ratcheting starts.
- Use it when your system will transition into a ratchet protocol: X3DH cleanly produces the initial secret that feeds a Double Ratchet-style root key.
- Use it to establish a starting secret only, not as a standalone long-term session protocol: ongoing message security needs a post-handshake ratchet and replay-handling design.
- Do NOT use it to secure real communications: it is an educational demo — use a vetted library such as [libsignal](https://github.com/signalfoundation/libsignal).

## Live Demo

**[systemslibrarian.github.io/crypto-lab-x3dh-wire](https://systemslibrarian.github.io/crypto-lab-x3dh-wire/)**

The lab is a guided walkthrough first: it opens with a "who holds what" orientation and then steps through Bob prekey bundle publication, Alice initiation, four DH computations, and final shared-secret derivation, five panels in order. The break-it experiments stay locked until you reach the final panel, so you build the handshake before you are handed tools to attack it. A "who holds what" diagram places Alice's private keys, Bob's private keys, and the public server bundle spatially. On the DH panel a viewpoint toggle draws the four Diffie-Hellman lines from the real private-key node one side holds to the real public-key node the other published (IK_A→SPK_B, EK_A→IK_B, EK_A→SPK_B, EK_A→OPK_B); flipping to Bob's view re-anchors each numbered line to the mirrored keys, so the symmetry is a traceable motion rather than decoration. A "why do two computations agree?" widget then takes one real pair (DH2) and shows Alice computing `DH(EK_A_priv, IK_B_pub)` beside Bob computing `DH(IK_B_priv, EK_A_pub)`, revealing the two 32-byte outputs as byte-for-byte identical — the concrete demonstration that `DH(a, B) = DH(b, A)` because `g^(ab) = g^(ba)` — and a "new keys" button re-runs it to show it holds every time. On the KDF panel the domain separator F and each 32-byte DH output slide into a single concatenated `KM` byte strip (its true length shown), which feeds one HKDF-SHA-256 box that emits the 32-byte session key, reusing the owner colors so each DHn region stays identifiable — making concrete that the secret *is* those concatenated bytes hashed. A three-beat timeline shows Bob offline at first contact. Four interactive experiments (regenerate keys, tamper the SPK signature, drop the one-time prekey, corrupt Alice's EK_A byte) re-run the real handshake and surface every downstream effect: signature verification flips, DH4 disappears, the two shared secrets converge or split with a byte-level diff, the commutativity widget's outputs stop matching, and Bob's decryption succeeds or authentically fails. Each DH row also expands to name the concrete threat that pairing defends against. First-use tooltips gloss prekey, signed prekey, ephemeral key, OPK, forward secrecy, XEdDSA, the 0xFF domain separator, and the HKDF info string. Full 64-char hex collapses to a head/tail chip you can click to expand, color-coded by owner (Alice / Bob / public). The interface includes a dark/light theme toggle and does not expose user-tunable crypto parameters such as key size or iteration count.

## What Can Go Wrong

- Without one-time prekeys, the handshake loses some of its forward-secrecy strength against an attacker who later compromises the recipient's keys.
- X3DH alone provides no protection for ongoing messages or replay handling; it must hand off to a post-handshake ratchet (e.g. Double Ratchet) for continued security.
- A compromised or unrotated signed prekey weakens authentication of the session setup; prekeys must be rotated and exhausted one-time prekeys replenished.
- Compromise of an identity key undermines authentication of future handshakes, so identity-key protection is critical.
- The demo runs both sides in one browser tab with no networking or persistence and substitutes plain Ed25519 for XEdDSA, so it illustrates the protocol shape rather than a deployable transport.

## Real-World Usage

- The Signal Protocol uses X3DH to bootstrap sessions before the Double Ratchet takes over.
- WhatsApp's end-to-end encryption is built on the Signal Protocol, including its X3DH-style handshake.
- Google Messages RCS end-to-end encryption uses the Signal Protocol for key agreement.
- Other messaging systems adopting the Signal Protocol (such as Session and Signal-based forks) rely on the same asynchronous-handshake design.

## How to Run Locally

```bash
git clone https://github.com/systemslibrarian/crypto-lab-x3dh-wire
cd crypto-lab-x3dh-wire
npm install
npm run dev
```

## Related Demos
- [crypto-lab-ratchet-wire](https://systemslibrarian.github.io/crypto-lab-ratchet-wire/) — the Double Ratchet that takes over after X3DH establishes the initial secret.
- [crypto-lab-key-exchange](https://systemslibrarian.github.io/crypto-lab-key-exchange/) — the Diffie-Hellman / ECDH / X25519 foundations X3DH is built from.
- [crypto-lab-noise-pipe](https://systemslibrarian.github.io/crypto-lab-noise-pipe/) — the Noise framework's handshake patterns, an alternative key-agreement design.
- [crypto-lab-mls-group](https://systemslibrarian.github.io/crypto-lab-mls-group/) — group key agreement (MLS/TreeKEM) for the many-party case.
- [crypto-lab-hybrid-wire](https://systemslibrarian.github.io/crypto-lab-hybrid-wire/) — X25519 + ML-KEM-768 hybrid key exchange for post-quantum migration.

## Tests and Verification

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

## Security Note

This is an **educational demonstration**, not a production cryptography library. It runs both sides of the handshake in a single browser tab to make every intermediate value visible, performs no networking or persistence, and signs the signed prekey with plain Ed25519 as an in-spec stand-in for the XEdDSA construction used in real X3DH deployments. Do not use it to secure real communications — use a vetted library such as [libsignal](https://github.com/signalfoundation/libsignal).

## License

Released under the [MIT License](./LICENSE).

---

*One of 120+ browser demos in the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*
