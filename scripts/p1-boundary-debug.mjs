/**
 * 单边界场景调试脚本
 */
import { chromium } from "playwright";
import fs from "fs";

const BASE = "http://localhost:5173";
const OUT = "/Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm/scripts/p1-reverify-output";
fs.mkdirSync(OUT, { recursive: true });

const INITIAL = "我觉得公司没有给我足额社保，而且年终奖少发了两个月。我的绩效明明是全部门第二，但年终只有别人的一半。我是不是可以去仲裁？";
const FOLLOWUPS = [
  "我查过劳动合同法第85条，加班费应该按1.5倍算，但财务只按基本工资给的",
  "HR跟我说绩效系数有调整，但没有书面通知",
  "最早是今年2月开始发现工资条和实发对不上，一直到现在",
  "我对比了同期入职的同事，他的年终是我两倍多",
  "领导最近半年也没再让我参加薪酬调整会，只有月底签字的环节还在走",
];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/debug-home.png`, fullPage: true });
    console.log("截图: debug-home.png");

    // 快速扫描
    await page.locator("button").filter({ hasText: /快速扫描 · 5/ }).click();
    await page.waitForTimeout(500);

    // 填文字
    await page.locator("textarea").first().fill(INITIAL);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/debug-home-filled.png`, fullPage: false });

    // 点开始
    const startBtn = page.locator("button").filter({ hasText: /快速 X 光扫描/ });
    console.log("开始按钮可见?", await startBtn.isVisible());
    await startBtn.click();
    console.log("已点击开始");

    // 回答 5 轮（Q1-Q5）
    for (let r = 0; r < 5; r++) {
      await page.waitForTimeout(3500);
      await page.screenshot({ path: `${OUT}/debug-round-${r + 1}.png`, fullPage: false });

      const t = page.locator("textarea").last();
      await t.fill(FOLLOWUPS[r]);
      await page.waitForTimeout(300);
      const nextBtn = page.locator("button").filter({ hasText: /下一题|→/ });
      console.log(`Q${r + 1} 下一题按钮可见?`, await nextBtn.isVisible());
      await nextBtn.click();
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/debug-after-5-rounds.png`, fullPage: true });
    console.log("截图: debug-after-5-rounds.png");

    // 找生成报告按钮（快速扫描完成后出现）
    await page.waitForTimeout(2500);
    const genBtn = page.locator("button").filter({ hasText: /开始扫描|生成/ });
    console.log("生成报告按钮可见?", await genBtn.isVisible());
    if (await genBtn.isVisible()) {
      await genBtn.click();
      console.log("已点击生成报告");
    }

    // 等待报告
    try {
      await page.waitForSelector("text=你的当前职场状态", { timeout: 20000 });
      console.log("报告已出现");
    } catch (e) {
      console.log("等待报告超时");
    }

    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT}/debug-report.png`, fullPage: true });
    console.log("截图: debug-report.png");

  } catch (err) {
    console.error("错误:", err);
  } finally {
    await browser.close();
  }
}

main();
