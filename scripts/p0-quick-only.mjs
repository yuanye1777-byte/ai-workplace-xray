/**
 * P0-1 快速模式单独复测 — 提供事实性回答以验证策略
 */
import { chromium } from 'playwright';
import fs from 'fs';

const OUT = '/Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm/scripts/p0-reverify-output';
fs.mkdirSync(OUT, { recursive: true });

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

  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);

    // Select quick mode
    await page.locator('button').filter({ hasText: '快速扫描 · 5 轮' }).click();
    await page.waitForTimeout(500);

    // Fill input
    await page.locator('textarea').first().fill(TEST);

    // Start
    await page.locator('button').filter({ hasText: '快速 X 光扫描' }).click();
    console.log('快速模式已启动');

    const questions = [];
    const tags = [];
    for (let r = 1; r <= 5; r++) {
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/p01-factual-round-${r}.png`, fullPage: false });

      const qText = await page.evaluate(() => {
        const bubbles = Array.from(document.querySelectorAll('div, p'));
        const matches = bubbles
          .map(el => ({ text: el.textContent?.trim() || '' }))
          .filter(({ text }) => text.length > 20 && /[?？]/.test(text));
        return matches.length ? matches[matches.length - 1].text : '';
      });
      questions.push(qText);

      let tag = '';
      if (/什么时候|时间|趋势|开始|持续|变化/.test(qText)) tag = '[时间趋势]';
      else if (/反过来看|反向|反例|仍然|还是.*让|肯定|交给/.test(qText)) tag = '[反向验证]';
      else if (/这是一个具体发生过的事|判断|描述 1 到 2/.test(qText)) tag = '[澄清]';
      else tag = '[维度追问]';
      tags.push(tag);

      console.log(`  Q${r}${tag}: ${qText?.substring(0, 90)}`);

      try {
        await page.locator('textarea').last().fill(ANSWERS[r-1] || `快速回答第${r}轮`);
        await page.locator('button').filter({ hasText: /下一题|→/ }).first().click({ timeout: 5000 });
      } catch (e) {
        console.log(`  第 ${r} 轮无法继续: ${e.message.substring(0, 60)}`);
        break;
      }
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/p01-factual-final.png`, fullPage: false });

    console.log('\n快速模式问题序列:');
    questions.forEach((q, i) => console.log(`  ${i+1}${tags[i]} ${q.substring(0, 80)}`));

    const trendRound = questions.findIndex(q => /什么时候|时间|趋势|开始|持续|变化/.test(q)) + 1;
    const reverseRound = questions.findIndex(q => /反过来看|反向|反例|仍然|还是.*让|肯定|交给/.test(q)) + 1;
    console.log(`\n时间趋势出现在 Q${trendRound || '未识别'}`);
    console.log(`反向验证出现在 Q${reverseRound || '未识别'}`);
    console.log(`总轮次: ${questions.length}`);

  } finally {
    await browser.close();
  }
}

main();
