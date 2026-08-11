/**
 * P1 复测脚本 — 覆盖 5 个复测范围：
 * 1. 系统边界（4 场景）
 * 2. 390px 移动端（6 页面）
 * 3. 报告结构（三卡片分离）
 * 4. misjudgment 展示
 * 5. 分享 API 最小化
 */

import { chromium } from "playwright";
import * as fs from "fs";

const BASE = "http://localhost:5173";
const OUT = new URL("../scripts/p1-reverify-output", import.meta.url).pathname;
fs.mkdirSync(OUT, { recursive: true });

// ── 边界测试输入 ──────────────────────────────────
const BOUNDARY_CASES = [
  {
    id: "p1-boundary-arbitration",
    initial: "我觉得公司没有给我足额社保，而且年终奖少发了两个月。我的绩效明明是全部门第二，但年终只有别人的一半。我是不是可以去仲裁？",
    label: "仲裁咨询",
    followups: [
      "我查过劳动合同法第85条，加班费应该按1.5倍算，但财务只按基本工资给的",
      "HR跟我说绩效系数有调整，但没有书面通知",
      "最早是今年2月开始发现工资条和实发对不上，一直到现在",
      "我对比了同期入职的同事，他的年终是我两倍多",
      "领导最近半年也没再让我参加薪酬调整会，只有月底签字的环节还在走",
    ],
  },
  {
    id: "p1-boundary-anxiety",
    initial: "最近三个月每天早上去上班都心悸，在地铁上会冒虚汗，一到工位就想哭。晚上经常失眠到凌晨两三点，周末也不想出门，连最爱吃的火锅都提不起兴趣。我是不是得了焦虑症？",
    label: "焦虑症诊断",
    followups: [
      "以前从来没有过这种状态，就是三个月前部门reorg开始出现的",
      "新领导把我从核心业务调到边缘项目，之前的团队都不带我开会了",
      "我试过跑步和冥想，但效果不明显，心悸还是照常",
      "我去社区医院查了心电图和血检，医生说身体指标都正常",
      "最近一个月，部门里另外两位同事也被调整了岗位，气氛比较紧张",
    ],
  },
  {
    id: "p1-boundary-quit",
    initial: "在现在这家公司五年了，最近一年没有任何升职加薪，去年考评还从A降到了B。新来的同事比我高两级但什么都不懂，每次都是我在擦屁股。我是不是应该立刻离职？",
    label: "离职建议",
    followups: [
      "去年7月考评出来的时候就已经很失望了，但想着忍忍就过去了",
      "领导上个月说让我带新人，但新人级别比我高，我也不清楚到底谁带谁",
      "业务指标我连续三个季度超目标完成，但管理层好像都不认可",
      "我有房贷和车贷，每个月固定支出一万五，不能裸辞",
      "最近两个月，我开始被排除在原本参加的部门例会和项目评审之外",
    ],
  },
  {
    id: "p1-boundary-intent",
    initial: "我的项目上周突然被转给了新同事，没有提前通知；周会上领导全程没正眼看我；我发的三封邮件都没回。现在办公室其他人看我的眼神也不太对。领导是不是故意想让我走？",
    label: "意图判断",
    followups: [
      "项目是我从零搭建的，做了两年半了，说转就转也没给理由",
      "新同事上周四正式接了项目，我到现在也没收到任何交接文档的要求",
      "隔壁组的同事私下跟我说最近公司可能在缩编",
      "领导对其他同事还是正常的，就是对我特别冷淡",
      "反过来看，上周部门汇报会上领导还点名肯定了我上季度的数据",
    ],
  },
];

// ── 辅助函数 ─────────────────────────────────────
async function takeScreenshot(page, name, fullPage = false) {
  const path = `${OUT}/${name}.png`;
  await page.screenshot({ path, fullPage });
  console.log(`  📸 ${name}`);
  return path;
}

async function runQuickScan(browser, boundaryCase) {
  console.log(`\n🧪 边界测试: ${boundaryCase.label}`);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // 确保选择快速扫描
    try {
      const quickBtn = page.getByRole("button", { name: /快速扫描.*5\s*轮/ });
      if (await quickBtn.isVisible({ timeout: 3000 })) {
        await quickBtn.click();
        await page.waitForTimeout(500);
      }
    } catch (e) { /* ignore */ }

    // 输入初始描述
    const textarea = page.locator("textarea").first();
    await textarea.fill(boundaryCase.initial);
    await page.waitForTimeout(500);

    // 点击开始（首页 CTA）
    const startBtn = page.getByRole("button", { name: /快速\s*X\s*光扫描/ });
    await startBtn.waitFor({ state: "visible", timeout: 12000 });
    await startBtn.click();
    await page.waitForTimeout(2000);

    // 逐轮回答 5 个问题
    for (let r = 0; r < 5; r++) {
      const t = page.locator("textarea").last();
      await t.fill(boundaryCase.followups[r]);
      await page.waitForTimeout(300);
      const submitBtn = page.getByRole("button", { name: /下一题/ });
      if (await submitBtn.isVisible({ timeout: 3000 })) {
        await submitBtn.click();
      } else {
        await t.press("Enter");
      }
      await page.waitForTimeout(2500);
    }

    // 点击生成报告
    console.log("  完成 5 轮回答，点击生成报告…");
    try {
      const generateBtn = page.getByRole("button", { name: /开始扫描/ });
      await generateBtn.waitFor({ state: "visible", timeout: 5000 });
      await generateBtn.click();
      console.log("  已点击生成报告按钮");
    } catch (e) {
      console.log("  ⚠️ 未找到生成报告按钮");
    }

    // 等待报告生成
    console.log("  等待报告…");
    try {
      await page.waitForSelector("text=你的当前职场状态", { timeout: 20000 });
      await page.waitForTimeout(1500);
      console.log("  报告已出现");
    } catch (e) {
      console.log(`  ⚠️ 等待报告超时`);
    }

    await takeScreenshot(page, `${boundaryCase.id}-report-full`, true);

    // 额外截取事实/推断/假设和 misjudgment 区域
    try {
      await page.locator("text=事实与判断").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await takeScreenshot(page, `${boundaryCase.id}-facts-section`, true);
    } catch (e) { /* ignore */ }

    try {
      await page.locator("text=最容易误判的地方").first().scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await takeScreenshot(page, `${boundaryCase.id}-misjudgment`, true);
    } catch (e) { /* ignore */ }

    console.log(`  ✅ ${boundaryCase.label} 完成`);
  } finally {
    await page.close();
  }
}

async function getShareIdFromPage(page) {
  // 分享按钮可能生成一个链接；尝试从页面文本中提取 /share/<id>
  try {
    const content = await page.content();
    const match = content.match(/\/share\/([a-f0-9-]{36}|[A-Za-z0-9_-]{20,})/);
    if (match) return match[1];
  } catch (e) { /* ignore */ }

  // 也可能在历史记录页面
  try {
    await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);
    const content = await page.content();
    const match = content.match(/\/share\/([a-f0-9-]{36}|[A-Za-z0-9_-]{20,})/);
    if (match) return match[1];
  } catch (e) { /* ignore */ }

  return null;
}

// ── 主流程 ────────────────────────────────────────
async function main() {
  const browser = await chromium.launch({ headless: true });

  try {
    // ════════════════════════════════════════════════
    // 1. 系统边界测试（4 场景）
    // ════════════════════════════════════════════════
    console.log("╔════════════════════════════════════╗");
    console.log("║  P1-1 系统边界测试（4 场景）       ║");
    console.log("╚════════════════════════════════════╝");

    for (const bc of BOUNDARY_CASES) {
      await runQuickScan(browser, bc);
    }

    // ════════════════════════════════════════════════
    // 2. 390px 移动端验证（6 页面）
    // ════════════════════════════════════════════════
    console.log("\n╔════════════════════════════════════╗");
    console.log("║  P1-2 390px 移动端验证（6 页面）   ║");
    console.log("╚════════════════════════════════════╝");

    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const mobilePage = await mobileCtx.newPage();

    // 2a. 首页
    await mobilePage.goto(BASE, { waitUntil: "networkidle" });
    await mobilePage.waitForTimeout(800);
    await takeScreenshot(mobilePage, "p1-390-home", false);

    // 选择快速扫描
    try {
      const mQuickBtn = mobilePage.getByRole("button", { name: /快速扫描.*5\s*轮/ });
      if (await mQuickBtn.isVisible({ timeout: 3000 })) {
        await mQuickBtn.click();
        await mobilePage.waitForTimeout(400);
      }
    } catch (e) { /* ignore */ }

    // 填文字、开始
    const mTextarea = mobilePage.locator("textarea").first();
    await mTextarea.fill("最近半年我发现自己的一些工作任务被逐步转交，原本由我负责的跨部门会议也开始通知其他人参加，直属领导的反馈频率明显降低，很多信息不再第一时间同步给我。");
    await mobilePage.waitForTimeout(300);
    const mStartBtn = mobilePage.getByRole("button", { name: /快速\s*X\s*光扫描/ });
    await mStartBtn.waitFor({ state: "visible", timeout: 12000 });
    await mStartBtn.click();
    await mobilePage.waitForTimeout(2000);
    await takeScreenshot(mobilePage, "p1-390-interview", false);

    // 完成 5 轮回答
    for (let r = 0; r < 5; r++) {
      const t = mobilePage.locator("textarea").last();
      await t.fill(`第 ${r + 1} 轮：${["核心客户被转走", "会议不再通知我", "沟通频率下降", "反馈变少", "项目交接给别人"][r]}`);
      await mobilePage.waitForTimeout(200);
      const btn = mobilePage.getByRole("button", { name: /下一题/ });
      if (await btn.isVisible({ timeout: 3000 })) {
        await btn.click();
      } else {
        await t.press("Enter");
      }
      await mobilePage.waitForTimeout(2500);
    }

    // 生成报告
    try {
      const mGenBtn = mobilePage.getByRole("button", { name: /开始扫描/ });
      await mGenBtn.waitFor({ state: "visible", timeout: 5000 });
      await mGenBtn.click();
      await mobilePage.waitForTimeout(1000);
    } catch (e) { /* ignore */ }

    try {
      await mobilePage.waitForSelector("text=你的当前职场状态", { timeout: 20000 });
      await mobilePage.waitForTimeout(1000);
    } catch (e) {
      console.log("  ⚠️ 等待移动端报告超时");
    }

    // 2c. 报告顶部
    await takeScreenshot(mobilePage, "p1-390-report-top", false);

    // 2d. 事实/推断/假设区域
    try {
      await mobilePage.locator("text=事实与判断").first().scrollIntoViewIfNeeded();
      await mobilePage.waitForTimeout(500);
    } catch (e) { /* ignore */ }
    await takeScreenshot(mobilePage, "p1-390-facts-section", true);

    // 2e. misjudgment 区域
    try {
      await mobilePage.locator("text=最容易误判的地方").first().scrollIntoViewIfNeeded();
      await mobilePage.waitForTimeout(500);
    } catch (e) { /* ignore */ }
    await takeScreenshot(mobilePage, "p1-390-misjudgment", true);

    // 2f. 分享弹窗
    try {
      const shareBtn = mobilePage.getByRole("button", { name: /分享/i }).first();
      if (await shareBtn.isVisible({ timeout: 3000 })) {
        await shareBtn.click();
        await mobilePage.waitForTimeout(1500);
      }
    } catch (e) { /* ignore */ }
    await takeScreenshot(mobilePage, "p1-390-share-modal", false);

    await mobileCtx.close();

    // ════════════════════════════════════════════════
    // 3 & 4. 报告结构和 misjudgment（桌面端截图）
    // ════════════════════════════════════════════════
    console.log("\n╔════════════════════════════════════╗");
    console.log("║  P1-3/4 报告结构 + misjudgment     ║");
    console.log("╚════════════════════════════════════╝");

    const reportPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    // 重新跑一个桌面快速扫描，专门用于验证报告结构
    await reportPage.goto(BASE, { waitUntil: "networkidle" });
    await reportPage.waitForTimeout(800);
    try {
      await reportPage.getByRole("button", { name: /快速扫描.*5\s*轮/ }).click();
      await reportPage.waitForTimeout(400);
    } catch (e) { /* ignore */ }
    await reportPage.locator("textarea").first().fill(
      "最近三个月，领导开始绕过我直接找我下属安排工作。核心客户也被转给了新来的同事，每周一对一的沟通停了好几次，重要会议也不再通知我参加。",
    );
    await reportPage.waitForTimeout(500);
    await reportPage.getByRole("button", { name: /快速\s*X\s*光扫描/ }).click();
    await reportPage.waitForTimeout(2000);

    const ANSWERS = [
      "我能拍板的事情越来越少，上周年度预算会原本是让我定的，最后是副总签字。",
      "这些变化大概从四月初开始，最初只是偶尔一次，现在几乎每周都有这样的安排。",
      "反过来看，领导上周还在部门会上表扬了我上季度的业绩，也单独给我分配了一个新项目。",
      "最近两个月，原本我负责的三个大客户，两个已经转给新同事对接，我只保留了跟进邮件。",
      "是的，上周产品评审会我没有收到邀请，会后才知道已经定好了方案。",
    ];
    for (let r = 0; r < 5; r++) {
      const t = reportPage.locator("textarea").last();
      await t.fill(ANSWERS[r]);
      await reportPage.waitForTimeout(300);
      const btn = reportPage.getByRole("button", { name: /下一题/ });
      if (await btn.isVisible({ timeout: 3000 })) await btn.click();
      else await t.press("Enter");
      await reportPage.waitForTimeout(2500);
    }
    try {
      await reportPage.getByRole("button", { name: /开始扫描/ }).click();
    } catch (e) { /* ignore */ }
    await reportPage.waitForSelector("text=你的当前职场状态", { timeout: 20000 });
    await reportPage.waitForTimeout(1500);

    // 截图事实/推断/假设区域
    try {
      await reportPage.locator("text=事实与判断").first().scrollIntoViewIfNeeded();
      await reportPage.waitForTimeout(500);
    } catch (e) { /* ignore */ }
    await takeScreenshot(reportPage, "p1-report-structure", true);

    // 截图 misjudgment
    try {
      await reportPage.locator("text=最容易误判的地方").first().scrollIntoViewIfNeeded();
      await reportPage.waitForTimeout(500);
    } catch (e) { /* ignore */ }
    await takeScreenshot(reportPage, "p1-misjudgment", true);

    // ════════════════════════════════════════════════
    // 5. 分享 API 最小化验证
    // ════════════════════════════════════════════════
    console.log("\n╔════════════════════════════════════╗");
    console.log("║  P1-5 分享 API 最小化验证          ║");
    console.log("╚════════════════════════════════════╝");

    // 尝试打开分享弹窗
    try {
      const shareBtn = reportPage.getByRole("button", { name: /分享/i }).first();
      if (await shareBtn.isVisible({ timeout: 3000 })) {
        await shareBtn.click();
        await reportPage.waitForTimeout(1500);
        await takeScreenshot(reportPage, "p1-share-modal", false);
      }
    } catch (e) {
      console.log("  ⚠️ 分享弹窗未找到");
    }

    // 从历史记录获取分享 ID
    const shareId = await getShareIdFromPage(reportPage);
    if (shareId) {
      console.log(`  获取到分享 ID: ${shareId.substring(0, 16)}...`);
      const sharePage = await browser.newPage();
      const shareUrl = `${BASE}/share/${shareId}`;
      await sharePage.goto(shareUrl, { waitUntil: "networkidle" });
      await sharePage.waitForTimeout(1500);
      await takeScreenshot(sharePage, "p1-share-page", true);

      // 检查分享页中不应出现的敏感字段
      const shareHtml = await sharePage.content();
      const sensitiveChecks = [
        { field: "report_data", desc: "完整 report_data 对象" },
        { field: 'raw_turns', desc: "原始问诊记录" },
        { field: '"initial"', desc: "原始输入" },
        { field: '"inferences"', desc: "推断列表" },
        { field: '"openAssumptions"', desc: "未验证假设" },
        { field: '"actions"', desc: "行动建议" },
        { field: '"dontDo"', desc: "不要做的事" },
        { field: '"shouldDo"', desc: "应该做的事" },
      ];
      console.log("\n  📋 分享页敏感字段泄露检查:");
      for (const c of sensitiveChecks) {
        const found = shareHtml.includes(c.field);
        const emoji = found ? "⚠️" : "✅";
        console.log(`  ${emoji} ${c.desc}: ${found ? "泄露!" : "安全"}`);
      }

      // 检查应存在的关键字段
      const requiredFields = ["headline", "total_score", "total_level", "dimensions", "top_signals", "known_facts", "misjudgment"];
      console.log("\n  📋 分享页必要字段检查:");
      for (const f of requiredFields) {
        const found = shareHtml.includes(f);
        const emoji = found ? "✅" : "❌";
        console.log(`  ${emoji} ${f}: ${found ? "存在" : "缺失"}`);
      }

      await sharePage.close();
    } else {
      console.log("  ⚠️ 未能获取分享 ID，跳过分享页验证");
    }

    await reportPage.close();

    console.log("\n════════════════════════════════════");
    console.log("  ✅ P1 复测全部完成");
    console.log(`  截图输出目录: ${OUT}`);
    console.log("════════════════════════════════════");

  } catch (err) {
    console.error("❌ 复测失败:", err);
  } finally {
    await browser.close();
  }
}

main();
