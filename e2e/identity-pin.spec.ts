import { expect, test } from '@playwright/test';

test('whole-bundle swap: valid signature, failed trusted pin, attacker decrypts on unpinned branch', async ({ page }) => {
  await page.goto('.');
  await expect(page.locator('#panel-host')).toContainText('Trusted Bob fingerprint');
  await expect(page.locator('#panel-host')).toContainText('Compare with trusted pin');
  await expect(page.locator('#panel-host')).toContainText('match');

  await page.locator('[data-step="4"]').click();
  await page.locator('#unlock-experiments').click();
  await page.locator('[data-scenario="substituteBundle"]').click();

  await page.locator('[data-step="0"]').click();
  await expect(page.locator('#panel-host')).toContainText('MISMATCH — abort if pin is enforced');
  await expect(page.locator('#panel-host')).toContainText('valid');
  await page.locator('[data-step="4"]').click();
  await expect(page.locator('#panel-host')).toContainText('Attacker decrypts (unpinned path)');
  await expect(page.locator('.status-strip')).toContainText('Signature valid');
  await expect(page.locator('.status-strip')).toContainText('Trusted Bob key MISMATCH');
  await expect(page.locator('.status-strip')).toContainText('Attacker decrypted');
  await expect(page.locator('.status-strip')).toContainText('Decrypt FAILED');
  await expect(page.locator('#panel-host')).toContainText('Hi Bob');

  await page.locator('[data-scenario="substituteBundle"]').click();
  await expect(page.locator('.status-strip')).toContainText('Trusted Bob key matches');
  await expect(page.locator('.status-strip')).toContainText('Bob decrypted');
  await expect(page.locator('.status-strip')).not.toContainText('Attacker decrypted');
});
