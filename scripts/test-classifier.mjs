// Quick classifier regression test — run with: node scripts/test-classifier.mjs
// Tests P0-2: speculative words should NOT be classified as facts

const { classifyText } = await import("../src/lib/ai/classifier.ts");

const TESTS = [
  {
    name: "觉得 → 推测",
    input: "我觉得他不太对劲。",
    expectFacts: 0,
    expectInferences: 1,
  },
  {
    name: "好像 → 推测",
    input: "好像有点不对。",
    expectFacts: 0,
    expectInferences: 1,
  },
  {
    name: "听说 → 推测",
    input: "听说领导要换人。",
    expectFacts: 0,
    expectInferences: 1,
  },
  {
    name: "看来 → 推测",
    input: "看来他不想用我了。",
    expectFacts: 0,
    expectInferences: 1,
  },
  {
    name: "应该是 → 推测(推断模式)",
    input: "应该是想让我走。",
    expectFacts: 0,
    expectInferences: 1,
  },
  {
    name: "估计 → 推测",
    input: "估计领导对我有意见。",
    expectFacts: 0,
    expectInferences: 1,
  },
  {
    name: "似乎 → 推测",
    input: "似乎在针对我。",
    expectFacts: 0,
    // "似乎" matches SPECULATION, "针对我" matches JUDGMENT
    expectInferences: 1,
    expectJudgments: 1,
  },
  {
    name: "不能确认 → 推测",
    input: "我不能确认领导真实意图。",
    expectFacts: 0,
    expectInferences: 1,
  },
  {
    name: "条件句 → 推测",
    input: "如果接下来他把我的核心客户接过去，我可能会被边缘化。",
    expectFacts: 0,
    expectInferences: 2, // two clauses both match conditional/speculation
  },
  {
    name: "未来句 → 推测",
    input: "未来三个月我会持续观察。",
    expectFacts: 0,
    expectInferences: 1,
  },
  {
    name: "事实：行为+时间",
    input: "上周会议领导没有通知我参加。",
    expectFacts: 1,
    expectInferences: 0,
  },
  {
    name: "事实：具体行为",
    input: "领导把大客户方案交给了另一个同事做。",
    expectFacts: 1,
    expectInferences: 0,
  },
  {
    name: "事实：资源转交",
    input: "最近两个月，原本我负责的三个大客户，两个已经转给新同事对接。",
    expectFacts: 1,
    expectInferences: 0,
  },
  {
    name: "情绪 → 情绪",
    input: "我很难受，晚上都睡不好。",
    expectFacts: 0,
    expectEmotions: 1, // single sentence with "难受"
  },
];

let pass = 0;
let fail = 0;
const failures = [];

for (const t of TESTS) {
  const result = classifyText(t.input);
  const factsOk = t.expectFacts === undefined || result.facts.length === t.expectFacts;
  const inferencesOk = t.expectInferences === undefined || result.inferences.length >= t.expectInferences;
  const judgmentsOk = t.expectJudgments === undefined || result.judgments.length >= t.expectJudgments;
  const emotionsOk = t.expectEmotions === undefined || result.emotions.length >= t.expectEmotions;

  if (factsOk && inferencesOk && judgmentsOk && emotionsOk) {
    pass++;
    console.log(`  ✓ ${t.name}`);
  } else {
    fail++;
    const issues = [];
    if (!factsOk) issues.push(`facts: ${result.facts.length} (want ${t.expectFacts})`);
    if (!inferencesOk) issues.push(`inferences: ${result.inferences.length} (want >=${t.expectInferences})`);
    if (!judgmentsOk) issues.push(`judgments: ${result.judgments.length} (want >=${t.expectJudgments})`);
    if (!emotionsOk) issues.push(`emotions: ${result.emotions.length} (want >=${t.expectEmotions})`);
    failures.push({ name: t.name, issues, result });
    console.log(`  ✗ ${t.name} — ${issues.join(", ")}`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);

if (failures.length > 0) {
  console.log("\nFailures:");
  for (const f of failures) {
    console.log(`  ${f.name}:`);
    console.log(`    issues: ${f.issues.join(", ")}`);
    console.log(`    facts: [${f.result.facts.map(s => `"${s}"`).join(", ")}]`);
    console.log(`    inferences: [${f.result.inferences.map(s => `"${s}"`).join(", ")}]`);
    console.log(`    judgments: [${f.result.judgments.map(s => `"${s}"`).join(", ")}]`);
    console.log(`    emotions: [${f.result.emotions.map(s => `"${s}"`).join(", ")}]`);
  }
}

process.exit(fail > 0 ? 1 : 0);
