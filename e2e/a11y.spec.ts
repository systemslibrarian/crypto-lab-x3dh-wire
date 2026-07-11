import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * WCAG regression gate. Deploys are already gated on the X3DH crypto vectors;
 * this gates them on accessibility the same way. Scans the fully-mounted app
 * with every collapsible expanded and every panel driven, in both themes.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

async function mountAndExpand(page: Page): Promise<void> {
  // Wait for the SPA to render its shell (loading message is replaced).
  await page.waitForSelector('.app-shell', { state: 'attached' });
  await page.waitForSelector('#panel-host .panel-card', { state: 'attached' });

  // Neutralize animations/transitions/opacity so nothing is mid-fade or
  // hidden when axe measures contrast.
  await page.addStyleTag({
    content: `*,*::before,*::after{animation:none!important;transition:none!important;}
      *{opacity:1!important;}`,
  });

  // Open any native <details> (defensive — this lab uses class-toggled panels).
  await page.evaluate(() => {
    for (const details of document.querySelectorAll('details')) {
      (details as HTMLDetailsElement).open = true;
    }
  });

  // Drive every step panel so each dynamically-injected result region is
  // rendered and scanned, then return to the first panel.
  const stepButtons = page.locator('.step-btn');
  const count = await stepButtons.count();
  for (let i = 0; i < count; i++) {
    await stepButtons.nth(i).click();
    await page.waitForSelector('#panel-host .panel-card', { state: 'attached' });
  }
  if (count > 0) {
    await stepButtons.nth(0).click();
    await page.waitForSelector('#panel-host .panel-card', { state: 'attached' });
  }
}

async function scan(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const summary = results.violations.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    nodes: v.nodes.map((n) => n.target.join(' ')).slice(0, 5),
  }));
  expect(summary).toEqual([]);
}

test('no WCAG A/AA violations in dark theme', async ({ page }) => {
  await page.goto('.');
  await mountAndExpand(page);
  await scan(page);
});

test('no WCAG A/AA violations in light theme', async ({ page }) => {
  await page.goto('.');
  await mountAndExpand(page);
  await page.locator('#cl-theme-toggle').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await scan(page);
});
