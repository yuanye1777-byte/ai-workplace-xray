import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 20000 });
await page.waitForTimeout(1500);
const btns = await page.locator('button').all();
for (const btn of btns) {
  const t = await btn.textContent();
  const v = await btn.isVisible().catch(() => false);
  console.log(`button: '${t}' visible=${v}`);
}
await browser.close();
