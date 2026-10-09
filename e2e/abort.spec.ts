import { expect, test, type Page } from '@playwright/test';

async function unlock(page: Page) {
  await page.goto('.');
  await page.locator('[data-step="4"]').click();
  await page.locator('#unlock-experiments').click();
  await expect(page.locator('.status-strip')).toContainText('Bob decrypted');
}

async function expectAbort(page: Page) {
  await expect(page.locator('#abort-heading')).toHaveText('Handshake aborted');
  await expect(page.locator('.status-strip')).toContainText('SK not derived');
  await expect(page.locator('.status-strip')).toContainText('Message not sent');
  await expect(page.locator('.status-strip')).not.toContainText('Bob decrypted');
  await expect(page.locator('.sk-hex, .sk-compare, .cross-line, .km-block')).toHaveCount(0);
  await expect(page.locator('#next-panel')).toBeDisabled();
  for (let panel = 1; panel < 5; panel++) {
    await expect(page.locator(`[data-step="${panel}"]`)).toBeDisabled();
  }
}

for (const width of [1366, 390]) {
  for (const attack of ['tamperSpkSignature', 'substituteSpk']) {
    test(`${attack}: accepted run becomes aborted and can recover at ${width}px`, async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewportSize({ width, height: 900 });
      await unlock(page);
      await page.locator(`.lab-toggle[data-scenario="${attack}"]`).click();
      await expectAbort(page);
      await page.locator('[data-step="0"]').focus();
      await page.keyboard.press('End');
      await expectAbort(page);
      await page.locator(`.lab-toggle[data-scenario="${attack}"]`).click();
      await expect(page.locator('.status-strip')).toContainText('Bob decrypted');
      await page.locator('[data-step="4"]').click();
      await expect(page.locator('#panel-host')).toContainText('Hi Bob');
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      expect(errors).toEqual([]);
    });
  }
}

test('an older asynchronous accepted run cannot repaint after a newer signature abort', async ({ page }) => {
  await unlock(page);
  await page.evaluate(() => {
    const derive = crypto.subtle.deriveBits;
    const decrypt = crypto.subtle.decrypt;
    const pending: Array<() => void> = [];
    const control = { pending, done: false, release() {
      crypto.subtle.deriveBits = derive;
      pending.splice(0).forEach(run => run());
    } };
    Object.assign(window, { abortRace: control });
    crypto.subtle.deriveBits = (...args) => new Promise((resolve, reject) => {
      pending.push(() => derive.apply(crypto.subtle, args).then(resolve, reject));
    });
    crypto.subtle.decrypt = async (...args) => {
      try { return await decrypt.apply(crypto.subtle, args); }
      finally { crypto.subtle.decrypt = decrypt; control.done = true; }
    };
  });
  await page.locator('#lab-regenerate').click();
  await page.waitForFunction(() => (window as unknown as { abortRace: { pending: unknown[] } }).abortRace.pending.length > 0);
  await page.locator('.lab-toggle[data-scenario="tamperSpkSignature"]').click();
  await expectAbort(page);
  await page.evaluate(() => (window as unknown as { abortRace: { release(): void } }).abortRace.release());
  await page.waitForFunction(() => (window as unknown as { abortRace: { done: boolean } }).abortRace.done);
  await expectAbort(page);
});
