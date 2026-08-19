import { expect, test } from '@playwright/test';
import {
  boot,
  driveAllStates,
  expectBaselineNotStale,
  NARROW,
  reportCollected,
  watchPageErrors,
} from './gate';

/**
 * WCAG A/AA regression gate.
 *
 * The lab is driven along everything it teaches: the arrival state, where the
 * page sits on Panel 1 with a valid signature, every hex chip collapsed and
 * the break-it experiments locked; both skip links focused; a glossary
 * popover held open on hover; a hex chip expanded to its full 32-byte value;
 * a kv row focused, which is the keyboard route into the rows that scroll at
 * 380px; all five panels scanned while each is the live panel — including the
 * crossing diagram in BOTH viewpoints, an open threat disclosure, and a
 * commutativity recompute asserted to have really re-run the crypto; the
 * experiment gate unlocked from Panel 5; all four break-it toggles armed one
 * at a time with their true downstream renderings asserted before each scan —
 * the tampered-signature INVALID verdict, the differently-worded
 * substituted-SPK rejection, the dropped-OPK crossing with three legs and the
 * omitted-DH4 card, and the corrupted-EK_A path with mismatched secrets, red
 * byte-diff cells and a failed decrypt; a full key regeneration asserted to
 * change the material; two hover states; and a keyboard focus-visible ring
 * inside the live panel. Every one of those states is scanned, at desktop and
 * phone width. There is one theme: the page pins dark before first paint and
 * builds no control that could change it, so a second theme pass would scan
 * the same rendering twice.
 *
 * See `gate.ts` for why nothing is injected into the page (the old spec's
 * `*{opacity:1!important}` style tag painted over the very states it claimed
 * to measure), why the red paths are driven rather than assumed, why the
 * lab's defaults are asserted rather than trusted, and why `violations` is
 * not the whole oracle.
 */

for (const theme of ['dark'] as const) {
  test(`no WCAG A/AA violations in ${theme} theme`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    await boot(page, theme);
    await driveAllStates(page, theme);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });

  test(`no WCAG A/AA violations in ${theme} theme at 380px`, async ({ page }) => {
    test.setTimeout(1_800_000);
    const errors = watchPageErrors(page);
    await page.setViewportSize(NARROW);
    await boot(page, theme);
    await driveAllStates(page, `${theme} @380px`);
    expect(errors, errors.join('\n')).toEqual([]);
    expectBaselineNotStale();
    reportCollected();
  });
}
