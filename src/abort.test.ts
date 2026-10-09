import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDemoState, createAliceState, createBobState, DEFAULT_SCENARIO } from './x3dh';

afterEach(() => vi.restoreAllMocks());

describe('X3DH signed-prekey rejection before downstream crypto (Signal §3.3)', () => {
  for (const attack of ['tamperSpkSignature', 'substituteSpk'] as const) {
    for (const dropOpk of [false, true]) {
      it(`${attack}, OPK ${dropOpk ? 'absent' : 'present'}: no DH/KDF/session message`, async () => {
        const importKey = vi.spyOn(crypto.subtle, 'importKey');
        const hmac = vi.spyOn(crypto.subtle, 'sign');
        const encrypt = vi.spyOn(crypto.subtle, 'encrypt');
        const demo = await buildDemoState({ ...DEFAULT_SCENARIO, [attack]: true, dropOpk });
        expect(demo.signatureOk).toBe(false);
        expect(importKey).not.toHaveBeenCalled();
        expect(hmac).not.toHaveBeenCalled();
        expect(encrypt).not.toHaveBeenCalled();
        expect(demo.aliceDh).toBeNull();
        expect(demo.bobDh).toBeNull();
        expect(demo.aliceSk).toBeNull();
        expect(demo.bobSk).toBeNull();
        expect(demo.initialMessage).toBeNull();
        expect(demo.decryptedByBob).toBeNull();
        expect(demo.matchingSecrets).toBeNull();
      });
    }
  }

  it('a rejected run does not mutate the valid seed or prevent a later valid handshake', async () => {
    const seed = { bob: createBobState(), alice: createAliceState() };
    const rejected = await buildDemoState({ ...DEFAULT_SCENARIO, tamperSpkSignature: true }, seed);
    expect(rejected.initialMessage).toBeNull();
    const accepted = await buildDemoState(DEFAULT_SCENARIO, seed);
    expect(accepted.signatureOk).toBe(true);
    expect(accepted.matchingSecrets).toBe(true);
    expect(accepted.decryptedByBob).toBe(accepted.firstPlaintext);
  });
});
