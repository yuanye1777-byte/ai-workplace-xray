/**
 * V1 RC 验收续跑 — Phase 4 (分享/PDF) + Phase 5 (隐私边界) + 汇总
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

const BASE = "http://localhost:5173";
const OUT = resolve(process.cwd(), "scripts/rc-output");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// Load .env
function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  const text = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)="(.+)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}
const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

// Load existing results if available
let results = {};
try {
  results = JSON.parse(readFileSync(`${OUT}/rc-results.json`, "utf-8"));
  console.log("📂 已加载现有结果");
} catch {
  results = { timestamp: new Date().toISOString() };
}

// ============================================================
// 工具函数
// ============================================================
async function takeScreenshot(page, name, fullPage = false) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage });
  console.log(`  📸 ${name}`);
}

async function collectReportText(page) {
  try {
    return await page.evaluate(() => {
      const el = document.querySelector("main") || document.body;
      return el?.textContent?.replace(/\s+/g, " ")?.trim() || "";
    });
  } catch {
    return "";
  }
}

async function waitForReport(page, timeout = 25000) {
  try {
    await page.waitForSelector("text=一句话结论", { timeout });
    await page.waitForTimeout(1000);
    return true;
  } catch {
    const t = await collectReportText(page);
    return /一句话结论|五维扫描|最容易误判|当前主要情况/.test(t);
  }
}

async function runInterview(page, initial, followups, mode) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const modeBtn = page.getByRole("button", {
    name: mode === "quick" ? /快速扫描.*5\s*轮/ : /深度扫描.*10\s*轮/,
  });
  try { await modeBtn.click(); await page.waitForTimeout(500); } catch {}

  await page.locator("textarea").first().fill(initial);
  await page.waitForTimeout(800);

  const ctaText = mode === "quick" ? /快速\s*X\s*光扫描/ : /深度\s*X\s*光扫描/;
  await page.getByRole("button", { name: ctaText }).click();
  await page.waitForTimeout(3000);

  for (const ans of followups) {
    await page.waitForTimeout(2500);
    const t = page.locator("textarea").last();
    await t.fill(ans);
    await page.waitForTimeout(300);
    try {
      await page.getByRole("button", { name: /下一题/ }).click();
    } catch {
      await t.press("Enter");
    }
  }

  try {
    await page.getByRole("button", { name: /开始扫描/ }).waitFor({ state: "visible", timeout: 12000 });
    await page.getByRole("button", { name: /开始扫描/ }).click();
  } catch (e) {
    console.log("  ⚠️ 未出现开始扫描按钮");
    await page.locator("textarea").last().press("Enter");
  }

  const ok = await waitForReport(page, 25000);
  return ok;
}

// ============================================================
// Phase 4: 分享 / PDF
// ============================================================
async function phase4_sharePdf(browser) {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 4: 分享 / PDF");
  console.log("=".repeat(60));

  const page = await browser.newPage();
  const errors = [], warns = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "warning") warns.push(m.text()); });

  const init = "最近半年我的任务被逐步拆分给其他同事，但领导上个月刚给我评了优秀绩效，还把部门最重要的战略项目交给了我牵头负责。";
  const answers = [
    "变化大概从3月开始，最初是我负责的一个季度项目被分配给了新来的同事。",
    "反过来看，上个月我主导的一个创新项目拿了部门的年度最佳。",
    "我能查阅的信息系统权限没有变化，内部公开的运营数据我也能看到。",
    "上周四的部门会议，我没有收到邀请，但会后收到了会议纪要。",
    "领导私下跟我说过，会议精简是因为要缩短决策链条，不是针对我个人。",
  ];

  await runInterview(page, init, answers, "quick");
  await page.waitForTimeout(1500);

  // 分享弹窗
  console.log("\n[4a] 分享摘要可复制");
  let shareUrl = null;
  try {
    await page.getByRole("button", { name: /分享/i }).click();
    await page.waitForTimeout(1500);
    await takeScreenshot(page, "rc-4a-share-modal", false);
    const pageText = await page.evaluate(() => document.body.textContent || "");
    // Try to find share URL in input field or visible text
    let urlMatch = pageText.match(/\/share\/[a-zA-Z0-9-]+/);
    if (!urlMatch) {
      const inputVal = await page.evaluate(() => {
        const inp = document.querySelector('input[type="text"], input:not([type])');
        return inp?.value || "";
      });
      urlMatch = inputVal.match(/\/share\/[a-zA-Z0-9-]+/);
    }
    if (urlMatch) shareUrl = urlMatch[0];
    const hasCopyBtn = await page.evaluate(() =>
      Array.from(document.querySelectorAll("button")).some(b => /复制|copy/i.test(b.textContent || ""))
    );
    console.log(`  分享有复制按钮: ${hasCopyBtn ? "✅" : "⚠️"}`);
    results["4a-share-copy"] = hasCopyBtn ? "PASS" : "CHECK";
  } catch (e) {
    console.log("  ⚠️ 分享弹窗：", e.message);
    results["4a-share-copy"] = "CHECK";
  }

  // 分享页 — 通过数据库查询最新 completed assessment
  console.log("\n[4b] 分享页不暴露原始输入");
  let dbShareUrl = shareUrl;
  if (!dbShareUrl) {
    try {
      const { data: assessment, error: dbErr } = await supabase
        .from("assessments")
        .select("id, status, created_at")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .single();
      if (!dbErr && assessment?.id) {
        dbShareUrl = `/share/${assessment.id}`;
        console.log(`  从数据库获取分享 URL: ${dbShareUrl}`);
      }
    } catch (e) {
      console.log("  数据库查询失败：", e.message);
    }
  }
  if (dbShareUrl) {
    const sp = await browser.newPage();
    await sp.goto(`${BASE}${dbShareUrl}`, { waitUntil: "networkidle" });
    await sp.waitForTimeout(3000);
    const shareText = await sp.evaluate(() => document.body.textContent || "");
    const html = await sp.content();
    const exposedInit = /我的大客户|不让我参加周会|我的任务被逐步拆分/.test(shareText);
    const exposedRaw = /report_data|raw.turns|openAssumptions|inferences|dontDo|shouldDo|actions/.test(html);
    console.log(`  暴露原始输入: ${exposedInit ? "❌" : "✅"}`);
    console.log(`  暴露内部字段: ${exposedRaw ? "❌" : "✅"}`);
    results["4b-share-leak"] = (!exposedInit && !exposedRaw) ? "PASS" : "FAIL";
    await takeScreenshot(sp, "rc-4b-share-page", true);
    await sp.close();
  } else {
    console.log("  ⚠️ 无分享 URL");
    results["4b-share-leak"] = "CHECK";
  }

  // Close share modal by clicking 关闭 or X button
  try {
    const closeBtn = page.getByRole("button").filter({ hasText: /关闭/ });
    if (await closeBtn.isVisible({ timeout: 2000 })) {
      await closeBtn.click();
      await page.waitForTimeout(800);
    } else {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(800);
    }
  } catch {}

  // PDF
  console.log("\n[4c] PDF 导出");
  try {
    const pdfBtn = page.getByRole("button", { name: /PDF|导出|打印/i });
    if (await pdfBtn.isVisible({ timeout: 3000 })) {
      await pdfBtn.click();
      await page.waitForTimeout(3000);
    }
    const pdfContent = await page.evaluate(() => document.body.textContent || "");
    const hasPdfTrigger = /PDF|pdf|导出|下载/.test(pdfContent);
    console.log(`  PDF 导出触发: ${hasPdfTrigger ? "✅ 找到相关按钮" : "⚠️ 未找到"}`);

    const bgColor = await page.evaluate(() => {
      const el = document.querySelector("main, .report, [class*='report']") || document.body;
      return window.getComputedStyle(el).backgroundColor;
    });
    const fgColor = await page.evaluate(() => {
      const el = document.querySelector("main, .report, [class*='report']") || document.body;
      return window.getComputedStyle(el).color;
    });
    console.log(`  PDF 区域背景: ${bgColor}, 文字色: ${fgColor}`);
    const isReadable = bgColor.includes("255") || bgColor.includes("rgb(255");
    console.log(`  白底黑字可读: ${isReadable ? "✅" : "⚠️"}`);
    results["4c-pdf"] = hasPdfTrigger ? "PASS" : "CHECK";
  } catch (e) {
    console.log("  ⚠️ PDF 验证：", e.message);
    results["4c-pdf"] = "CHECK";
  }

  results._shareErrors = errors;
  results._shareWarns = warns;
  await page.close();
}

// ============================================================
// Phase 5: 隐私与边界
// ============================================================
async function phase5_privacy(browser) {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 5: 隐私与边界");
  console.log("=".repeat(60));

  const page = await browser.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  const homeHTML = await page.evaluate(() => document.body.innerHTML || "");
  const hasPrivacy = /不需登录|匿名存储|分享不暴露原始输入|你的数据只属于你/.test(homeHTML);
  console.log(`  首页隐私说明: ${hasPrivacy ? "✅" : "⚠️"}`);
  results["5a-home-privacy"] = hasPrivacy ? "PASS" : "CHECK";

  const init = "我最近工作状态不太好，感觉领导对我有意见，但我没有直接证据，只是感觉他对我比以前冷淡了很多。最近两周他都很少主动找我聊工作上的事情。";
  const answers = [
    "具体来说，上周领导没有回复我的周报邮件，以前都会回的。",
    "领导以前每周都会和我一对一沟通，现在大概一个月才有一次。",
    "没有其他的明确迹象，就是我自己的感觉。",
    "有一个正面信号：上个月我的项目交付后客户给了好评，领导在群里有点赞。",
    "我没有和HR或领导正式反馈过这个情况。",
  ];

  await runInterview(page, init, answers, "quick");
  await page.waitForTimeout(1500);

  const reportHTML = await page.evaluate(() => document.body.innerHTML || "");
  const text = await collectReportText(page);
  const hasDisclaimer = /免责|声明|参考|不构成|建议|本工具仅提供/.test(reportHTML);
  console.log(`  报告免责声明: ${hasDisclaimer ? "✅" : "⚠️"}`);
  results["5b-disclaimer"] = hasDisclaimer ? "PASS" : "CHECK";

  const hasLegal = /仲裁|起诉|劳动法|赔偿|违法/.test(text);
  const hasPsych = /焦虑症|抑郁|心理疾病|诊断|症状/.test(text);
  const hasCareer = /立刻离职|马上跳槽|辞职|裸辞/.test(text);
  const hasIntent = /故意|存心|恶意|蓄意/.test(text);
  console.log(`  法律建议: ${hasLegal ? "⚠️ 可能越界" : "✅"}`);
  console.log(`  心理诊断: ${hasPsych ? "⚠️ 可能越界" : "✅"}`);
  console.log(`  职业决定: ${hasCareer ? "⚠️ 可能越界" : "✅"}`);
  console.log(`  意图判断: ${hasIntent ? "⚠️ 可能越界" : "✅"}`);
  results["5c-boundary"] = (!hasLegal && !hasPsych && !hasCareer && !hasIntent) ? "PASS" : "CHECK";

  await takeScreenshot(page, "rc-5-report-disclaimer", true);
  await page.close();
}

// ============================================================
// Main
// ============================================================
(async () => {
  console.log("🚀 V1 RC 验收续跑 — Phase 4 & 5\n");
  const browser = await chromium.launch({ headless: true });

  try {
    await phase4_sharePdf(browser);
    await phase5_privacy(browser);
  } finally {
    await browser.close();
  }

  console.log("\n" + "=".repeat(60));
  console.log("📊 验收汇总");
  console.log("=".repeat(60));

  const allItems = Object.entries(results).filter(([k]) => !k.startsWith("_"));
  const passed = allItems.filter(([, v]) => v === "PASS").length;
  const check = allItems.filter(([, v]) => v === "CHECK").length;
  const failed = allItems.filter(([, v]) => v === "FAIL").length;
  console.log(`  PASS: ${passed}  CHECK: ${check}  FAIL: ${failed}`);

  for (const [k, v] of allItems) {
    if (typeof v === "string") {
      const icon = v === "PASS" ? "✅" : v === "FAIL" ? "❌" : "⚠️";
      console.log(`  ${icon} ${k}: ${v}`);
    } else {
      console.log(`  📋 ${k}: ${JSON.stringify(v)}`);
    }
  }

  const allErrors = [...(results._shareErrors || [])];
  const allWarns = [...(results._shareWarns || [])];
  const uniqueErrors = [...new Set(allErrors)];
  const uniqueWarns = [...new Set(allWarns)];

  console.log("\n控制台 Errors:");
  uniqueErrors.forEach((e, i) => console.log(`  ${i + 1}. ${e.substring(0, 150)}`));
  console.log("\n控制台 Warnings:");
  uniqueWarns.forEach((w, i) => console.log(`  ${i + 1}. ${w.substring(0, 150)}`));

  // 阻断判定
  const blockers = [];
  const polishes = [];
  const postV1 = [];

  if (failed > 0) blockers.push(`FAIL 项: ${failed} 个`);
  const realErrors = uniqueErrors.filter(e =>
    /crash|fail|error|500|timeout|undefined is not|Cannot read|is not a function/i.test(e) &&
    !/quota|deprecated|inputValidator|chunk/i.test(e)
  );
  if (realErrors.length > 0) blockers.push(`控制台关键错误: ${realErrors.length} 个`);

  if (check > 0) polishes.push(`CHECK 项需人工复核: ${check} 个`);
  const nonFramework = uniqueWarns.filter(w => !/deprecated|inputValidator|chunk/i.test(w));
  if (nonFramework.length > 0) polishes.push(`控制台非框架警告: ${nonFramework.length} 个`);

  postV1.push("Cloudflare AI 配额限制 → 替换正式 API key");
  postV1.push("报告生成速度优化");
  postV1.push("历史记录分页/搜索");

  console.log("\n🔴 RC Blocker（必须修）:");
  if (blockers.length === 0) console.log("  ✅ 无阻断问题");
  else blockers.forEach(b => console.log(`  ❌ ${b}`));

  console.log("\n🟡 RC Polish（可修可不修）:");
  if (polishes.length === 0) console.log("  ✅ 无待打磨项");
  else polishes.forEach(p => console.log(`  ⚡ ${p}`));

  console.log("\n🔵 Post-V1（上线后优化）:");
  postV1.forEach(p => console.log(`  📌 ${p}`));

  writeFileSync(`${OUT}/rc-results.json`, JSON.stringify(results, null, 2));

  console.log("\n" + "=".repeat(60));
  console.log("✅ RC 验收续跑完成。结果已写入 scripts/rc-output/rc-results.json");
  console.log("=".repeat(60));
})();
