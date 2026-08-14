/**
 * Known WCAG 1.4.11 / generated-content findings in this lab, captured through
 * the gate's own path so the baseline and the check cannot disagree.
 *
 * THIS FILE IS A TO-DO LIST, NOT A SET OF EXEMPTIONS. The gate ratchets on it:
 *   - a finding NOT listed here fails the run, so a regression cannot land;
 *   - a listed finding whose ratio gets WORSE fails, so the list cannot rot;
 *   - a listed finding that no longer appears ALSO fails, so a fixed entry must
 *     be deleted and the file can only shrink toward empty.
 * The last rule is what stops an allowlist becoming a permanent exemption.
 *
 * `unverified: true` marks an absolutely-positioned pseudo-element. It can paint
 * outside its host and the oracle measures it against the host's backdrop, so
 * that ratio is NOT trustworthy — hand-measure before acting on it.
 *
 * It is EMPTY. Every control in this lab clears 3:1 through its
 * `--control-border` edge (`#7d93a8` dark / `#7a6a4e` light — the token
 * introduced when the audit found this lab had no control-boundary colour at
 * all), the shared top bar's `.cl-btn` edge mixes `--cl-ink` at 70% rather
 * than the old 1.49:1 accent mix, and the one control that had slipped back to
 * the 1.32:1 divider token (`.commute-regen`) was fixed rather than listed.
 */
export const NONTEXT_BASELINE: Record<
  string,
  { ratio: number; required: number; unverified: boolean }
> = {};
