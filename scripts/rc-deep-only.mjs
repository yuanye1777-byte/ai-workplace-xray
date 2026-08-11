import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3000";
const OUTPUT_DIR = path.join(import.meta.dirname, "rc-rounds-output");
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const TEST_INPUT = `最近三个月，我明显感觉到部门里的氛围变了。以前每周一的例会都是我主持的，现在领导突然让另一个同事代替我主持。我负责跟进两年多的核心客户项目，上个月被通知转交给另一个团队对接，理由是优化资源配置。我之前申请的预算审批也被卡住了，而同组其他人的申请都正常通过。部门新来了一个年轻同事，领导让他跟着我学习业务流程，但我感觉他更像是来接替我的。最近几次重要的决策会议，我都没有被邀请参加，以前这些会议我都是必须出席的。`;

const ANSWERS = [
  "大概从三个月前开始，最开始是周一例会不再由我主持，领导让同事小王代替。之后核心客户项目被转交，预算审批被卡，这些都是过去两三个月陆续发生的，不是一次性的事。",
  "过去一个月，本该由我决定的项目预算审批被卡住了，但同组其他人的申请正常通过。我之前有20万以内的审批权，现在超过5万就需要上级再签。",
  "我原本负责的核心客户项目上个月被转交给另一个团队，领导说是优化资源配置。另外我手上两个长期跟进的客户，也从上个月开始换成别人对接了。",
  "最近几次重要的季度规划会议和项目评审会，我都没有收到邀请。以前这些会议我都是必须出席的，后来是从同事的闲聊中才知道开了这些会。",
  "新来的同事小李，领导安排他跟着我学习业务流程和客户关系。他已经开始独立接触我之前负责的客户了，而且领导在内部群里表扬了他。",
  "领导现在找我的频率明显减少了，以前每周至少单独沟通一到两次，现在基本上两三周才有一次。他现在遇到重要事情第一个找的人是小王。",
  "关于反向来看：上个月领导确实单独交给我一个紧急的跨部门协调任务，并在月度会上口头表扬了我的处理方式。但除此之外，目前没有其他正面信号。",
  "这些变化让我非常焦虑和不安，我觉得领导可能对我有意见，但又不确定。我开始怀疑是不是自己的能力出了问题，或者有人在背后说了什么。",
  "我尝试过找领导沟通，但他总是说没什么特别的，就是正常调整。我也问过同事，他们也不太清楚具体情况。我感觉自己被蒙在鼓里。",
  "目前还没有明确的承接者完全接替我的工作，小李虽然在学习，但还没有正式接手。我的核心资源虽然被转移了一部分，但手里还有一些长期客户关系。关键会议确实没有叫我了，这个是确定的。",
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  console.log("=== Deep Mode Only Test ===\n");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  const logs = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[Interview]") || text.includes("[aiService]") || text.includes("[nextTurnFn]")) {
      logs.push(text);
      console.log(`  [console] ${text}`);
    }
  });

  const screenshot = async (name) => {
    const file = path.join(OUTPUT_DIR, `deep-${name}.png`);
    await page.screenshot({ path: file, fullPage: false });
    console.log(`  screenshot: ${file}`);
  };

  // Navigate
  console.log("Navigating to home...");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await sleep(500);

  // Select deep mode
  await page.getByRole("button", { name: /深度扫描/ }).click();
  console.log("Clicked deep mode");
  await sleep(500);

  // Verify CTA
  const startBtn = page.getByRole("button", { name: /深度 X 光扫描/ });
  const ctaText = await startBtn.textContent();
  console.log(`CTA: "${ctaText}"`);

  // Enter input and trigger React input event
  const textarea = page.locator("textarea").first();
  await textarea.fill(TEST_INPUT);
  await textarea.evaluate((el) => {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await sleep(500);

  // Wait for start button to be enabled (char count validation)
  for (let w = 0; w < 40; w++) {
    const disabled = await startBtn.isDisabled().catch(() => true);
    if (!disabled) break;
    await sleep(250);
  }

  await screenshot("01-home");

  // Start
  await startBtn.click();
  console.log("Started interview");
  await sleep(1000);

  // Answer 10 questions
  const roundLabels = [];
  for (let i = 0; i < 10; i++) {
    console.log(`\n--- Round ${i + 1} ---`);

    // Wait for submit button to be enabled
    const submitBtn = page.getByRole("button", { name: /下一题/ });
    for (let w = 0; w < 60; w++) {
      const disabled = await submitBtn.isDisabled().catch(() => true);
      if (!disabled) break;
      await sleep(500);
    }

    // Read question and label
    const questionBox = page.locator(".rounded-lg.border-primary\\/30").first();
    const questionText = await questionBox.textContent().catch(() => "?");
    const label = await page.locator("text=/第 \\d+\\/\\d+ 轮/").first().textContent().catch(() => "?");
    console.log(`  Label: ${label}`);
    console.log(`  Q: ${questionText.substring(0, 80)}...`);
    roundLabels.push(label);

    // Type answer
    await page.locator("textarea").last().fill(ANSWERS[i] || `回答${i + 1}`);
    await sleep(300);
    await screenshot(`03-round-${i + 1}`);

    // Submit
    await submitBtn.click();
    console.log("  Submitted");

    // Wait for textarea to clear
    for (let w = 0; w < 20; w++) {
      const val = await page.locator("textarea").last().inputValue().catch(() => "x");
      if (val === "") break;
      await sleep(300);
    }

    // Check if done
    const doneVisible = await page.locator("text=/扫描已完成|信息已经足够/").isVisible().catch(() => false);
    if (doneVisible) {
      console.log("  Interview completed!");
      break;
    }

    // Wait for label to change
    for (let w = 0; w < 40; w++) {
      const newLabel = await page.locator("text=/第 \\d+\\/\\d+ 轮/").first().textContent().catch(() => "");
      if (newLabel && newLabel !== label) break;
      await sleep(500);
    }
  }

  // Final state
  await screenshot("04-done");
  const finalLabel = await page.locator("text=/第 \\d+\\/\\d+ 轮/").first().textContent().catch(() => "?");
  console.log(`\nFinal label: ${finalLabel}`);

  const scanBtn = page.getByRole("button", { name: /开始扫描/ });
  const scanVisible = await scanBtn.isVisible().catch(() => false);
  console.log(`Scan button: ${scanVisible}`);

  if (scanVisible) {
    await scanBtn.click();
    console.log("Clicked scan button");
    for (let w = 0; w < 60; w++) {
      await sleep(500);
      const reportVisible = await page.locator("text=你的 AI 职场 X 光报告").isVisible().catch(() => false);
      const errorVisible = await page.locator("text=报告生成失败").isVisible().catch(() => false);
      if (reportVisible || errorVisible) break;
    }
  }

  const reportVisible = await page.locator("text=你的 AI 职场 X 光报告").isVisible().catch(() => false);
  console.log(`Report visible: ${reportVisible}`);

  if (reportVisible) {
    await screenshot("05-report");

    const headline = await page.locator("p.text-lg").first().textContent().catch(() => "?");
    const score = await page.locator(".text-5xl").first().textContent().catch(() => "?");
    const level = await page.locator(".text-lg.font-medium").first().textContent().catch(() => "?");
    const topSignals = await page.locator("ol.grid.gap-3.sm\\:grid-cols-3 li").allTextContents().catch(() => []);
    const hasEvidenceChain = await page.locator("text=/证据链/").isVisible().catch(() => false);
    const hasReverseEvidence = await page.locator("text=/反向证据/").isVisible().catch(() => false);
    const hasInfoGap = await page.locator("text=/信息缺口/").isVisible().catch(() => false);
    const hasActions = await page.locator("text=/接下来怎么做/").isVisible().catch(() => false);

    console.log("\n=== Deep Report Data ===");
    console.log(`Headline: ${headline?.trim()}`);
    console.log(`Score: ${score?.trim()}`);
    console.log(`Level: ${level?.trim()}`);
    console.log(`Top signals: ${JSON.stringify(topSignals.map((s) => s.trim()))}`);
    console.log(`Deep sections: evidenceChain=${hasEvidenceChain} reverseEvidence=${hasReverseEvidence} infoGap=${hasInfoGap} actions=${hasActions}`);
  }

  // Save results
  const results = {
    ctaText,
    roundLabels,
    finalLabel,
    scanVisible,
    reportVisible,
    logs,
  };
  fs.writeFileSync(path.join(OUTPUT_DIR, "deep-results.json"), JSON.stringify(results, null, 2));

  await browser.close();

  // Summary
  console.log("\n=== SUMMARY ===");
  console.log(`Rounds: ${roundLabels.join(" → ")}`);
  const match = finalLabel?.match(/第 (\d+)\/(\d+) 轮/);
  if (match) {
    console.log(`Final: ${match[1]}/${match[2]} (exceeded: ${parseInt(match[1]) > parseInt(match[2])})`);
  }
  console.log(`Report: ${reportVisible ? "PASS" : "FAIL"}`);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(2);
});
