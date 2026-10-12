import {test,expect} from '@playwright/test';
test('research boundary is visible in the rendered lesson',async({page})=>{
 await page.goto('./');
 await expect(page.locator('body')).toContainText('September 19, 2023'); await expect(page.locator('body')).toContainText('October 2, 2025'); await expect(page.locator('body')).toContainText('not SPQR');
});
