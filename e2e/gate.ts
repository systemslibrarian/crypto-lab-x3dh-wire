import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText } from './nontext';
import { NONTEXT_BASELINE } from './nontext-baseline';

export const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/** A phone-width viewport, for the WCAG 1.4.10 reflow half of the gate. */
export const NARROW = { width: 380, height: 800 };

/**
 * Shared machinery for the WCAG gate.
 *
 * Four rules govern everything here, and each one corrects something the gate
 * this replaces did:
 *
 *  1. NOTHING IS INJECTED INTO THE PAGE BEFORE A SCAN. The old spec pushed
 *     `animation:none!important; transition:none!important` and a blanket
 *     `*{opacity:1!important}` through `addStyleTag`. That BYPASSES this lab's
 *     own `@media (prefers-reduced-motion: reduce)` rules instead of
 *     exercising them, and the `opacity:1!important` is worse than a bypass:
 *     it FORCES the glossary popovers' resting `opacity: 0` to 1 and repaints
 *     the faded timeline beats at full strength, so axe measured a page whose
 *     contrast nothing a reader sees actually has — and any element whose
 *     reduced-motion end state genuinely rendered at opacity 0 would have been
 *     painted over before the scan could see it. This gate sets the preference
 *     through `emulateMedia`, asserts from inside the page that it took
 *     effect, and injects nothing.
 *
 *  2. IT DROVE ONLY THE HAPPY PATH, AND ONLY AT ITS END. The old
 *     `mountAndExpand` clicked all five step buttons in a row and scanned once
 *     — so Panels 1–4 were scanned zero times (each click REPLACES the panel;
 *     by the only scan, Panel 5 was the sole panel in the DOM), and none of
 *     the states this lab exists to teach were ever measured: no tamper
 *     toggle was armed, so the INVALID signature verdict, the SK MISMATCH
 *     tone, the byte-diff highlights, the dropped-OPK rendering and the
 *     failed-decrypt verdict — every red-path surface — shipped unmeasured.
 *     This drive scans every panel while it is the live panel, arms all four
 *     break-it toggles one at a time, asserts each one's real downstream
 *     rendering (a verdict string, a pill tone, a line count, a diff byte)
 *     before scanning it, and restores between toggles. In
 *     {dark, light} × {1280, 380}.
 *
 *  3. `violations` IS NOT THE WHOLE ORACLE. See `scan`. Almost every surface
 *     on this page is a `color-mix(in oklab, …, transparent)` over gradient
 *     washes — the status pills, the SK compare tones, the armed toggles, the
 *     KM blocks, the caution notes — and axe files all of them under
 *     `incomplete` rather than judging them. So does an `aria-label` on a
 *     role-less element, which this page had two of.
 *
 *  4. IT HAD NO REFLOW, NON-TEXT-CONTRAST OR GENERATED-CONTENT ORACLE. axe
 *     has no rule at all for WCAG 1.4.10 or 1.4.11. `nontext.ts` supplies
 *     1.4.11 (it is what showed `.commute-regen` dissolving into its panel
 *     behind the 1.32:1 divider token), and `expectNoHorizontalOverflow`
 *     supplies 1.4.10 for a page whose `.app-shell` is a `display: grid` with
 *     no explicit columns — the implicit-`auto`-track shape that has caused
 *     380px overflows elsewhere in this fleet.
 */

/**
 * Wait for every running animation and transition to drain.
 *
 * Two rAFs are not enough. A transition sampled mid-flight has a colour that
 * exists in no state of the page, and axe will happily report it: elsewhere in
 * this fleet that produced a phantom 2.00:1 failure on a button whose settled
 * ratio is 9:1. Transitions also drain in waves rather than in one batch, so a
 * poll for "nothing running right now" can exit through a gap between waves —
 * hence six consecutive quiet frames rather than one.
 *
 * Bounded three ways, because a gate that can hang is a gate nobody runs:
 * animations that never finish (`iterations: Infinity`) are excluded from the
 * quiescence test rather than waited on, a wall-clock budget inside the page
 * gives up and proceeds, and Playwright's own timeout is the backstop.
 *
 * Under the reduced motion this gate asserts, this lab's four keyframe
 * animations are either cancelled by their own `prefers-reduced-motion` rules
 * (`cross-draw`, `km-slide`, `km-pulse`) or collapsed to 0.01ms by the global
 * block (`rise-in`, which fires on every panel card at every re-render), so
 * this normally returns on the sixth frame. It is still load-bearing: every
 * interaction here rebuilds the whole shell via `innerHTML`, which restarts
 * `rise-in` on each card, and the glossary popovers run a 0.01ms opacity
 * transition on open — both are exactly the mid-flight states this refuses to
 * sample.
 */
export async function settle(page: Page, budgetMs = 4000): Promise<void> {
  await page.waitForFunction(
    (budget: number) => {
      const w = window as unknown as { __quietFrames?: number; __settleStart?: number };
      if (w.__settleStart === undefined) w.__settleStart = performance.now();
      const done = (): boolean => {
        w.__quietFrames = 0;
        w.__settleStart = undefined;
        return true;
      };
      const running = document.getAnimations().filter((a) => {
        if (a.playState !== 'running') return false;
        const timing = a.effect?.getComputedTiming?.();
        // An infinite decorative animation never drains; waiting on it hangs.
        return timing?.iterations !== Infinity;
      });
      w.__quietFrames = running.length === 0 ? (w.__quietFrames ?? 0) + 1 : 0;
      if (w.__quietFrames >= 6) return done();
      if (performance.now() - (w.__settleStart ?? 0) > budget) return done();
      return false;
    },
    budgetMs,
    { timeout: 20_000, polling: 'raf' }
  );
}

/**
 * Assert that reduced motion left the page visible, not merely un-animated.
 *
 * The failure mode this guards against is an element whose only route to its
 * visible state is an animation, in a stylesheet whose reduced-motion handling
 * cancels that animation without restoring its end state — the element then
 * renders at `opacity: 0` for every reader with the preference set.
 *
 * This lab is ONE MISSING RULE away from that shape, which is why the check is
 * a measurement and not a reading. The global reduced-motion block in
 * `main.css` shortens `animation-duration` to 0.01ms but does NOT zero
 * `animation-delay` — and `.km-block` animates `from { opacity: 0 }` with
 * `animation-delay: calc(var(--i) * 90ms)` and `backwards` fill, so with the
 * global block alone, Panel 4's KM strip would render invisible for up to
 * ~450ms under reduced motion, and the HKDF box (0.5s delay, `backwards`)
 * likewise. What actually saves it is each rule's own
 * `@media (prefers-reduced-motion: reduce) { animation: none }` override;
 * delete either override and this assertion is what fails, by name, in the
 * Panel 4 states.
 *
 * `aria-hidden` subtrees are excluded; see the `ariaHidden` note in
 * `contrast.ts` for the enumeration of what this lab hides and why each is a
 * duplicate of measured text rather than a value.
 */
async function expectNotBlank(page: Page, label: string): Promise<void> {
  const invisible = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? '')
        .join('')
        .trim();
      if (!own) continue;
      // Deliberately hidden subtrees are not "blank", they are closed.
      if (!(el as HTMLElement).checkVisibility?.({ checkVisibilityCSS: true })) continue;
      if (el.closest('[aria-hidden="true"]')) continue;
      let effective = 1;
      let node: Element | null = el;
      while (node) {
        effective *= parseFloat(getComputedStyle(node).opacity);
        node = node.parentElement;
      }
      if (effective === 0) {
        out.push(`${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}`);
      }
    }
    return Array.from(new Set(out));
  });
  expect(invisible, `no visible text may render at opacity 0 in state: ${label}`).toEqual([]);
}

/**
 * Uncaught page errors and console errors, collected from the moment the page
 * is created. This lab renders the ENTIRE app from one async
 * `buildDemoState()` → `renderAppShell()` pass into an empty `<div id="app">`,
 * and `main.ts` calls it as `void renderDemo()` — a rejection is swallowed
 * whole. A throw mid-drive (a toggle handler, a WebCrypto failure) leaves the
 * PREVIOUS rendering on screen: a plausible page that a scan would pass while
 * the interaction it claims to show never happened. Attach before `boot`,
 * assert after the drive.
 */
export function watchPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    // The location matters: "Failed to load resource: 404" without a URL is
    // undiagnosable, and a third-party font hiccup must be distinguishable
    // from the app requesting something that does not exist.
    if (m.type() === 'error') errors.push(`console.error: ${m.text()} (${m.location().url})`);
  });
  return errors;
}

/**
 * Exactly one banner landmark.
 *
 * This page ships two `<header>`s: the shared `.cl-topbar` with an explicit
 * `role="banner"`, and the lab's own `.cl-hero`, which `ui.ts` renders INSIDE
 * `<main id="main-content">` — scoped by sectioning content, so it implies no
 * banner of its own. The single banner is therefore a property of the current
 * nesting, and the shared bar's `dedupeBanner()` only backstops it. Asserting
 * the OUTCOME rather than either mechanism is what catches a refactor that
 * lifts the hero out of `<main>` (the layout several sibling labs use, where
 * the demotion IS load-bearing).
 */
export async function assertSingleBanner(page: Page): Promise<void> {
  const banners = await page.evaluate(() => {
    const scoped = new Set(['MAIN', 'ARTICLE', 'ASIDE', 'NAV', 'SECTION']);
    const isBanner = (el: Element): boolean => {
      if (el.getAttribute('role') === 'banner') return true;
      if (el.tagName !== 'HEADER') return false;
      if (el.getAttribute('role')) return false; // explicit non-banner role wins
      for (let p = el.parentElement; p; p = p.parentElement) if (scoped.has(p.tagName)) return false;
      return true;
    };
    return [...document.querySelectorAll('header,[role="banner"]')].filter(isBanner).length;
  });
  expect(banners, 'exactly one banner landmark').toBe(1);
}

/**
 * An explicit role on a list REPLACES its implicit `list` role, orphaning every
 * `<li>` under it — and a redundant `role="list"` makes axe apply
 * `aria-required-children`, which fails whenever the list is empty. Neither is
 * reliably visible to a source grep, because a role can be assigned as a JS
 * property in an element-creation helper rather than as markup. Ask the DOM.
 *
 * This lab builds every list in template strings in `ui.ts` — the
 * `.primitive-chips` `<ul>` repeated on all five panels, the `.timeline` `<ol>`
 * on three of them, and the `.cross-labels` `<ul>` in Panel 3 — and none
 * carries a role. They are also never empty, so the second failure mode cannot
 * fire here today — which is a property of the content, not of the code, and
 * is exactly why the assertion is cheap enough to keep.
 */
export async function assertListSemantics(page: Page): Promise<void> {
  const broken = await page.$$eval('ul[role], ol[role]', (els) =>
    els.map(
      (e) => `${e.tagName.toLowerCase()}[role=${e.getAttribute('role')}] with ${e.children.length} children`
    )
  );
  expect(broken, 'an explicit role on a list deletes its list semantics').toEqual([]);
}

/**
 * Assert the page does not require horizontal scrolling.
 *
 * WCAG 1.4.10 (Reflow, AA). axe has no rule for this at all. Two shapes on
 * this page carry the risk: `.app-shell` is a `display: grid` with no
 * `grid-template-columns`, so its single implicit `auto` track is floored at
 * its widest item's min-content — the exact shape that overflowed a 380px
 * viewport to 910px elsewhere in this fleet — and the wide content that would
 * do the flooring (64-char hex, nowrap `.inline-code` tokens) is defused
 * per-site by `word-break: break-all` and the kv rows' own `overflow-x: auto`.
 * Every one of those sites is a judgement that can silently regress; this is
 * what stops that.
 */
export async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    if (doc.scrollWidth <= doc.clientWidth) return null;

    // Only elements that actually push the DOCUMENT sideways are culprits. A
    // wide box inside an `overflow: auto` wrapper has a huge bounding rect but
    // is clipped by its scroller and contributes nothing to the document's
    // scroll width — naming it sends you off fixing the wrong element. Every
    // expanded hex string inside a `.kv-grid` row is such a decoy once the row
    // scrolls, and so is the byte diff inside `.sk-diff-code`.
    const clipped = (el: Element): boolean => {
      let n = el.parentElement;
      while (n && n !== doc) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
        n = n.parentElement;
      }
      return false;
    };

    const over = Array.from(document.querySelectorAll('body *'))
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter((x) => x.r.width > 0 && x.r.right > doc.clientWidth + 1)
      .sort((a, b) => b.r.right - a.r.right);
    const widest = over.filter((x) => !clipped(x.el))[0] ?? over[0];
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest
        ? `${clipped(widest.el) ? '[clipped] ' : ''}${widest.el.tagName.toLowerCase()}${widest.el.id ? '#' + widest.el.id : ''}` +
          `${widest.el.getAttribute('class') ? '.' + widest.el.getAttribute('class')!.trim().split(/\s+/).join('.') : ''}` +
          ` @${Math.round(widest.r.width)}px right=${Math.round(widest.r.right)}`
        : '(none identified)',
    };
  });
  expect(overflow, `page must not scroll horizontally in state: ${label}`).toBeNull();
}

/**
 * Every scrolling container must be operable from the keyboard (WCAG 2.1.1).
 * If it holds no focusable content it needs `tabindex="0"`, so it becomes a
 * focus target arrow keys can then scroll.
 *
 * This lab's scrollers are the `.kv-grid` rows and `.dh-list` articles
 * (`overflow-x: auto` for their 64-char hex) and `.sk-diff-code`. `ui.ts`
 * applies `tabindex="0"` + `role="group"`/`region` + an `aria-label` to every
 * kv row — deliberately to ALL of them, not just the ones overflowing at
 * today's width, because which rows scroll shifts with content length and
 * viewport (at 1280px most don't scroll; at 380px several do, and only the
 * 380px legs of this gate create the requirement). The dh-list articles
 * satisfy 2.1.1 through their own content instead: each holds a focusable
 * `<summary>` and hex-chip `<button>`. Asserting the OUTCOME covers both
 * mechanisms and whatever scroller is added next.
 */
export async function expectScrollersReachable(page: Page, label: string): Promise<void> {
  const unreachable = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    return Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .filter((el) => el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)
      .filter((el) => {
        const cs = getComputedStyle(el);
        return ['auto', 'scroll'].includes(cs.overflowX) || ['auto', 'scroll'].includes(cs.overflowY);
      })
      .filter((el) => el.tabIndex < 0 && !el.querySelector(FOCUSABLE))
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') ?? '').trim()}` +
          ` (${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight})`
      );
  });
  expect(
    Array.from(new Set(unreachable)),
    `scrolling regions with no keyboard route in state: ${label}`
  ).toEqual([]);
}

/**
 * Nothing may be focusable while it paints nothing (WCAG 2.4.3 / 2.4.7).
 *
 * `opacity: 0` with `pointer-events: none` is NOT hiding: the element keeps
 * its tab stop, so a keyboard reader tabs to a control that is not on screen
 * and the focus ring lands nowhere. `display: none` and `visibility: hidden`
 * DO remove an element from the tab order, so those are skipped rather than
 * flagged — the failure is specifically the invisible-but-tabbable pair.
 *
 * This page walks the line in two places, which is why the check earns its
 * keep: the glossary popovers rest at `opacity: 0` but pair it with
 * `visibility: hidden` (and hold no focusables); and both skip links are the
 * WCAG-sanctioned off-screen-but-focusable idiom, deliberately not flagged —
 * each has full opacity and a real box and slides into view on focus, and the
 * drive scans both focused.
 */
export async function expectNoInvisibleFocusTargets(page: Page, label: string): Promise<void> {
  const bad = await page.evaluate(() => {
    const FOCUSABLE = 'a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])';
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE))) {
      if (el.tabIndex < 0) continue;
      // display:none / visibility:hidden already remove it from the tab order.
      if (!el.checkVisibility?.({ checkVisibilityCSS: true })) continue;
      let effective = 1;
      for (let n: Element | null = el; n; n = n.parentElement) {
        effective *= parseFloat(getComputedStyle(n).opacity);
      }
      const r = el.getBoundingClientRect();
      if (effective !== 0 && r.width > 0 && r.height > 0) continue;
      // Confirm it really is reachable rather than inferring it.
      const before = document.activeElement;
      el.focus();
      const took = document.activeElement === el;
      (before as HTMLElement | null)?.focus?.();
      if (took) {
        out.push(
          `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${(el.getAttribute('class') ?? '').trim()}` +
            ` (opacity ${effective}, ${Math.round(r.width)}x${Math.round(r.height)})`
        );
      }
    }
    return Array.from(new Set(out));
  });
  expect(bad, `focusable elements that paint nothing in state: ${label}`).toEqual([]);
}

/**
 * When `A11Y_COLLECT` is set, `scan` records failures instead of throwing.
 *
 * A strict gate reports the first failing assertion in the first failing state
 * and stops, so a page with defects in several states needs one full run per
 * defect to enumerate them. The collection pass turns that into a single run.
 * It is a debugging aid only: `A11Y_COLLECT` is never set in CI, and a run
 * with it set prints every finding as it happens and then fails at the end, so
 * a green collection run cannot be mistaken for a green gate.
 */
const COLLECTING = !!process.env.A11Y_COLLECT;
const collected: string[] = [];

function record(entry: string): void {
  collected.push(entry);
  // Printed as it happens, not only at the end: a hard assertion later in the
  // drive would otherwise abort the test before anything collected so far was
  // ever shown.
  console.log(`\n[A11Y_COLLECT #${collected.length}] ${entry}`);
}

export function softExpect(actual: unknown, message: string, expected: unknown): void {
  if (!COLLECTING) {
    expect(actual, message).toEqual(expected);
    return;
  }
  try {
    expect(actual, message).toEqual(expected);
  } catch {
    record(`${message}\n  ${JSON.stringify(actual, null, 2)}`);
  }
}

/**
 * Fail the test if the collection pass recorded anything. Without this a
 * collection run would end green, and a green collection run is
 * indistinguishable from a green gate — which is the exact confusion the whole
 * exercise exists to remove.
 */
export function reportCollected(): void {
  if (!COLLECTING) return;
  expect(collected, `A11Y_COLLECT recorded ${collected.length} failure(s)`).toEqual([]);
}

async function soft(fn: () => Promise<void>): Promise<void> {
  if (!COLLECTING) return fn();
  try {
    await fn();
  } catch (e) {
    // Generous, not 900: a truncated oracle dump is how a second and third
    // finding in the same state get missed on a collection pass.
    record(String(e).slice(0, 6000));
  }
}

/**
 * WCAG 1.4.11 and generated content, ratcheted against a per-repo baseline.
 *
 * Neither class has ANY other oracle: axe has no rule for non-text contrast,
 * and the arithmetic text walk cannot reach a control's boundary or a
 * `::before` glyph, because a pseudo-element is not an element and owns no
 * text node.
 *
 * IT IS CALLED FROM `scan()`, deliberately and not by accident. Fleet-wide
 * this oracle had been called from inside a soft wrapper AFTER its
 * `if (!COLLECTING) return` guard — so in a strict run, which is every run in
 * CI and every run anyone reads as a pass, the guard returned first and
 * `nontext.ts` never executed at all. Thirteen repos certified themselves
 * clean on an oracle that had never looked. Calling it here means it runs at
 * every driven state, including `:hover` — and running live on this repo is
 * how `.commute-regen`'s divider-token boundary was caught.
 *
 * A check that merely logs is not a gate, so it ratchets: anything NOT in the
 * baseline fails, anything in the baseline that got WORSE fails, and anything
 * in the baseline that has been FIXED fails until its entry is deleted. That
 * last rule is what stops the allowlist becoming a permanent exemption.
 */
const nonTextSeen = new Set<string>();

export async function expectNoNewNonTextFailures(page: Page, label: string): Promise<void> {
  const found = await auditNonText(page);
  // Capture mode: emit every finding and assert nothing, so a baseline can be
  // generated by the SAME path that checks it.
  if (process.env.NT_BASELINE_CAPTURE) {
    for (const f of found) {
      console.log(`NTCAP|${f.kind}|${f.selector}|${f.ratio}|${f.required}|${/POSITIONED/.test(f.detail)}`);
    }
    return;
  }
  const problems: string[] = [];
  for (const f of found) {
    const key = `${f.kind}|${f.selector}`;
    nonTextSeen.add(key);
    const base = NONTEXT_BASELINE[key];
    if (!base) {
      problems.push(`NEW ${f.ratio}:1 (needs ${f.required}:1) [${f.kind}] ${f.selector} — ${f.detail}`);
    } else if (f.ratio < base.ratio - 0.01) {
      problems.push(`WORSE ${f.selector}: ${f.ratio}:1, baseline recorded ${base.ratio}:1`);
    }
  }
  expect(problems, `new or worsened non-text contrast in state: ${label}`).toEqual([]);
}

/**
 * Fail if a baselined finding never appeared during the whole drive.
 *
 * It has either been fixed — in which case delete the entry, which is the
 * point — or the drive stopped reaching the state that shows it, which is a
 * coverage regression worth knowing about. Call once, after `driveAllStates`.
 */
export function expectBaselineNotStale(): void {
  const unseen = Object.keys(NONTEXT_BASELINE).filter((k) => !nonTextSeen.has(k));
  expect(
    unseen,
    'baselined non-text findings that no longer appear — delete them from nontext-baseline.ts (or restore the drive state that showed them)'
  ).toEqual([]);
}

/**
 * Scan the page as it currently stands.
 *
 * Eight assertions, because axe's `violations` array alone is not a complete
 * oracle:
 *
 *  - reduced-motion end state — see `expectNotBlank`.
 *  - `violations` — the usual WCAG A/AA rule failures, plus four landmark
 *    best-practice rules `withTags` does not run on its own.
 *  - `incomplete` — axe's "could not decide" bucket, which never reaches the
 *    violations array. The one rule id allowed to remain incomplete is
 *    `color-contrast`, and only because the next assertion computes those
 *    ratios arithmetically — which matters more here than in most labs,
 *    because nearly every painted surface is a `color-mix(in oklab, …,
 *    transparent)` axe refuses to resolve. Everything else in that bucket is
 *    a real result axe simply could not finish — including
 *    `aria-prohibited-attr`, which is where an `aria-label` on a role-less
 *    element hides. This page depends on getting that right in several
 *    places: the KM strip pairs its `aria-label` with `role="img"`, the kv
 *    rows pair theirs with `role="group"`, the hex outputs pair theirs with
 *    `role="region"`, and the Panel 4 figure and Panel 3 widget carry
 *    `role="group"` for exactly this reason — both shipped as bare `<div>`s
 *    whose labels were silently prohibited until this bucket was asserted.
 *  - arithmetic contrast — composite-aware WCAG 1.4.3 over every text node.
 *  - non-text contrast and generated content — SC 1.4.11, ratcheted; see
 *    `expectNoNewNonTextFailures`. This is the only oracle that judges a
 *    control's boundary against the surface OUTSIDE it.
 *  - keyboard reachability of scrolling regions — WCAG 2.1.1.
 *  - no focusable element that paints nothing — WCAG 2.4.3/2.4.7.
 *  - reflow — WCAG 1.4.10, which axe has no rule for at all.
 */
export async function scan(page: Page, label: string): Promise<void> {
  await settle(page);
  await expectNotBlank(page, label);
  // TWO axe runs, deliberately, and this is not a style choice.
  //
  // `AxeBuilder.withTags()` and `AxeBuilder.withRules()` both write the same
  // `options.runOnly` field, so the second call SILENTLY REPLACES the first —
  // the axe-core/playwright source says so in as many words on `withRules`
  // ("Cannot be used with AxeBuilder#withTags"). Chained as
  // `.withTags(TAGS).withRules([...4 landmark rules])`, axe runs those FOUR
  // best-practice rules and NOT ONE WCAG RULE, while a green result reads
  // exactly like a full A/AA pass. For scale, `withTags(TAGS)` selects 69 of
  // axe-core 4.12's 105 rule definitions; the chained form executes 4.
  //
  // The landmark four are still wanted because they are best-practice rather
  // than WCAG-tagged, so `withTags` alone does not reach them — and this page
  // has the shape they catch: a sticky `<header role="banner">` above a
  // `<main>` that itself contains a `<header class="cl-hero">` whose
  // `.cl-hero-why` box sat as an `<aside>` — a complementary landmark nested
  // inside `main`, which is precisely what
  // `landmark-complementary-is-top-level` exists to flag and did flag here,
  // plus three labelled `<nav>`s that `landmark-unique` keeps distinguishable.
  const wcag = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const landmarks = await new AxeBuilder({ page })
    .withRules([
      'landmark-no-duplicate-banner',
      'landmark-unique',
      'landmark-one-main',
      'landmark-complementary-is-top-level',
    ])
    .analyze();
  const results = {
    violations: [...wcag.violations, ...landmarks.violations],
    incomplete: [...wcag.incomplete, ...landmarks.incomplete],
  };

  const violations = results.violations.map((v) => ({
    state: label,
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
  }));
  softExpect(violations, `axe violations in state: ${label}`, []);

  // The `incomplete` bucket is asserted, not skimmed. `aria-prohibited-attr`
  // and `aria-required-children` appear ONLY here — never in `violations` — so
  // a gate that ignores this bucket cannot see either. Only `color-contrast`
  // is allowed to remain, and only because the arithmetic walk below judges
  // those ratios for real; no other rule is filtered out.
  const unexplainedIncomplete = results.incomplete
    .filter((v) => v.id !== 'color-contrast')
    .map((v) => ({
      state: label,
      id: v.id,
      nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 8),
    }));
  softExpect(unexplainedIncomplete, `axe incomplete results in state: ${label}`, []);

  const contrast = Array.from(new Set(formatContrastFailures(await auditContrast(page))));
  softExpect(contrast, `measured contrast failures in state: ${label}`, []);

  await soft(() => expectNoNewNonTextFailures(page, label));
  await soft(() => expectScrollersReachable(page, label));
  await soft(() => expectNoInvisibleFocusTargets(page, label));
  await soft(() => expectNoHorizontalOverflow(page, label));
}

/**
 * Load the page in a known theme with reduced motion actually in effect, and
 * assert the content every scan relies on is really on the page — including
 * the lab's DEFAULTS, which are never assumed.
 *
 * `test.use({ reducedMotion })` silently does nothing on Playwright 1.61.1, so
 * the emulation is applied imperatively BEFORE the navigation and then
 * *asserted* from inside the page. On this page the assertion protects the
 * Panel 4 KM strip above all — see `expectNotBlank` for why a silently-failed
 * emulation would instead scan a mid-stagger rendering.
 *
 * Dark is the only theme, and there is no toggle left to click: the seeding
 * through `localStorage` now pins down the OPPOSITE property. `index.html`'s
 * head script OVERWRITES `localStorage['theme']` with the literal `'dark'` and
 * stamps `data-theme` from that literal, so a page booted with `'light'`
 * already stored must still resolve to dark — which is precisely the failure
 * the fleet's toggle removal existed to prevent, since a stored `'light'`
 * outlives the tab. `ui.ts` used to re-read the same key on mount and re-stamp
 * `data-theme` from it; that code is gone, so the head literal is the only
 * thing that decides the theme.
 *
 * The defaults are asserted at length because `ui.ts` builds the entire page
 * from one async `buildDemoState()` → `renderAppShell()` pass into an empty
 * `<div id="app">` whose only static content is the "Loading X3DH demo…"
 * message. A navigation that resolves proves nothing here: a render that threw
 * leaves the loading message up forever, and a page containing one polite
 * paragraph is exactly what a scan reports as perfectly accessible.
 */
export async function boot(page: Page, theme: 'dark' | 'light'): Promise<void> {
  // A click on a control that never becomes actionable otherwise burns the
  // whole test timeout and reports nothing useful. 20s turns that silent hang
  // into a named failure naming the locator.
  page.setDefaultTimeout(20_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript((t) => localStorage.setItem('theme', t), theme);
  await page.goto('.');
  expect(
    await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
    'reduced-motion emulation must actually be in effect'
  ).toBe(true);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);

  // ── The page really rendered ────────────────────────────────────────────
  // The loading message is REPLACED by the shell; asserting both directions
  // catches a render that threw after painting nothing.
  await expect(page.locator('main#main-content.app-shell')).toHaveCount(1);
  await expect(page.locator('.loading-msg')).toHaveCount(0);
  await expect(page.locator('#panel-host .panel-card')).toHaveCount(1);

  await assertSingleBanner(page);
  await assertListSemantics(page);

  // Both skip links exist and point at ids that exist. axe's skip-link rule is
  // best-practice, not WCAG-tagged, so `withTags` never runs it — a skip link
  // aimed at a missing element is exactly the kind of thing a green axe run
  // says nothing about. This page has TWO, with DIFFERENT targets: the shared
  // bar's goes to `#app` and the lab's own goes to `#main-content`.
  await expect(page.locator('a.cl-skip-link')).toHaveAttribute('href', '#app');
  await expect(page.locator('a.skip-link')).toHaveAttribute('href', '#main-content');
  await expect(page.locator('#app')).toHaveCount(1);

  // ── No theme control is BUILT any more ──────────────────────────────────
  // This used to assert the lab's own `#theme-toggle` was in the DOM and could
  // not take focus. That measured invisibility while `ui.ts` still emitted the
  // button on every render and still wired a click handler that flipped
  // `data-theme` and wrote `localStorage['theme']` — a live control held off
  // the page by one inline `display: none !important` rule in `index.html`,
  // one specificity accident away from working. The markup and the handler are
  // deleted, so assert ABSENCE: the stronger claim, and one a stylesheet edit
  // cannot defeat. A returning toggle now fails here instead of hiding.
  await expect(
    page.locator('#theme-toggle, #themeToggle, .theme-toggle, [data-theme-toggle]'),
    'no theme control may exist in the DOM'
  ).toHaveCount(0);

  // ── Every shipped default ───────────────────────────────────────────────
  // Which half of this lab a scan sees depends entirely on these. The page
  // arrives on Panel 1 with an UNTAMPERED scenario, so every red-path surface
  // — INVALID verdicts, SK MISMATCH, the byte diff, failed decrypt — is only
  // reachable by driving the break-it toggles, which are themselves locked
  // behind reaching Panel 5. The drive does all of that; boot proves the
  // starting line.
  await expect(page.locator('.step-btn')).toHaveCount(5);
  await expect(page.locator('.step-btn').first()).toHaveAttribute('aria-current', 'step');
  await expect(page.locator('#panel-host h2')).toContainText('Panel 1');
  await expect(page.locator('#panel-host .verdict--ok')).toHaveText('valid');
  await expect(page.locator('#prev-panel')).toBeDisabled();
  await expect(page.locator('#next-panel')).toBeEnabled();

  // The break-it experiments ship locked: the gate button is present but
  // disabled, and the experiments block (status strip + toggles) is not
  // rendered at all until it is pressed on Panel 5.
  await expect(page.locator('#unlock-experiments')).toBeDisabled();
  await expect(page.locator('#experiments')).toHaveCount(0);
  await expect(page.locator('.status-pill')).toHaveCount(0);

  // Who-holds-what renders all three parties, hex chips ship COLLAPSED
  // (head…tail), and the timeline sits on its first beat.
  await expect(page.locator('.holds-box')).toHaveCount(3);
  await expect(page.locator('.hexchip-hex').first()).toHaveText(/^[0-9a-f]{8}…[0-9a-f]{8}$/);
  await expect(page.locator('#panel-host .tl-beat')).toHaveCount(3);
  await expect(page.locator('#panel-host .tl-beat').first()).toHaveAttribute('aria-current', 'step');
  // The threat disclosures in Panel 3 ship shut; none exists yet on Panel 1.
  await expect(page.locator('#app details[open]')).toHaveCount(0);

  await settle(page);
  await expectNotBlank(page, `${theme} first paint`);
}

// ── The drive ───────────────────────────────────────────────────────────────

/** Click a step button and wait for its panel to be the live one. */
async function gotoPanel(page: Page, index: number, headingRe: RegExp): Promise<void> {
  await page.locator('.step-btn').nth(index).click();
  await expect(page.locator('#panel-host h2').first()).toContainText(headingRe);
  await expect(page.locator('.step-btn').nth(index)).toHaveAttribute('aria-current', 'step');
}

/**
 * Arm or disarm one break-it toggle and wait for the re-render it causes.
 *
 * Every toggle click tears down and rebuilds the whole shell from a fresh
 * `buildDemoState()` — real crypto, not a class swap — so the completion
 * signal is the REBUILT button's state, which only exists once the async
 * re-render has landed. `aria-pressed` is asserted rather than the class so
 * the drive fails if the accessible state ever detaches from the visual one.
 */
async function setToggle(page: Page, key: string, on: boolean): Promise<void> {
  const toggle = page.locator(`.lab-toggle[data-scenario="${key}"]`);
  await expect(toggle).toHaveAttribute('aria-pressed', on ? 'false' : 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', on ? 'true' : 'false');
  await expect(toggle.locator('.lab-toggle-state')).toHaveText(on ? 'ON' : 'off');
}

/** The status pill carrying `text` is visible — the live consequence strip. */
async function expectPill(page: Page, text: string, tone: 'ok' | 'bad'): Promise<void> {
  await expect(page.locator(`.status-pill.${tone}`, { hasText: text })).toBeVisible();
}

/**
 * Drive the lab through the states that render content, scanning each.
 *
 * Six things shape this drive:
 *
 *  - THE ARRIVAL STATE IS SCANNED BEFORE ANYTHING IS DRIVEN: Panel 1, valid
 *    signature, chips collapsed, experiments locked. The gate this replaces
 *    clicked through all five panels before its only scan, so the state every
 *    reader actually arrives in was never measured — and neither were Panels
 *    1–4, since each click replaces the previous panel wholesale.
 *
 *  - EVERY PANEL IS SCANNED WHILE IT IS THE LIVE PANEL. `#panel-host` holds
 *    exactly one panel at a time; there is no "expand everything and scan
 *    once" on this page, only walking it.
 *
 *  - EVERY RED PATH IS DRIVEN AND VERIFIED BEFORE IT IS SCANNED. The four
 *    break-it toggles re-run the real handshake; each arm step asserts the
 *    true downstream rendering — the INVALID verdict wording (tampered vs
 *    substituted are DIFFERENT strings), the pill tones, the three-line
 *    crossing with the omitted-DH4 card, the `.sk-compare--mismatch` tone
 *    with red byte-diff cells, the failed decrypt — so the scan that follows
 *    is provably of the state it names, not of a toggle that silently no-oped.
 *
 *  - REVEALED-ON-DEMAND CONTENT IS REACHED BY A READER'S ROUTE: the glossary
 *    popover by hovering its dotted term, the threat disclosure by clicking
 *    its summary, the full 64-char hex by activating its chip. No `.open`, no
 *    forced styles.
 *
 *  - HOVER IS A STATE, AND IT PERSISTS AFTER A CLICK. `:hover` stays on the
 *    element under the pointer after `page.click()` resolves — and stepper
 *    buttons, toggles and the shared bar's controls all repaint on hover.
 *    Scanned explicitly.
 *
 *  - NO FIXED TIMEOUTS. Every wait here is on a real DOM completion signal: a
 *    verdict string, an `aria-pressed` flip on the rebuilt toggle, a line or
 *    block count, a changed `data-full` attribute after regeneration.
 */
export async function driveAllStates(page: Page, theme: string): Promise<void> {
  const scanAt = (s: string): Promise<void> => scan(page, `${theme} / ${s}`);

  await scanAt('arrival — Panel 1, signature valid, chips collapsed, break-it gate locked');

  // ── The two skip links, focused ─────────────────────────────────────────
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
  await page.keyboard.press('Tab');
  await expect(page.locator('a.cl-skip-link')).toBeFocused();
  await scanAt('shared skip link focused, slid into view');

  await page.locator('a.skip-link').focus();
  await expect(page.locator('a.skip-link')).toBeFocused();
  await scanAt('the lab own skip link focused, slid down from top:-100%');

  // ── A glossary popover, held open the way a reader opens it ─────────────
  const gloss = page.locator('#panel-host .gloss').first();
  await gloss.hover();
  await expect(gloss.locator('.gloss-pop')).toBeVisible();
  await scanAt('a glossary tooltip held open on hover');
  await page.mouse.move(0, 0);
  await expect(gloss.locator('.gloss-pop')).toBeHidden();

  // ── A hex chip expanded to its full value ───────────────────────────────
  const chip = page.locator('#panel-host .hexchip').first();
  await chip.click();
  await expect(chip.locator('.hexchip-hex')).toHaveText(/^[0-9a-f]{64}$/);
  await scanAt('a hex chip expanded to its full 32-byte value');
  await chip.click();
  await expect(chip.locator('.hexchip-hex')).toHaveText(/…/);

  // ── A kv row focused — the keyboard route into its sideways scroller ────
  const kvRow = page.locator('#panel-host .kv-grid div[role="group"]').first();
  await kvRow.focus();
  await expect(kvRow).toBeFocused();
  await scanAt('a key/value row focused — the keyboard route into the rows that scroll at 380px');

  // ── Panel 2 ─────────────────────────────────────────────────────────────
  await gotoPanel(page, 1, /Panel 2/);
  await scanAt('Panel 2 — Alice initiates, timeline on its second beat');

  // ── Panel 3: crossing diagram, both viewpoints, threat disclosure ───────
  await gotoPanel(page, 2, /Panel 3/);
  await expect(page.locator('.cross-line')).toHaveCount(4);
  await expect(page.locator('.view-btn[data-view="alice"]')).toHaveAttribute('aria-pressed', 'true');
  await scanAt("Panel 3 — four DH legs crossing, Alice's view");

  await page.locator('.view-btn[data-view="bob"]').click();
  await expect(page.locator('.cross[data-view="bob"]')).toHaveCount(1);
  await expect(page.locator('.view-btn[data-view="bob"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.cross-line')).toHaveCount(4);
  await scanAt("Panel 3 — flipped to Bob's view, every line re-anchored to the mirrored keys");

  await page.locator('#panel-host details.dh-threat').first().locator('summary').click();
  await expect(page.locator('#panel-host details[open]')).toHaveCount(1);
  await scanAt('a "What it defends against" disclosure open');

  // The commutativity widget recomputes from fresh keys on demand — assert the
  // crypto really re-ran (both 32-byte outputs change and still agree).
  const outBefore = await page.locator('.commute-out').first().textContent();
  await page.locator('#commute-regenerate').click();
  await expect(page.locator('.commute-out').first()).not.toHaveText(outBefore ?? '');
  await expect(page.locator('.commute-verdict--same')).toBeVisible();

  // ── Panel 4: the KM strip and matching secrets ──────────────────────────
  await gotoPanel(page, 3, /Panel 4/);
  await expect(page.locator('.km-block')).toHaveCount(5); // F + DH1..DH4
  await expect(page.locator('.sk-compare--match')).toBeVisible();
  await scanAt('Panel 4 — KM strip assembled (F + four DH blocks), secrets byte-for-byte identical');

  // A popover anchored deep in a Panel 4 sentence is the worst-case anchor for
  // the phone-width clamp: resting popovers used to stretch this panel to
  // 407px at 380px viewport, and an OPEN one anchored here would jut past the
  // right edge without the fixed-position rule this state exercises.
  const p4gloss = page.locator('#panel-host .gloss').first();
  await p4gloss.hover();
  await expect(p4gloss.locator('.gloss-pop')).toBeVisible();
  await scanAt('Panel 4 — the domain-separator popover open, clamped inside the viewport');
  await page.mouse.move(0, 0);
  await expect(p4gloss.locator('.gloss-pop')).toBeHidden();

  // ── Panel 5: decrypt verdict, gate becomes ready, then unlock ───────────
  await gotoPanel(page, 4, /Panel 5/);
  await expect(page.locator('#panel-host .verdict--ok')).toBeVisible();
  await expect(page.locator('#unlock-experiments')).toBeEnabled();
  await scanAt('Panel 5 — Bob decrypted, the break-it gate ready to unlock');

  await page.locator('#unlock-experiments').click();
  await expect(page.locator('#experiments')).toHaveCount(1);
  await expect(page.locator('.status-pill')).toHaveCount(4);
  await expect(page.locator('.status-pill.ok')).toHaveCount(4);
  await scanAt('experiments unlocked — all four status pills green');

  // ── Red path 1: tampered SPK signature ──────────────────────────────────
  await setToggle(page, 'tamperSpkSignature', true);
  await expectPill(page, 'Signature INVALID', 'bad');
  await gotoPanel(page, 0, /Panel 1/);
  await expect(page.locator('#panel-host .verdict--bad')).toContainText('INVALID — tampered');
  await scanAt('SPK signature tampered — Panel 1 verdict INVALID, signature pill red');
  await setToggle(page, 'tamperSpkSignature', false);
  await expectPill(page, 'Signature valid', 'ok');

  // ── Red path 2: relay substitutes its own SPK (different wording) ───────
  await setToggle(page, 'substituteSpk', true);
  await expect(page.locator('#panel-host .verdict--bad')).toContainText(
    'INVALID — SPK_B is not signed by this IK_B'
  );
  await scanAt('relay-substituted SPK — rejected against IK_B, the substitution wording');
  await setToggle(page, 'substituteSpk', false);
  await expect(page.locator('#panel-host .verdict--ok')).toHaveText('valid');

  // ── Red path 3: one-time prekey dropped — SK still forms ────────────────
  await setToggle(page, 'dropOpk', true);
  await expectPill(page, 'OPK dropped (no DH4)', 'bad');
  await expectPill(page, 'Alice SK = Bob SK', 'ok');
  await gotoPanel(page, 2, /Panel 3/);
  await expect(page.locator('.cross-line')).toHaveCount(3);
  await expect(page.locator('.dh-item--absent')).toHaveCount(1);
  await scanAt('OPK dropped — three DH legs, the omitted-DH4 card explaining the loss');
  await gotoPanel(page, 3, /Panel 4/);
  await expect(page.locator('.km-block')).toHaveCount(4); // F + DH1..DH3
  await expect(page.locator('.sk-compare--match')).toBeVisible();
  await scanAt('OPK dropped — KM strip one block shorter, secrets still equal');
  await setToggle(page, 'dropOpk', false);
  await expect(page.locator('.km-block')).toHaveCount(5);

  // ── Red path 4: EK_A corrupted on the wire — everything downstream red ──
  await setToggle(page, 'corruptEkA', true);
  await expectPill(page, 'SK MISMATCH', 'bad');
  await expectPill(page, 'Decrypt FAILED', 'bad');
  await expect(page.locator('.sk-compare--mismatch')).toBeVisible();
  await expect(page.locator('.sk-diff .diff-byte').first()).toBeVisible();
  await scanAt('EK_A corrupted — secrets diverge, the byte diff highlighting every differing pair');
  await gotoPanel(page, 4, /Panel 5/);
  await expect(page.locator('#panel-host .verdict--bad')).toContainText('authentication failed');
  await scanAt("EK_A corrupted — Bob's decrypt fails with a key mismatch");
  await setToggle(page, 'corruptEkA', false);
  await expect(page.locator('.status-pill.ok')).toHaveCount(4);

  // ── Regenerate really regenerates ───────────────────────────────────────
  const fullBefore = await page.locator('.hexchip').first().getAttribute('data-full');
  await page.locator('#lab-regenerate').click();
  await expect
    .poll(async () => page.locator('.hexchip').first().getAttribute('data-full'))
    .not.toBe(fullBefore);
  await expect(page.locator('.status-pill.ok')).toHaveCount(4);

  // ── Hover, which persists after a click ─────────────────────────────────
  await page.locator('.step-btn').nth(1).hover();
  await scanAt('a stepper button hovered');
  await page.locator('.cl-topbar .cl-btn').first().hover();
  await scanAt('a shared top bar control hovered');

  // ── A keyboard focus ring inside the live panel ─────────────────────────
  // A click leaves pointer modality, so `:focus-visible` stays off; the Tab
  // that follows switches to keyboard modality and draws the box-shadow ring
  // (`:focus-visible` is this lab's only focus indicator). The panel re-render
  // parks focus on `#panel-host` (tabindex="-1"), so one Tab lands on the
  // first control inside the live panel.
  await gotoPanel(page, 0, /Panel 1/);
  await page.keyboard.press('Tab');
  expect(
    await page.evaluate(() => {
      const a = document.activeElement;
      return !!a && a !== document.body && !!a.closest('#panel-host');
    }),
    'Tab from the freshly focused panel host must land on a control inside the live panel'
  ).toBe(true);
  await scanAt('keyboard focus ring on the first control inside the live panel');
}
