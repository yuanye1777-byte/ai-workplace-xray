import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// 从 .env 读取（仅本地测试使用）
function loadEnv() {
  const envPath = path.resolve(import.meta.dirname, "../.env");
  const text = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)="(.+)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const BASE = "http://localhost:5173";
const OUT = new URL("../scripts/p1-reverify-output", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

async function main() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // 查找最新 completed 的 assessment
  const { data: assessment, error } = await supabase
    .from("assessments")
    .select("id, status, created_at")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !assessment) {
    console.log("未找到 completed assessment，尝试从最近一次测试创建…");
    // 如果没有，需要手动跑一次扫描
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: /快速扫描.*5\s*轮/ }).click();
    await page.locator("textarea").first().fill("最近三个月，我的工作逐步被边缘化，重要会议不再通知我参加。");
    await page.getByRole("button", { name: /快速\s*X\s*光扫描/ }).click();
    await page.waitForTimeout(2000);
    for (let i = 0; i < 5; i++) {
      await page.locator("textarea").last().fill(`回答 ${i + 1}`);
      const btn = page.getByRole("button", { name: /下一题/ });
      if (await btn.isVisible({ timeout: 3000 })) await btn.click();
      await page.waitForTimeout(2500);
    }
    await page.getByRole("button", { name: /开始扫描/ }).click();
    await page.waitForSelector("text=你的当前职场状态", { timeout: 20000 });
    await page.waitForTimeout(1500);
    await browser.close();

    const { data: a2, error: e2 } = await supabase
      .from("assessments")
      .select("id, status, created_at")
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (e2 || !a2) throw new Error("无法创建或找到 assessment");
    assessment.id = a2.id;
  }

  console.log(`使用 assessment ID: ${assessment.id}`);

  // 访问分享页
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shareUrl = `${BASE}/share/${assessment.id}`;
  console.log(`访问: ${shareUrl}`);
  await page.goto(shareUrl, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/p1-share-page-actual.png`, fullPage: true });

  const html = await page.content();
  await browser.close();

  // 敏感字段检查
  const sensitive = [
    { field: "report_data", desc: "完整 report_data 对象" },
    { field: "raw_turns", desc: "原始问诊记录" },
    { field: '"initial"', desc: "原始输入" },
    { field: '"inferences"', desc: "推断列表" },
    { field: '"openAssumptions"', desc: "未验证假设" },
    { field: '"actions"', desc: "行动建议" },
    { field: '"dontDo"', desc: "不要做的事" },
    { field: '"shouldDo"', desc: "应该做的事" },
  ];

  // 分享页把字段渲染为中文标签，故检查中文标签存在即可
  const required = [
    { field: "一句话结论", desc: "headline" },
    { field: "综合风险评分", desc: "total_score" },
    { field: "风险等级", desc: "total_level" },
    { field: "五维评分摘要", desc: "dimensions" },
    { field: "最值得关注的信号", desc: "top_signals" },
    { field: "已确认的情况", desc: "known_facts" },
    { field: "最容易误判的地方", desc: "misjudgment" },
  ];

  console.log("\n══════════ 分享 API 最小化验证 ══════════");
  console.log("\n❌ 不应出现的字段:");
  let leak = false;
  for (const s of sensitive) {
    const found = html.includes(s.field);
    console.log(`  ${found ? "⚠️ 泄露" : "✅ 安全"} ${s.desc}`);
    if (found) leak = true;
  }

  console.log("\n✅ 应出现的字段:");
  let missing = false;
  for (const r of required) {
    const found = html.includes(r.field);
    console.log(`  ${found ? "✅" : "❌"} ${r.desc}（${r.field}）`);
    if (!found) missing = true;
  }

  console.log("\n" + (leak || missing ? "❌ 分享 API 验证未通过" : "✅ 分享 API 最小化验证通过"));
}

main().catch((e) => {
  console.error("分享 API 测试失败:", e);
  process.exit(1);
});
