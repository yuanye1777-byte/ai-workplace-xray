/**
 * 专门截取报告 "事实与判断" 和 "还不能下结论" 区域
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm/scripts/p0-reverify-output';
fs.mkdirSync(OUT, { recursive: true });

const TEST = '最近三个月，领导开始绕过我直接找我下属安排工作。核心客户也被转给了新来的同事，每周一对一的沟通停了好几次，重要会议也不再通知我参加。';
const ANSWERS = [
  '我能拍板的事情越来越少，上周年度预算会原本是让我定的，最后是副总签字。',
  '最近两个月，原本我负责的三个大客户，两个已经转给新同事对接，我只保留了跟进邮件。',
  '这些变化大概从四月初开始，最初只是偶尔一次，现在几乎每周都有这样的安排。',
  '反过来看，领导上周还在部门会上表扬了我上季度的业绩，也单独给我分配了一个新项目。',
  '是的，上周产品评审会我没有收到邀请，会后才知道已经定好了方案。',
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(800);

    await page.locator('button').filter({ hasText: '快速扫描' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('textarea').first().fill(TEST);
    await page.locator('button').filter({ hasText: '快速 X 光扫描' }).click();

    for (let r = 1; r <= 5; r++) {
      await page.waitForTimeout(3500);
      await page.locator('textarea').last().fill(ANSWERS[r-1] || `快速回答第${r}轮`);
      await page.locator('button').filter({ hasText: /下一题|→/ }).first().click({ timeout: 5000 });
    }

    await page.waitForTimeout(1000);
    await page.locator('button').filter({ hasText: '开始扫描' }).click();
    await page.waitForTimeout(10000);

    // 截图事实与判断区域
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h3'));
      const target = headings.find(h => h.textContent?.includes('事实与判断'));
      if (target) target.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/p1-report-facts-390px.png`, fullPage: false });

    // 截图还不能下结论区域
    await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h3'));
      const target = headings.find(h => h.textContent?.includes('还不能下结论'));
      if (target) target.scrollIntoView({ block: 'start' });
    });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/p1-report-misjudgment-390px.png`, fullPage: false });

    console.log('✅ 报告关键区域 390px 截图完成');

  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
