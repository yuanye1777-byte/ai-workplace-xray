/**
 * 快速探测首页按钮文案
 */
import { chromium } from "playwright";

const BASE = "http://localhost:5173";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const html = await page.content();
  // 输出包含 button 的部分
  const lines = html.split("\n");
  let inButton = false;
  const buttons = [];
  for (const line of lines) {
    if (line.includes("<button")) {
      inButton = true;
      buttons.push(line.trim());
    }
    if (inButton && line.includes("</button>")) {
      inButton = false;
    }
  }

  console.log("=== 页面按钮 ===");
  buttons.forEach((b, i) => {
    console.log(`[${i}] ${b.substring(0, 300)}`);
  });

  // 也看 textarea
  const textareas = html.match(/<textarea[^>]*>/g);
  console.log("\n=== textarea ===");
  console.log(textareas);

  await page.screenshot({ path: "/Users/olivia/WorkBuddy/2026-08-05-13-47-33/zcsm/scripts/p1-reverify-output/home-probe.png", fullPage: true });
  console.log("\n📸 截图已保存到 home-probe.png");

  await browser.close();
}
main();
