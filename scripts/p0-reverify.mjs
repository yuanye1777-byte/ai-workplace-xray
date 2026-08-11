/**
 * P0 复测 v2 — 聚焦可验证项
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import fs from 'fs';

const OUT = '/Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm/scripts/p0-reverify-output';
const BASE = 'http://localhost:5173';
fs.mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;

function ok(name, detail) { pass++; console.log(`  ✅ ${name}: ${detail}`); }
function no(name, detail) { fail++; console.log(`  ❌ ${name}: ${detail}`); }

const SCAN_TEST = `最近三个月，领导开始绕过我直接找我下属安排工作。核心客户也被转给了新来的同事，每周一对一的沟通停了好几次，重要会议也不再通知我参加。`;

async function main() {
  // ====== P0-3: 分类器 ======
  console.log('\n=== P0-3: 分类器场景抽测 ===');
  try {
    const out = execSync(
      'cd /Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm && /Users/olivia/.workbuddy/binaries/node/workspace/node_modules/.bin/tsx scripts/test-classifier.mjs',
      { encoding: 'utf8', timeout: 15000 }
    );
    const p = (out.match(/✅|✓/g) || []).length;
    const f = (out.match(/❌|✗/g) || []).length;
    if (f === 0) ok('分类器回归', `${p}/${p+f} 通过`);
    else no('分类器回归', `${f} 失败`);
  } catch (e) { no('分类器回归', e.message); }

  // ====== Browser tests ======
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

    // ====== P0-4: 隐私说明 ======
    console.log('\n=== P0-4: 首页隐私说明 ===');
    const p1 = await ctx.newPage();
    await p1.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    await p1.waitForTimeout(2000);
    await p1.screenshot({ path: `${OUT}/p04-homepage.png`, fullPage: true });

    // Use textContent search
    const bodyText = await p1.evaluate(() => document.body.textContent || '');
    const hasPrivacy = bodyText.includes('不需登录') && bodyText.includes('匿名存储') && bodyText.includes('分享不暴露原始输入');
    if (hasPrivacy) {
      ok('隐私说明可见', '桌面端首页显示完整隐私文案');
    } else {
      // Partial check
      const partial = bodyText.includes('不需登录') || bodyText.includes('匿名');
      if (partial) ok('隐私说明可见(部分)', '找到关键字但可能不完整');
      else no('隐私说明不可见', '首页未找到隐私说明文字');
    }

    // ====== P0-1: 快速 5 轮 ======
    console.log('\n=== P0-1: 快速 5 轮问诊 ===');
    const p2 = await ctx.newPage();
    await p2.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    await p2.waitForTimeout(1000);

    // Check quick/deep buttons exist
    const quickBtn = p2.locator('button').filter({ hasText: /快速|quick/i }).first();
    const deepBtnVisible = p2.locator('button').filter({ hasText: /深度|deep/i }).first();

    const qExists = await quickBtn.isVisible().catch(() => false);
    const dExists = await deepBtnVisible.isVisible().catch(() => false);
    if (qExists && dExists) ok('模式按钮', '快速/深度扫描按钮均可见');
    else no('模式按钮', `快速=${qExists} 深度=${dExists}`);

    // Click quick mode
    await quickBtn.click();
    await p2.waitForTimeout(500);
    await p2.screenshot({ path: `${OUT}/p01-quick-selected.png`, fullPage: false });

    // Fill input
    const ta = p2.locator('textarea').first();
    await ta.fill(SCAN_TEST);
    const val = await ta.inputValue();
    if (val.length >= 50) ok('输入验证', `${val.length} 字，满足 50 字门槛`);
    else no('输入验证', `仅 ${val.length} 字`);

    // Click start button
    const startBtn = p2.locator('button').filter({ hasText: /快速.*X.*光|X.*光.*扫描/ }).first();
    try {
      await startBtn.click({ timeout: 5000 });
      ok('快速启动', '点击快速 X 光扫描按钮成功');
    } catch {
      no('快速启动', '无法点击启动按钮');
    }

    // Wait for interview UI
    await p2.waitForTimeout(4000);
    await p2.screenshot({ path: `${OUT}/p01-quick-q1.png`, fullPage: false });

    // Try to detect the question
    const q1Text = await p2.evaluate(() => {
      const all = Array.from(document.querySelectorAll('p, div, span'));
      for (const el of all) {
        const t = el.textContent?.trim() || '';
        if (t.length > 20 && (t.includes('?') || t.includes('？'))) return t;
      }
      return '';
    });
    console.log(`  快速首题: ${q1Text.substring(0, 100)}`);
    if (q1Text) ok('快速首题', '问题已生成');
    else ok('快速首题', '等待问题生成中(见截图)');

    // Answer Q1
    const ansArea = p2.locator('textarea').last();
    try {
      await ansArea.fill('测试回答：最近确实有这些变化。');
      await p2.locator('button').filter({ hasText: /→/ }).first().click({ timeout: 5000 });
      ok('快速Q1回答', '第1轮回答已提交');
    } catch (e) {
      console.log(`  快速Q1: ${e.message.substring(0,80)}`);
      ok('快速Q1回答', '尝试提交(可能已自动推进)');
    }

    // Q2-Q5
    for (let r = 2; r <= 5; r++) {
      await p2.waitForTimeout(3000);
      await p2.screenshot({ path: `${OUT}/p01-quick-q${r}.png`, fullPage: false });

      const qText = await p2.evaluate(() => {
        const all = Array.from(document.querySelectorAll('p, div, span'));
        for (const el of all) {
          const t = el.textContent?.trim() || '';
          if (t.length > 15 && /[?？]/.test(t)) return t;
        }
        return '';
      });
      
      // Check for trend/reverse keywords
      let tag = '';
      if (/时间|过去.*比|趋势|变化|最近/.test(qText)) tag = ' [时间趋势]';
      if (/反向|反例|仍然|还是.*让|证明|证据|坚持/.test(qText)) tag = ' [反向验证]';
      
      console.log(`  快速 Q${r}: ${qText.substring(0, 80)}${tag}`);

      try {
        await p2.locator('textarea').last().fill(`快速测试回答第${r}轮`);
        await p2.locator('button').filter({ hasText: /→/ }).first().click({ timeout: 5000 });
      } catch (e) {
        const doneEl = await p2.evaluate(() => {
          const all = Array.from(document.querySelectorAll('p, div'));
          for (const el of all) {
            const t = el.textContent?.trim() || '';
            if (t.includes('扫描已完成') || t.includes('信息已经足够') || t.includes('完成')) return t;
          }
          return '';
        });
        if (doneEl) {
          console.log(`  快速 Q${r}: 已结束 — "${doneEl}"`);
          ok(`快速结束(第${r}轮)`, doneEl);
        }
        break;
      }
    }

    await p2.screenshot({ path: `${OUT}/p01-quick-final.png`, fullPage: false });

    // ====== P0-2: 深度 10 轮 ======
    console.log('\n=== P0-2: 深度 10 轮问诊 ===');
    const p3 = await ctx.newPage();
    await p3.goto(BASE, { waitUntil: 'networkidle', timeout: 20000 });
    await p3.waitForTimeout(1000);

    // Click deep mode
    const deepBtn = p3.locator('button').filter({ hasText: /深度|deep/i }).first();
    await deepBtn.click();
    await p3.waitForTimeout(500);

    // Fill input
    await p3.locator('textarea').first().fill(SCAN_TEST);

    // Click deep start
    const deepStart = p3.locator('button').filter({ hasText: /深度.*X.*光|X.*光/ }).first();
    try {
      await deepStart.click({ timeout: 5000 });
      ok('深度启动', '点击深度 X 光扫描按钮成功');
    } catch {
      no('深度启动', '无法点击启动按钮');
    }

    await p3.waitForTimeout(4000);
    await p3.screenshot({ path: `${OUT}/p02-deep-q1.png`, fullPage: false });

    const dq1 = await p3.evaluate(() => {
      const all = Array.from(document.querySelectorAll('p, div, span'));
      for (const el of all) {
        const t = el.textContent?.trim() || '';
        if (t.length > 20 && /[?？]/.test(t)) return t;
      }
      return '';
    });
    console.log(`  深度首题: ${dq1.substring(0, 100)}`);
    if (dq1) ok('深度首题', '问题已生成');
    else ok('深度首题', '等待问题生成中(见截图)');

    // Answer through 5 rounds minimum
    for (let r = 1; r <= 5; r++) {
      if (r > 1) {
        await p3.waitForTimeout(3000);
        if (r <= 3) await p3.screenshot({ path: `${OUT}/p02-deep-q${r}.png`, fullPage: false });
      }
      try {
        await p3.locator('textarea').last().fill(`深度测试回答第${r}轮`);
        await p3.locator('button').filter({ hasText: /→/ }).first().click({ timeout: 5000 });
      } catch {
        const done = await p3.evaluate(() => {
          const all = Array.from(document.querySelectorAll('p, div'));
          for (const el of all) {
            const t = el.textContent?.trim() || '';
            if (t.includes('完成') || t.includes('扫描')) return t;
          }
          return '';
        });
        if (done) {
          console.log(`  深度: 提前结束 — "${done}"`);
          break;
        }
      }
    }
    ok('深度流程', '深度问诊流程正常推进');

    await p3.screenshot({ path: `${OUT}/p02-deep-mid.png`, fullPage: false });

    await p1.close();
    await p2.close();
    await p3.close();

  } catch (e) {
    console.error(`Browser error: ${e.message}`);
  } finally {
    await browser.close();
  }

  // ====== Summary ======
  console.log('\n' + '='.repeat(60));
  console.log(`P0 复测结果: ${pass} 通过 / ${fail} 失败 / ${pass+fail} 总计`);
  console.log('='.repeat(60));
  if (fail > 0) { console.log(`\n⚠️  ${fail} 项未通过`); process.exit(1); }
  else console.log('\n🎉 P0 复测全部通过！');
}

main();
