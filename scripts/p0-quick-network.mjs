/**
 * Minimal quick mode test with network logging
 */
import { chromium } from 'playwright';

const TEST = `最近三个月，领导开始绕过我直接找我下属安排工作。核心客户也被转给了新来的同事，每周一对一的沟通停了好几次，重要会议也不再通知我参加。`;

const ANSWERS = [
  "我能拍板的事情越来越少，上周年度预算会原本是让我定的，最后是副总签字。",
  "最近两个月，原本我负责的三个大客户，两个已经转给新同事对接，我只保留了跟进邮件。",
  "这些变化大概从四月初开始，最初只是偶尔一次，现在几乎每周都有这样的安排。",
  "反过来看，领导上周还在部门会上表扬了我上季度的业绩，也单独给我分配了一个新项目。",
  "是的，上周产品评审会我没有收到邀请，会后才知道已经定好了方案。"
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  page.on('request', req => {
    if (req.url().includes('nextTurnFn') || req.url().includes('interview')) {
      console.log('API REQUEST:', req.url(), req.method());
    }
  });
  page.on('response', async res => {
    if (res.url().includes('nextTurnFn') || res.url().includes('interview')) {
      try {
        const body = await res.json();
        console.log('API RESPONSE:', JSON.stringify(body));
      } catch {
        console.log('API RESPONSE: (not json)');
      }
    }
  });

  await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1000);
  await page.locator('button').filter({ hasText: '快速扫描 · 5 轮' }).click();
  await page.locator('textarea').first().fill(TEST);
  await page.locator('button').filter({ hasText: '快速 X 光扫描' }).click();

  for (let r = 1; r <= 5; r++) {
    await page.waitForTimeout(4000);
    const q = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('p, div'));
      const matches = all.map(el => el.textContent?.trim() || '').filter(t => t.length > 15 && /[?？]/.test(t));
      return matches[matches.length - 1] || '';
    });
    console.log(`Q${r}: ${q?.substring(0, 80)}`);
    try {
      await page.locator('textarea').last().fill(ANSWERS[r-1]);
      await page.locator('button').filter({ hasText: /下一题|→/ }).first().click();
    } catch {
      console.log(`stopped at Q${r}`);
      break;
    }
  }

  await browser.close();
}

main();
