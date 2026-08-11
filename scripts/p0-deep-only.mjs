/**
 * P0-2 深度模式单独复测
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm/scripts/p0-reverify-output';
fs.mkdirSync(OUT, { recursive: true });

const TEST = `最近三个月，领导开始绕过我直接找我下属安排工作。核心客户也被转给了新来的同事，每周一对一的沟通停了好几次，重要会议也不再通知我参加。`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    // Select deep mode (default, but click to confirm)
    const deepModeBtn = page.locator('button').filter({ hasText: '深度扫描 · 10 轮' });
    await deepModeBtn.click({ timeout: 10000 });
    await page.waitForTimeout(500);

    // Fill input
    await page.locator('textarea').first().fill(TEST);

    // Click start
    const startBtn = page.locator('button').filter({ hasText: '深度 X 光扫描' });
    await startBtn.click({ timeout: 10000 });

    console.log('深度模式已启动');

    const questions = [];
    for (let r = 1; r <= 10; r++) {
      await page.waitForTimeout(3500);

      // Extract the last AI question
      const qText = await page.evaluate(() => {
        const bubbles = Array.from(document.querySelectorAll('div, p'));
        const matches = bubbles
          .map(el => ({ el, text: el.textContent?.trim() || '' }))
          .filter(({ text }) => text.length > 20 && /[?？]/.test(text));
        return matches.length ? matches[matches.length - 1].text : '';
      });
      questions.push(qText);
      console.log(`  Q${r}: ${qText?.substring(0, 90)}`);

      if (r <= 4) {
        await page.screenshot({ path: `${OUT}/p02-deep-round-${r}.png`, fullPage: false });
      }

      // Submit answer
      try {
        await page.locator('textarea').last().fill(`深度测试回答第${r}轮，这是具体事实描述。`);
        await page.locator('button').filter({ hasText: /下一题|→/ }).first().click({ timeout: 5000 });
      } catch (e) {
        console.log(`  第 ${r} 轮无法继续: ${e.message.substring(0, 60)}`);
        break;
      }
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/p02-deep-final.png`, fullPage: false });

    // Summary
    console.log('\n深度模式问题序列:');
    questions.forEach((q, i) => console.log(`  ${i+1}. ${q.substring(0, 80)}`));

    const trendRound = questions.findIndex(q => /什么时候|时间|趋势|开始|持续|变化/.test(q)) + 1;
    const reverseRound = questions.findIndex(q => /反向|反例|仍然|还是|信任|认可|交给|负责/.test(q)) + 1;
    console.log(`\n时间趋势出现在 Q${trendRound || '未识别'}`);
    console.log(`反向验证出现在 Q${reverseRound || '未识别'}`);
    console.log(`总轮次: ${questions.length}`);

  } finally {
    await browser.close();
  }
}

main();
