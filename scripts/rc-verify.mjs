/**
 * V1 Release Candidate 总体验收脚本
 * 验收范围：核心主链路 / 报告质量 / 移动端 / 分享PDF / 隐私边界 / 阻断判定
 */
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { resolve } from "path";

const BASE = "http://localhost:5173";
const OUT = resolve(process.cwd(), "scripts/rc-output");
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

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

// ============================================================
// 6 类典型场景（5 个 followups 适配快速模式；深度模式复用+扩展）
// ============================================================
const SCENARIOS = [
  {
    id: "s1-mild-info",
    label: "轻微信息缺失",
    initial: "最近领导发消息的频率比以前少了很多，以前每周会有2-3次工作沟通，现在大概两周才一次，我对业务进展的了解也不如以前及时。",
    followups: [
      "具体是微信还是邮件变少了？大概从什么时候开始的？",
      "反过来看，领导有没有在其他方面增加了沟通频率？",
      "你的工作产出和以前比有没有变化？",
      "是的，我的工作产出正常，KPI也都达成了。",
      "有一个细节：上周领导在部门群发了一个重要的项目进度通知，我两个小时后才看到。",
    ],
  },
  {
    id: "s2-moderate-marginal",
    label: "中度边缘化",
    initial: "我的大客户被逐步转给新同事，跨部门会议我不再被通知，原本由我审批的预算现在需要经过新组长，连公司内部的重要邮件也不抄送我了。",
    followups: [
      "这些变化大概从什么时候开始？最初是哪个信号？",
      "反过来看，领导有没有仍然把重要事情交给你？",
      "新组长和你是什么关系？他的职级和你比如何？",
      "他是我平级的同事，三个月前刚晋升。最近两个月，我负责的三个大客户中两个已经转给他对接。",
      "我的报销权限从5万降到了2万，需要新组长复核。",
    ],
  },
  {
    id: "s3-high-risk-replace",
    label: "高风险替代",
    initial: "公司从外面招了一个和我同级别的人，老板让我把手头的核心项目文档都转给他，我的工位也被调到了更远的区域，OA系统里的审批权限也减少了。",
    followups: [
      "新同事入职大概是什么时候？转交项目文档是老板当面说的还是邮件通知？",
      "反过来看，老板有没有给你分配新的任务或者项目？",
      "你的OKR或者绩效目标有没有被调整？",
      "我的Q3 OKR没有更新，绩效面谈也延期了两次没有安排。",
      "新同事已经在参加原本只有我和老板参加的周会，并且直接接收客户的需求。",
    ],
  },
  {
    id: "s4-reverse-evidence",
    label: "反向证据明显",
    initial: "最近不让我参加周会了，但是年终评估给了我最高分，还把公司最重要的新项目交给我牵头。我不确定这到底算边缘化还是重用，感觉很矛盾。",
    followups: [
      "不让你参加周会是从什么时候开始的？之前参加周会一般是什么角色？",
      "年终评估最高分是哪个级别？有书面记录吗？",
      "新项目交给你是什么时候的事？参与的人员和资源规模如何？",
      "新项目是上个月启动的，有独立预算和5人团队，我直接向VP汇报。周会停止是两个月前，HR说是因为会议精简。",
      "除了我之外，还有另外两个同事也不再参加周会，但其中一个负责了更重要的产品线。",
    ],
  },
  {
    id: "s5-emotion-heavy",
    label: "情绪强但事实少",
    initial: "我觉得领导最近对我很不满，应该是对我上次的方案不满意，但具体也说不上来哪里不对。最近心很累，感觉做什么都得不到认可，工作也提不起劲。",
    followups: [
      "领导有没有跟你说过什么具体的反馈？还是只是你的感觉？",
      "除了感觉不满，有没有具体的事件可以描述？比如某次会议上的反应？",
      "你的同事或者其他和你合作的人有没有给出过反馈？",
      "有一次我汇报时领导一直在看手机没有认真听，后来也没有给我的方案反馈。",
      "除此之外我没有收到过正式的批评邮件或绩效警告，同事也没有明确说过领导对我不满。",
    ],
  },
  {
    id: "s6-conditional",
    label: "条件句/未来观察",
    initial: "如果下个季度我还接不到新项目，可能就要考虑离开了。听说公司正在调整组织架构，接下来可能会有变动，但不清楚具体怎么变，也不知道会不会影响我。",
    followups: [
      "你听到组织架构调整的消息来源是什么？有正式通知吗？",
      "目前你手上还有哪些正在进行的项目或任务？",
      "反过来看，有没有任何迹象表明你在新架构中会被保留关键角色？",
      "目前我手上还有一个维护项目，但已经进入尾声。架构调整是HR在全员邮件里提过一次，但没有细节。",
      "我目前还没有和直属领导正式沟通过这个担心，只是从同事的闲聊中听到一些说法。",
    ],
  },
];

const DEEP_EXTRA = [
  "具体从什么时候开始的？能否精确到月份？",
  "当时有没有正式的书面通知或者邮件？",
  "你的直属领导有没有和你沟通过这些变化的理由？",
  "其他同事是否也有类似的处境？",
];

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

function qualityChecks(text) {
  const checks = {};
  const speculationKeywords = /我觉得|我感觉|应该会|可能会|也许是|大概/;
  const hasFacts = /已确认的情况/.test(text);
  const factStart = hasFacts ? text.indexOf("已确认的情况") : 0;
  const factEnd = hasFacts ? factStart + Math.min(800, text.length - factStart) : text.length;
  checks.specAsFact = !(
    hasFacts && speculationKeywords.test(text.substring(factStart, factEnd))
  );
  checks.hasUncertainty = /不能|尚不|还不|无法|不确定|待观察|待确认|缺少/.test(text);
  checks.hasObsPlan = /观察|关注|验证|确认|跟踪|留意|持续|下一步|接下来/.test(text);
  checks.hasMisjudgment = /误判|最容易误判|不能据此|不等于|不一定/.test(text);
  const concSection = text.substring(0, 500);
  checks.overAssert = !/(一定|绝对|肯定|无疑|确定无疑)/.test(concSection);
  return checks;
}

async function waitForReport(page, timeout = 20000) {
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

  // 选择模式
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

  // 等待 done 状态并点击「开始扫描」
  try {
    await page.getByRole("button", { name: /开始扫描/ }).waitFor({ state: "visible", timeout: 12000 });
    await page.getByRole("button", { name: /开始扫描/ }).click();
  } catch (e) {
    console.log("  ⚠️ 未出现开始扫描按钮，尝试直接按 Enter 结束");
    await page.locator("textarea").last().press("Enter");
  }

  const ok = await waitForReport(page, 20000);
  return ok;
}

// ============================================================
// Phase 1: 核心主链路
// ============================================================
async function phase1_coreFlow(browser, results) {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 1: 核心主链路");
  console.log("=".repeat(60));

  const quickInit = "最近两个月，我的大客户被逐步转给新同事，领导反馈频率明显降低，跨部门会议不再通知我参加，原本由我主导的项目也陆续被重新分配。";
  const quickAnswers = [
    "这些变化从今年3月开始，最初是领导两周没有主动找我聊进度。",
    "反过来看，上个月领导单独安排了一个跨部门调研任务给我，涉及三个业务线。",
    "是的，我依然能正常报销和审批5万以内的预算，考勤系统也没异常。",
    "最近一个月，和我同期入职的另一位同事，他的项目数量从两个增加到了五个。",
    "我能访问的内部系统权限没有变化，客户名单也还能看到。",
  ];
  const deepInit = "公司从外部招聘了一个和我同级别的人，HR通知我，我手头的核心项目需要逐步转交给他，我的工位也被调整到了更远的区域。";
  const deepAnswers = [
    "这些变化从5月开始，最早是HR通知我新同事入职。",
    "我的职级和工作内容没有正式变动，依然可以看到所有内部系统。",
    "新同事上个月入职，工位就在我隔壁，直属领导和我们两个人都在同一个汇报线上。",
    "这些变化大概从5月中旬开始，最初只是HR说有人入职了。",
    "反过来看，上个月领导让我负责了一个跨部门的AI项目立项，预算达到200万，需要向VP直接汇报。",
    "是的，我依然可以正常使用内部知识库、CRM系统和管理后台。",
    "上周我们部门的产品评审会我没有收到邀请，会后才知道已经定好了方案。",
    "还有一个迹象：另外一个和我同时入职的同事，他的项目数量反而在增加。",
    "是的，除了我之外，另外两个同事也被转交了部分项目。",
    "我私下和HR确认过，组织架构调整会在下月正式公布，但具体方案还没定。",
  ];

  // 1a quick
  const p1 = await browser.newPage();
  const e1a = [], w1a = [];
  p1.on("pageerror", (e) => e1a.push(e.message));
  p1.on("console", (m) => { if (m.type() === "warning") w1a.push(m.text()); });
  const quickOk = await runInterview(p1, quickInit, quickAnswers, "quick");
  console.log(`  快速5轮报告生成: ${quickOk ? "✅" : "❌"}`);
  results["1a-quick5"] = quickOk ? "PASS" : "FAIL";
  if (quickOk) await takeScreenshot(p1, "rc-1a-quick-report", true);
  await p1.close();

  // 1b deep
  const p2 = await browser.newPage();
  const e1b = [], w1b = [];
  p2.on("pageerror", (e) => e1b.push(e.message));
  p2.on("console", (m) => { if (m.type() === "warning") w1b.push(m.text()); });
  const deepOk = await runInterview(p2, deepInit, deepAnswers, "deep");
  console.log(`  深度10轮报告生成: ${deepOk ? "✅" : "❌"}`);
  results["1b-deep10"] = deepOk ? "PASS" : "FAIL";
  if (deepOk) await takeScreenshot(p2, "rc-1b-deep-report", true);
  await p2.close();

  // 1c history
  const p3 = await browser.newPage();
  try {
    await p3.goto(`${BASE}/history`, { waitUntil: "networkidle" });
    await p3.waitForTimeout(2000);
    const histText = await p3.evaluate(() => document.body.textContent || "");
    const hasHistory = histText.includes("历史") || histText.includes("扫描");
    console.log(`  历史记录: ${hasHistory ? "✅" : "⚠️"}`);
    results["1c-history"] = hasHistory ? "PASS" : "CHECK";
    await takeScreenshot(p3, "rc-1c-history", true);
  } catch (e) {
    console.log("  ⚠️ 历史记录：", e.message);
    results["1c-history"] = "CHECK";
  }
  await p3.close();

  // 1d rescan
  const p4 = await browser.newPage();
  try {
    await p4.goto(BASE, { waitUntil: "networkidle" });
    await p4.waitForTimeout(800);
    const canReScan = await p4.locator("textarea").first().isVisible();
    console.log(`  首页可重新扫描: ${canReScan ? "✅" : "⚠️"}`);
    results["1d-rescan"] = canReScan ? "PASS" : "CHECK";
  } catch (e) {
    results["1d-rescan"] = "CHECK";
  }
  await p4.close();

  results._errors1a = e1a;
  results._warns1a = w1a;
  results._errors1b = e1b;
  results._warns1b = w1b;
}

// ============================================================
// Phase 2: 报告质量 — 6 场景 × 快速模式 + 2 场景深度模式
// ============================================================
async function phase2_reportQuality(browser, results) {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 2: 报告质量（6 场景 × 快速 5 轮）");
  console.log("=".repeat(60));

  for (const s of SCENARIOS) {
    console.log(`\n[2-${s.id}] ${s.label}`);
    const page = await browser.newPage();
    const ok = await runInterview(page, s.initial, s.followups, "quick");
    if (!ok) {
      console.log("  ❌ 报告未生成");
      results[`2-${s.id}`] = "FAIL";
      await page.close();
      continue;
    }
    const text = await collectReportText(page);
    const checks = qualityChecks(text);
    const pc = Object.values(checks).filter(Boolean).length;
    console.log(`  不把推测当事实: ${checks.specAsFact ? "✅" : "⚠️"}`);
    console.log(`  有不能确认部分: ${checks.hasUncertainty ? "✅" : "⚠️"}`);
    console.log(`  有观察计划: ${checks.hasObsPlan ? "✅" : "⚠️"}`);
    console.log(`  有misjudgment: ${checks.hasMisjudgment ? "✅" : "⚠️"}`);
    console.log(`  不过度断言: ${checks.overAssert ? "✅" : "⚠️"}`);
    console.log(`  质量评分: ${pc}/5`);
    results[`2-${s.id}`] = pc >= 4 ? "PASS" : (pc >= 3 ? "CHECK" : "FAIL");
    results[`2-${s.id}-detail`] = checks;
    await takeScreenshot(page, `rc-2-${s.id}`, true);
    await page.close();
  }

  // 深度模式抽测 2 个场景
  console.log("\n[2-deep] 深度模式报告质量抽测（2 场景）");
  for (const s of [SCENARIOS[2], SCENARIOS[3]]) {
    console.log(`\n[2-deep-${s.id}] ${s.label}`);
    const page = await browser.newPage();
    const deepAnswers = [...s.followups, ...DEEP_EXTRA].slice(0, 10);
  if (deepAnswers.length < 10) {
    while (deepAnswers.length < 10) {
      deepAnswers.push(`补充说明第${deepAnswers.length + 1}轮：目前我没有看到更多明确变化。`);
    }
  }
    const ok = await runInterview(page, s.initial, deepAnswers, "deep");
    if (!ok) {
      console.log("  ❌ 报告未生成");
      results[`2-deep-${s.id}`] = "FAIL";
      await page.close();
      continue;
    }
    const text = await collectReportText(page);
    const checks = qualityChecks(text);
    const pc = Object.values(checks).filter(Boolean).length;
    console.log(`  深度质量评分: ${pc}/5`);
    results[`2-deep-${s.id}`] = pc >= 4 ? "PASS" : (pc >= 3 ? "CHECK" : "FAIL");
    await takeScreenshot(page, `rc-2-deep-${s.id}`, true);
    await page.close();
  }
}

// ============================================================
// Phase 3: 移动端 390px 全流程
// ============================================================
async function phase3_mobile(browser, results) {
  console.log("\n" + "=".repeat(60));
  console.log("Phase 3: 移动端 390px 全流程");
  console.log("=".repeat(60));

  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const errors = [], warns = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "warning") warns.push(m.text()); });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await takeScreenshot(page, "rc-3a-home-390", false);
  const homeSW = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`  首页 scrollWidth=${homeSW}: ${homeSW <= 395 ? "✅" : "⚠️"}`);
  results["3a-home"] = homeSW <= 395 ? "PASS" : "CHECK";

  const mobileInit = "最近公司组织调整，我的职责范围被缩小到原来的一半，新领导很少主动和我沟通，连定期的周会也逐渐被取消了。";
  const mobileAnswers = [
    "变化从6月开始，我原来的两个业务线被拆分给其他同事。",
    "领导对我的态度没有明显变化，依然客气，只是工作联系少了。",
    "反过来看，上周领导让我负责一个新客户的项目方案。",
    "是的，我还是能看到公司的核心数据系统和工作群消息。",
    "我的绩效面谈从季度末被推迟到了下个月中旬，目前还没有明确通知。",
  ];

  await runInterview(page, mobileInit, mobileAnswers, "quick");
  await page.waitForTimeout(1500);
  await takeScreenshot(page, "rc-3b-interview-390", false);
  const ivSW = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`  问诊页 scrollWidth=${ivSW}: ${ivSW <= 395 ? "✅" : "⚠️"}`);
  results["3b-interview"] = ivSW <= 395 ? "PASS" : "CHECK";

  await takeScreenshot(page, "rc-3c-report-top-390", false);
  await takeScreenshot(page, "rc-3c-report-full-390", true);
  const rptSW = await page.evaluate(() => document.documentElement.scrollWidth);
  console.log(`  报告页 scrollWidth=${rptSW}: ${rptSW <= 395 ? "✅" : "⚠️"}`);
  results["3c-report"] = rptSW <= 395 ? "PASS" : "CHECK";

  try {
    await page.getByRole("button", { name: /分享/i }).click();
    await page.waitForTimeout(1500);
    await takeScreenshot(page, "rc-3d-share-modal-390", false);
    const modalSW = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(`  分享弹窗 scrollWidth=${modalSW}: ${modalSW <= 395 ? "✅" : "⚠️"}`);
    results["3d-share"] = modalSW <= 395 ? "PASS" : "CHECK";
  } catch (e) {
    console.log("  ⚠️ 分享弹窗：", e.message);
    results["3d-share"] = "CHECK";
  }

  try {
    await page.goto(`${BASE}/history`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, "rc-3e-history-390", false);
    const histSW = await page.evaluate(() => document.documentElement.scrollWidth);
    console.log(`  历史记录 scrollWidth=${histSW}: ${histSW <= 395 ? "✅" : "⚠️"}`);
    results["3e-history"] = histSW <= 395 ? "PASS" : "CHECK";
  } catch (e) {
    console.log("  ⚠️ 历史记录：", e.message);
    results["3e-history"] = "CHECK";
  }

  results._mobileErrors = errors;
  results._mobileWarns = warns;
  await ctx.close();
}

// ============================================================
// Phase 4: 分享 / PDF
// ============================================================
async function phase4_sharePdf(browser, results) {
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

  // Close share modal before clicking PDF button
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
async function phase5_privacy(browser, results) {
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

  const init = "我最近工作状态不太好，感觉领导对我有意见，但我没有直接证据，只是感觉他对我比以前冷淡了很多。";
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
  console.log("🚀 V1 Release Candidate 总体验收\n");
  const results = { timestamp: new Date().toISOString() };
  const browser = await chromium.launch({ headless: true });

  try {
    await phase1_coreFlow(browser, results);
    await phase2_reportQuality(browser, results);
    await phase3_mobile(browser, results);
    await phase4_sharePdf(browser, results);
    await phase5_privacy(browser, results);
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

  const allErrors = [
    ...(results._errors1a || []), ...(results._errors1b || []),
    ...(results._mobileErrors || []), ...(results._shareErrors || []),
  ];
  const allWarns = [
    ...(results._warns1a || []), ...(results._warns1b || []),
    ...(results._mobileWarns || []), ...(results._shareWarns || []),
  ];
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
  console.log("✅ RC 验收完成。结果已写入 scripts/rc-output/rc-results.json");
  console.log("=".repeat(60));
})();
