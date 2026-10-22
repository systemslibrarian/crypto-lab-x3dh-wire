# crypto-lab-x3dh-wire

[![GitHub Pages](https://img.shields.io/badge/demo-live-brightgreen)](https://systemslibrarian.github.io/crypto-lab-x3dh-wire/)
[![CI](https://github.com/systemslibrarian/crypto-lab-x3dh-wire/actions/workflows/deploy.yml/badge.svg)](https://github.com/systemslibrarian/crypto-lab-x3dh-wire/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)

## What It Is

This browser lab teaches the Extended Triple Diffie-Hellman (X3DH) handshake. It computes real X25519 Diffie-Hellman operations, HKDF-SHA-256, and XEdDSA signatures on signed prekeys. The signature binds a prekey to the **identity key in the offered bundle**; Alice must independently verify that this identity key belongs to Bob. The five-panel walkthrough demonstrates asynchronous setup while Bob is offline. A new whole-bundle substitution experiment shows a valid signed-prekey signature beside a mismatch against an independently trusted Bob identity fingerprint. The deliberately unpinned continuation lets the attacker derive Alice's key and decrypt her first message while Bob cannot. This distinguishes cryptographic bundle consistency from authentication of its owner.

## When to Use It

- Use it for asynchronous secure messaging bootstrapping: X3DH is designed so the initiator can derive a shared secret from published prekeys even when the recipient is offline.
- Use it to study authenticated initial key agreement: signed prekeys bind the setup to an identity key, while an authenticated comparison or trusted pin establishes whose key it is.
- Use it when your system will transition into a ratchet protocol: X3DH cleanly produces the initial secret that feeds a Double Ratchet-style root key.
- Use it to establish a starting secret only, not as a standalone long-term session protocol: ongoing message security needs a post-handshake ratchet and replay-handling design.
- Do NOT use it to secure real communications: it is an educational demo — use a vetted library such as [libsignal](https://github.com/signalfoundation/libsignal).

## Live Demo

**[systemslibrarian.github.io/crypto-lab-x3dh-wire](https://systemslibrarian.github.io/crypto-lab-x3dh-wire/)**

The lab opens with a "who holds what" view, then steps through bundle publication, Alice's initiation, three DH operations plus an optional fourth when a one-time prekey is present, key derivation, and the first encrypted message. Break-it controls unlock after the five-panel walkthrough. Panel 1 displays complete SHA-256 fingerprints of Bob's independently trusted identity key and the identity key in the offered bundle, plus a separate signed-prekey signature verdict. The six controls regenerate keys, tamper a signature, replace one prekey, replace the whole bundle, omit a one-time prekey, or corrupt Alice's ephemeral public key. The whole-bundle case has a valid signature but a failed pin: the safe, pinned path would abort, while the explicitly unpinned teaching continuation shows actual key derivation and AES-GCM decryption by the attacker. A full fingerprint is used only as a comparison aid. This lab does not implement Signal's safety-number encoding, a short authentication string, or actual human identity verification; the trusted reference is supplied by the teaching fixture.

## What Can Go Wrong

- A failed signed-prekey signature aborts before DH, key derivation or initial-message encryption, as required by [X3DH §3.3](https://signal.org/docs/specifications/x3dh/#sending-the-initial-message). The tamper and relay-substitution controls show this rejected outcome and disable downstream panels; they do not establish a session while ignoring verification.
- Without one-time prekeys, the handshake loses some of its forward-secrecy strength against an attacker who later compromises the recipient's keys.
- X3DH alone provides no protection for ongoing messages or replay handling; it must hand off to a post-handshake ratchet (e.g. Double Ratchet) for continued security.
- A compromised or unrotated signed prekey weakens authentication of the session setup; prekeys must be rotated and exhausted one-time prekeys replenished.
- Compromise of an identity key undermines authentication of future handshakes, so identity-key protection is critical.
- A valid signed-prekey signature proves only that the holder of the published identity key chose that prekey — it cannot prove the identity key is Bob's. An attacker who substitutes the whole bundle produces one that verifies. This lab checks its complete SHA-256 identity fingerprint against a separately trusted Bob key, and deliberately continues an unpinned branch to show the attack. [X3DH §4.1](https://signal.org/docs/specifications/x3dh/#authentication) describes authentication of identity keys; [§4.8](https://signal.org/docs/specifications/x3dh/#identity-binding) explains that identity misbinding can remain even after fingerprint comparison.
- The demo runs both sides in one browser tab with no networking or persistence, and omits X3DH's associated-data field (AD = Encode(IK_A) || Encode(IK_B)) from the AEAD call, so the initial ciphertext is not cryptographically bound to the two identity keys. It illustrates the protocol shape rather than a deployable transport.

## Real-World Usage

X3DH is the classical asynchronous-handshake foundation taught here. Signal announced [PQXDH on September 19, 2023](https://signal.org/blog/pqxdh/) for post-quantum setup protection and [SPQR / Triple Ratchet on October 2, 2025](https://signal.org/blog/spqr/) for continuing post-quantum ratcheting. Announcement dates are not universal migration dates for all sessions or other adopters.

Related lessons: [PQXDH Wire](https://systemslibrarian.github.io/crypto-lab-pqxdh-wire/) and [Ratchet Wire](https://systemslibrarian.github.io/crypto-lab-ratchet-wire/). Ratchet Wire’s ML-KEM setup plus classical Double Ratchet is not an SPQR implementation.

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
- **XEdDSA** is implemented against the [Signal XEdDSA specification](https://signal.org/docs/specifications/xeddsa/): the `hash_1` prefix, the `convert_mont` birational map, the forced sign bit, and the `Rcheck = sB - hA` verification are each asserted. Signatures produced here also verify under an independent Ed25519 verifier given `A = convert_mont(u)`, which is what XEdDSA verification is defined to be.
- **Signed-prekey authentication**: valid bundles verify; tampered prekeys and tampered signatures are rejected; and a prekey signed by any *other* identity key is rejected — the signature is checked against the bundle's own IK_B, so there is no separate signing key an attacker could swap in alongside it.
- **Identity pin versus self-consistent bundle**: the same Bob, Alice, and attacker key pairs are tested in honest and whole-bundle-swap runs. The attacker signature remains valid, the offered fingerprint differs from the trusted Bob fingerprint, Alice and the attacker derive matching secrets, Bob derives a different one, and only the attacker decrypts on the deliberately unpinned branch. A browser test checks the visible outcomes and recovery to the honest run.
- **AES-GCM initial message**: round-trips under the derived key, and fails authentication under a wrong key or a tampered ciphertext.

Every push and pull request runs typecheck plus the full suite via GitHub Actions (`.github/workflows/deploy.yml`), and a deploy only ships after those pass.

## Security Note

This is an **educational demonstration**, not a production cryptography library. It runs both sides of the handshake in a single browser tab to make every intermediate value visible, and performs no networking or persistence. It implements XEdDSA for legibility against the specification rather than for constant-time execution, and it omits X3DH's associated-data (AD) field, which real deployments pass to the AEAD to bind the initial ciphertext to both identity keys. Do not use it to secure real communications — use a vetted library such as [libsignal](https://github.com/signalfoundation/libsignal).

## License

Released under the [MIT License](./LICENSE).

---

*Part of the [Crypto Lab](https://crypto-lab.systemslibrarian.dev/) suite.*

*"So whether you eat or drink or whatever you do, do it all for the glory of God." — 1 Corinthians 10:31*

## Publishing requests

`npm run deploy` requests the existing `deploy.yml` workflow at `main`.
The workflow retains its full type, unit, build and browser gates. A successful
request is not evidence of publication; inspect the run and actual public site.
Failed requests retain their nonzero exit status.
