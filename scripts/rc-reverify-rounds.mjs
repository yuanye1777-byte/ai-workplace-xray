import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3000";
const OUTPUT_DIR = path.join(import.meta.dirname, "rc-rounds-output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const TEST_INPUT = `最近三个月，我明显感觉到部门里的氛围变了。以前每周一的例会都是我主持的，现在领导突然让另一个同事代替我主持。我负责跟进两年多的核心客户项目，上个月被通知转交给另一个团队对接，理由是"优化资源配置"。我之前申请的预算审批也被卡住了，而同组其他人的申请都正常通过。部门新来了一个年轻同事，领导让他跟着我学习业务流程，但我感觉他更像是来接替我的。最近几次重要的决策会议，我都没有被邀请参加，以前这些会议我都是必须出席的。`;

const ANSWERS = [
  "大概从三个月前开始，最开始是周一例会不再由我主持，领导让同事小王代替。之后核心客户项目被转交，预算审批被卡，这些都是过去两三个月陆续发生的，不是一次性的事。",
  "过去一个月，本该由我决定的项目预算审批被卡住了，但同组其他人的申请正常通过。我之前有20万以内的审批权，现在超过5万就需要上级再签。",
  "我原本负责的核心客户项目上个月被转交给另一个团队，领导说是优化资源配置。另外我手上两个长期跟进的客户，也从上个月开始换成别人对接了。",
  "最近几次重要的季度规划会议和项目评审会，我都没有收到邀请。以前这些会议我都是必须出席的，后来是从同事的闲聊中才知道开了这些会。",
  "新来的同事小李，领导安排他跟着我学习业务流程和客户关系。他已经开始独立接触我之前负责的客户了，而且领导在内部群里表扬了他。",
  "领导现在找我的频率明显减少了，以前每周至少单独沟通一到两次，现在基本上两三周才有一次。他现在遇到重要事情第一个找的人是小王。",
  "关于反向来看：上个月领导确实单独交给我一个紧急的跨部门协调任务，并在月度会上口头表扬了我的处理方式。但除此之外，目前没有其他正面信号。",
  "这些变化让我非常焦虑和不安，我觉得领导可能对我有意见，但又不确定。我开始怀疑是不是自己的能力出了问题，或者有人在背后说了什么。",
  `我尝试过找领导沟通，但他总是说\u201C没什么特别的，正常调整\u201D。我也问过同事，他们也不太清楚具体情况。我感觉自己被蒙在鼓里。`,
  "目前还没有明确的承接者完全接替我的工作，小李虽然在学习，但还没有正式接手。我的核心资源虽然被转移了一部分，但手里还有一些长期客户关系。关键会议确实没有叫我了，这个是确定的。",
];

const results = { quick: {}, deep: {}, comparison: {} };

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runMode(browser, mode, expectedRounds) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const screenshots = [];
  const logs = [];

  // Collect console logs
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[Interview]") || text.includes("[aiService]") || text.includes("[nextTurnFn]") || text.includes("[chooseNextQuestion]")) {
      logs.push(text);
    }
  });

  const pageLog = (msg) => console.log(`[${mode}] ${msg}`);
  const screenshot = async (name) => {
    const file = path.join(OUTPUT_DIR, `${mode}-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    screenshots.push(file);
    pageLog(`screenshot: ${file}`);
  };

  // 1. Navigate to home
  pageLog("Navigating to home...");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(500);

  // 2. Verify default scan mode
  const quickBtn = page.getByRole("button", { name: /快速扫描/ });
  const deepBtn = page.getByRole("button", { name: /深度扫描/ });
  const isQuickVisible = await quickBtn.isVisible().catch(() => false);
  const isDeepVisible = await deepBtn.isVisible().catch(() => false);
  pageLog(`Mode buttons visible: quick=${isQuickVisible} deep=${isDeepVisible}`);

  // 3. Select target mode
  if (mode === "quick") {
    await quickBtn.click();
    pageLog("Clicked quick mode button");
  } else {
    await deepBtn.click();
    pageLog("Clicked deep mode button");
  }
  await sleep(300);

  // 4. Verify CTA text
  const startBtn = page.getByRole("button", { name: mode === "quick" ? /快速 X 光扫描/ : /深度 X 光扫描/ });
  const ctaText = await startBtn.textContent();
  pageLog(`CTA text: "${ctaText}"`);
  results[mode].ctaText = ctaText;

  // 5. Enter test input
  const textarea = page.locator("textarea").first();
  await textarea.fill(TEST_INPUT);
  await sleep(300);

  // Verify char count
  const charCountText = await page.locator("text=\\/\\d+").first().textContent().catch(() => "");
  pageLog(`Char count display: "${charCountText}"`);

  await screenshot("01-home");

  // 6. Click start
  await startBtn.click();
  pageLog("Clicked start button");
  await sleep(1500);

  // 7. Verify interview page and round counter
  const roundLabel = await page.locator("text=/第 \\d+\\/\\d+ 轮/").first().textContent().catch(() => "");
  pageLog(`First round label: "${roundLabel}"`);
  results[mode].firstRoundLabel = roundLabel;
  await screenshot("02-interview-start");

  // 8. Answer questions
  const roundLabels = [roundLabel];
  for (let i = 0; i < expectedRounds; i++) {
    // Wait for submit button to be enabled (question loaded + answer typed)
    pageLog(`Round ${i + 1}: waiting for question to load...`);

    const submitBtn = page.getByRole("button", { name: /下一题/ });
    // Wait until button is enabled — means currentQ is set and not loading
    for (let wait = 0; wait < 40; wait++) {
      const disabled = await submitBtn.isDisabled().catch(() => true);
      if (!disabled) break;
      await sleep(500);
    }

    // Read question text
    const questionBox = page.locator(".rounded-lg.border-primary\\/30").first();
    const questionText = await questionBox.textContent().catch(() => "(could not read question)");
    pageLog(`Round ${i + 1} question: ${questionText.substring(0, 100)}...`);

    // Get round label
    const currentLabel = await page.locator("text=/第 \\d+\\/\\d+ 轮/").first().textContent().catch(() => "");
    pageLog(`Round ${i + 1} label: "${currentLabel}"`);

    // Type answer
    const answerTextarea = page.locator("textarea").last();
    await answerTextarea.waitFor({ state: "visible", timeout: 5000 });
    const answer = ANSWERS[i] || `这是第${i + 1}轮的回答，我描述一些具体的职场变化情况。`;
    await answerTextarea.fill(answer);
    await sleep(500);

    await screenshot(`03-round-${i + 1}-answered`);

    // Click submit
    await submitBtn.click();
    pageLog(`Round ${i + 1}: submitted answer`);

    // Wait for answer textarea to be cleared (confirms submit() ran)
    for (let wait = 0; wait < 20; wait++) {
      const val = await answerTextarea.inputValue().catch(() => "__ERROR__");
      if (val === "") break;
      await sleep(300);
    }

    // Check if we're done
    const doneVisible = await page.locator("text=/扫描已完成|信息已经足够/").isVisible().catch(() => false);
    if (doneVisible) {
      pageLog(`Round ${i + 1}: interview completed!`);
      break;
    }

    // Wait for next round label to change (confirms state updated)
    const oldLabel = currentLabel;
    for (let wait = 0; wait < 30; wait++) {
      const newLabel = await page.locator("text=/第 \\d+\\/\\d+ 轮/").first().textContent().catch(() => "");
      if (newLabel && newLabel !== oldLabel) break;
      await sleep(500);
    }

    const nextRoundLabel = await page.locator("text=/第 \\d+\\/\\d+ 轮/").first().textContent().catch(() => "");
    if (nextRoundLabel) {
      roundLabels.push(nextRoundLabel);
      pageLog(`Next round label: "${nextRoundLabel}"`);
    }
  }

  results[mode].roundLabels = roundLabels;

  // 9. Verify completion state
  await screenshot("04-interview-done");

  // Check the final round label
  const finalRoundLabel = await page.locator("text=/第 \\d+\\/\\d+ 轮/").first().textContent().catch(() => "");
  pageLog(`Final round label: "${finalRoundLabel}"`);
  results[mode].finalRoundLabel = finalRoundLabel;

  // Verify it didn't go past expectedRounds
  const match = finalRoundLabel?.match(/第 (\d+)\/(\d+) 轮/);
  if (match) {
    const current = parseInt(match[1]);
    const total = parseInt(match[2]);
    results[mode].finalRound = current;
    results[mode].totalRounds = total;
    results[mode].didNotExceed = current <= total;
    pageLog(`Final: ${current}/${total}, didNotExceed=${current <= total}`);
  }

  // Check for "开始扫描" button (should appear when done)
  const scanBtn = page.getByRole("button", { name: /开始扫描/ });
  const scanBtnVisible = await scanBtn.isVisible().catch(() => false);
  results[mode].scanButtonVisible = scanBtnVisible;
  pageLog(`Scan button visible: ${scanBtnVisible}`);

  // 10. Click "开始扫描" to generate report
  if (scanBtnVisible) {
    await scanBtn.click();
    pageLog("Clicked start scan button");
    // Wait for scanning animation (6 steps × 650ms + 600ms = ~4.5s) + report generation
    for (let wait = 0; wait < 60; wait++) {
      await sleep(500);
      const reportTitle = await page.locator("text=你的 AI 职场 X 光报告").isVisible().catch(() => false);
      const errorVisible = await page.locator("text=报告生成失败").isVisible().catch(() => false);
      if (reportTitle || errorVisible) break;
    }
  }

  // 11. Verify report is shown
  const reportTitle = await page.locator("text=你的 AI 职场 X 光报告").isVisible().catch(() => false);
  results[mode].reportVisible = reportTitle;
  pageLog(`Report visible: ${reportTitle}`);

  if (reportTitle) {
    await screenshot("05-report");

    // Extract report data using Playwright locators (not DOM querySelector)
    const headlineEl = page.locator("p.text-lg").first();
    const headline = await headlineEl.textContent().catch(() => null);

    const scoreEl = page.locator(".text-5xl").first();
    const score = await scoreEl.textContent().catch(() => null);

    const levelEl = page.locator(".text-lg.font-medium").first();
    const level = await levelEl.textContent().catch(() => null);

    // Top signals
    const topSignals = await page.locator("ol.grid.gap-3.sm\\:grid-cols-3 li").allTextContents().catch(() => []);

    // Check for deep-only sections using Playwright text locators
    const hasEvidenceChain = await page.locator("text=/证据链/").isVisible().catch(() => false);
    const hasReverseEvidence = await page.locator("text=/反向证据/").isVisible().catch(() => false);
    const hasInfoGap = await page.locator("text=/信息缺口/").isVisible().catch(() => false);
    const hasActions = await page.locator("text=/接下来怎么做/").isVisible().catch(() => false);

    const reportData = {
      headline: headline?.trim(),
      score: score?.trim(),
      level: level?.trim(),
      topSignals: topSignals.map((s) => s.trim()),
      deepSections: { evidenceChain: hasEvidenceChain, reverseEvidence: hasReverseEvidence, infoGap: hasInfoGap, actions: hasActions },
    };

    results[mode].report = reportData;
    results[mode].deepSections = reportData.deepSections;
    pageLog(`Report data: ${JSON.stringify(reportData).substring(0, 300)}...`);
    pageLog(`Deep sections: ${JSON.stringify(results[mode].deepSections)}`);
  }

  results[mode].logs = logs;
  results[mode].screenshots = screenshots;

  await page.close();
  return results[mode];
}

async function main() {
  console.log("=== RC Round Verification ===\n");

  const browser = await chromium.launch({ headless: true });

  try {
    // Test 1: Quick mode (5 rounds)
    console.log("\n--- Test 1: Quick Mode (5 rounds) ---\n");
    results.quick = await runMode(browser, "quick", 5);

    // Test 2: Deep mode (10 rounds)
    console.log("\n--- Test 2: Deep Mode (10 rounds) ---\n");
    results.deep = await runMode(browser, "deep", 10);

    // Comparison
    console.log("\n--- Comparison ---\n");
    const q = results.quick;
    const d = results.deep;

    results.comparison = {
      ctaText: {
        quick: q.ctaText,
        deep: d.ctaText,
        quickCorrect: q.ctaText?.includes("快速"),
        deepCorrect: d.ctaText?.includes("深度"),
      },
      rounds: {
        quickMax: q.totalRounds,
        deepMax: d.totalRounds,
        quickDidNotExceed: q.didNotExceed,
        deepDidNotExceed: d.didNotExceed,
        quickExceedsSix: q.finalRound > 5,
        deepExceedsTen: d.finalRound > 10,
      },
      roundLabels: {
        quick: q.roundLabels,
        deep: d.roundLabels,
      },
      report: {
        quickVisible: q.reportVisible,
        deepVisible: d.reportVisible,
        quickHeadline: q.report?.headline,
        deepHeadline: d.report?.headline,
        quickScore: q.report?.score,
        deepScore: d.report?.score,
        quickTopSignals: q.report?.topSignals,
        deepTopSignals: d.report?.topSignals,
        quickDeepSections: q.deepSections,
        deepDeepSections: d.deepSections,
      },
    };

    // Verify: quick should NOT have deep-only sections, deep SHOULD have them
    if (q.deepSections) {
      results.comparison.report.quickHasDeepSections =
        q.deepSections.evidenceChain || q.deepSections.reverseEvidence || q.deepSections.infoGap;
    }
    if (d.deepSections) {
      results.comparison.report.deepHasDeepSections =
        d.deepSections.evidenceChain || d.deepSections.reverseEvidence || d.deepSections.infoGap;
    }

    // Self-consistency checks
    const consistency = {
      quick: checkConsistency(q.report, q.report?.headline),
      deep: checkConsistency(d.report, d.report?.headline),
    };
    results.comparison.consistency = consistency;

  } finally {
    await browser.close();
  }

  // Write results
  const reportPath = path.join(OUTPUT_DIR, "results.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nResults written to: ${reportPath}`);

  // Print summary
  console.log("\n=== SUMMARY ===\n");
  console.log("Quick Mode:");
  console.log(`  CTA: "${results.quick.ctaText}" (correct: ${results.comparison.ctaText?.quickCorrect})`);
  console.log(`  Rounds: ${results.quick.roundLabels?.join(" → ")}`);
  console.log(`  Final: ${results.quick.finalRound}/${results.quick.totalRounds} (didNotExceed: ${results.quick.didNotExceed})`);
  console.log(`  Report: visible=${results.quick.reportVisible}`);
  console.log(`  Deep sections: ${JSON.stringify(results.quick.deepSections)}`);

  console.log("\nDeep Mode:");
  console.log(`  CTA: "${results.deep.ctaText}" (correct: ${results.comparison.ctaText?.deepCorrect})`);
  console.log(`  Rounds: ${results.deep.roundLabels?.join(" → ")}`);
  console.log(`  Final: ${results.deep.finalRound}/${results.deep.totalRounds} (didNotExceed: ${results.deep.didNotExceed})`);
  console.log(`  Report: visible=${results.deep.reportVisible}`);
  console.log(`  Deep sections: ${JSON.stringify(results.deep.deepSections)}`);

  console.log("\nComparison:");
  console.log(`  Quick has deep sections: ${results.comparison.report.quickHasDeepSections}`);
  console.log(`  Deep has deep sections: ${results.comparison.report.deepHasDeepSections}`);
  console.log(`  Consistency (quick): ${JSON.stringify(results.comparison.consistency.quick)}`);
  console.log(`  Consistency (deep): ${JSON.stringify(results.comparison.consistency.deep)}`);

  // Exit code
  const pass = results.quick.didNotExceed && results.deep.didNotExceed &&
    results.quick.reportVisible && results.deep.reportVisible &&
    results.comparison.ctaText.quickCorrect && results.comparison.ctaText.deepCorrect &&
    !results.comparison.report.quickHasDeepSections && results.comparison.report.deepHasDeepSections;
  process.exit(pass ? 0 : 1);
}

function checkConsistency(report, headline) {
  if (!report) return { error: "No report data" };
  const issues = [];

  // Check headline exists
  if (!report.headline) issues.push("Missing headline");

  // Check score is 0-100
  const score = parseInt(report.score);
  if (isNaN(score) || score < 0 || score > 100) issues.push(`Invalid score: ${report.score}`);

  // Check topSignals exist
  if (!report.topSignals || report.topSignals.length === 0) issues.push("No topSignals");

  // Check level matches score
  const level = report.level;
  const expectedLevel = score <= 20 ? "正常状态" : score <= 40 ? "轻度变化" : score <= 60 ? "值得关注" : score <= 80 ? "变化明显" : "变化显著";
  if (level !== expectedLevel) issues.push(`Level mismatch: score=${score} level="${level}" expected="${expectedLevel}"`);

  return {
    passed: issues.length === 0,
    issues,
    headline: report.headline,
    score: report.score,
    level: report.level,
    topSignalsCount: report.topSignals?.length ?? 0,
  };
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
