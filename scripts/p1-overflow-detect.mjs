import { chromium } from "playwright";

const BASE = "http://localhost:5173";

async function detectOverflow(page) {
  return await page.evaluate(() => {
    const html = document.documentElement;
    const body = document.body;
    const vw = window.innerWidth;
    const htmlW = html.scrollWidth;
    const bodyW = body.scrollWidth;
    const overflowingEls = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.right > vw + 1 && rect.width > 0 && rect.height > 0) {
        const tag = el.tagName.toLowerCase();
        const id = el.id ? `#${el.id}` : "";
        const cls = el.className && typeof el.className === "string" ? `.${el.className.split(" ").slice(0, 2).join(".")}` : "";
        overflowingEls.push(`${tag}${id}${cls} right=${Math.round(rect.right)}px vw=${vw}`);
        if (overflowingEls.length >= 10) break;
      }
    }
    return {
      viewportWidth: vw,
      htmlScrollWidth: htmlW,
      bodyScrollWidth: bodyW,
      hasOverflow: htmlW > vw || bodyW > vw || overflowingEls.length > 0,
      overflowingEls,
    };
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  const results = [];

  // 1. 首页
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  results.push({ page: "首页", ...(await detectOverflow(page)) });

  // 2. 问诊页
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /快速扫描.*5\s*轮/ }).click();
  await page.locator("textarea").first().fill("最近半年我发现自己的一些工作任务被逐步转交，原本由我负责的跨部门会议也开始通知其他人参加，直属领导的反馈频率明显降低，很多信息不再第一时间同步给我。");
  await page.getByRole("button", { name: /快速\s*X\s*光扫描/ }).click();
  await page.waitForTimeout(2000);
  results.push({ page: "问诊页", ...(await detectOverflow(page)) });

  // 回答 5 轮并生成报告
  const answers = ["a", "b", "c", "d", "e"];
  for (const a of answers) {
    await page.locator("textarea").last().fill(a);
    const btn = page.getByRole("button", { name: /下一题/ });
    if (await btn.isVisible({ timeout: 3000 })) await btn.click();
    else await page.locator("textarea").last().press("Enter");
    await page.waitForTimeout(2000);
  }
  try {
    await page.getByRole("button", { name: /开始扫描/ }).click();
    await page.waitForSelector("text=你的当前职场状态", { timeout: 20000 });
    await page.waitForTimeout(1000);
  } catch (e) {
    console.log("⚠️ 等待报告超时");
  }

  // 3. 报告顶部
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  results.push({ page: "报告顶部", ...(await detectOverflow(page)) });

  // 4. 事实/推断/假设区域
  await page.locator("text=事实与判断").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  results.push({ page: "事实/推断/假设区域", ...(await detectOverflow(page)) });

  // 5. misjudgment 区域
  await page.locator("text=最容易误判的地方").first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  results.push({ page: "misjudgment 区域", ...(await detectOverflow(page)) });

  // 6. 分享弹窗
  try {
    await page.getByRole("button", { name: /分享/i }).first().click();
    await page.waitForTimeout(800);
    results.push({ page: "分享弹窗", ...(await detectOverflow(page)) });
  } catch (e) {
    results.push({ page: "分享弹窗", hasOverflow: true, error: "无法打开弹窗" });
  }

  await ctx.close();
  await browser.close();

  console.log("\n══════════ 390px 溢出检测结果 ══════════");
  let allPass = true;
  for (const r of results) {
    const status = r.hasOverflow ? "❌ 溢出" : "✅ 正常";
    if (r.hasOverflow) allPass = false;
    console.log(`\n${status} ${r.page}`);
    console.log(`   viewport=${r.viewportWidth}px htmlScroll=${r.htmlScrollWidth}px bodyScroll=${r.bodyScrollWidth}px`);
    if (r.overflowingEls?.length) {
      for (const el of r.overflowingEls.slice(0, 5)) {
        console.log(`   → ${el}`);
      }
    }
  }
  console.log("\n" + (allPass ? "✅ 全部页面无横向溢出" : "❌ 发现横向溢出"));
}

main().catch((e) => {
  console.error("溢出检测失败:", e);
  process.exit(1);
});
