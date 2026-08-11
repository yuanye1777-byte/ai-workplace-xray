/**
 * P1-2 390px 移动端截图验证
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm/scripts/p0-reverify-output';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  try {
    // 1. 首页
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${OUT}/p1-home-390px.png`, fullPage: true });
    console.log('✅ 首页 390px 截图完成');

    // 2. 快速模式启动
    await page.locator('button').filter({ hasText: '快速扫描' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('textarea').first().fill(
      '最近三个月，领导开始绕过我直接找我下属安排工作。核心客户也被转给了新来的同事，每周一对一的沟通停了好几次，重要会议也不再通知我参加。'
    );
    await page.screenshot({ path: `${OUT}/p1-home-quick-390px.png`, fullPage: true });
    console.log('✅ 快速模式选中 390px');

    // 3. 深度模式选中
    await page.locator('button').filter({ hasText: '深度扫描' }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${OUT}/p1-home-deep-390px.png`, fullPage: true });
    console.log('✅ 深度模式选中 390px');

    // 4. 问诊页 — 启动快速扫描
    await page.locator('button').filter({ hasText: '快速扫描' }).first().click();
    await page.waitForTimeout(300);
    await page.locator('button').filter({ hasText: '快速 X 光扫描' }).click();
    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${OUT}/p1-interview-390px.png`, fullPage: true });
    console.log('✅ 问诊 390px 截图完成');

    // Answer a few rounds and check report
    for (let r = 1; r <= 5; r++) {
      try {
        await page.locator('textarea').last().fill(`第${r}轮测试回答，这是具体事实描述。`);
        await page.locator('button').filter({ hasText: /下一题|→/ }).first().click({ timeout: 5000 });
        await page.waitForTimeout(2500);
      } catch { break; }
    }

    // Wait for report
    await page.waitForTimeout(1000);

    // 5. 开始扫描并等待报告生成
    await page.locator('button').filter({ hasText: '开始扫描' }).click();
    await page.waitForTimeout(8000);

    // 5. 报告页
    await page.screenshot({ path: `${OUT}/p1-report-top-390px.png`, fullPage: false });
    await page.screenshot({ path: `${OUT}/p1-report-full-390px.png`, fullPage: true });
    console.log('✅ 报告 390px 截图完成');

    // 6. 分享弹窗
    const shareBtn = page.locator('button').filter({ hasText: '分享' });
    if (await shareBtn.count() > 0) {
      await shareBtn.first().click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${OUT}/p1-share-modal-390px.png`, fullPage: false });
      console.log('✅ 分享弹窗 390px 截图完成');
    }

  } finally {
    await browser.close();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
