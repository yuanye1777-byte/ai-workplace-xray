import { generateReport } from "../src/lib/ai/report";
import type { QAItem } from "../src/lib/ai/types";
import {
  buildReportShareText,
  buildShareReportPayload,
  reportQualitySnapshot,
} from "../src/lib/report-quality";

const history: QAItem[] = [
  {
    question: "最近最具体的一件事是什么？",
    answer: "上周三的年度项目会没有通知我参加，原本由我负责的大客户也改由同事直接对接。",
    targetDimension: "resource",
    classified: {
      facts: ["上周三的年度项目会没有通知我参加", "原本由我负责的大客户改由同事直接对接"],
      emotions: [],
      judgments: [],
      inferences: [],
      dimensions: ["resource", "info"],
      reverseEvidence: [],
    },
  },
  {
    question: "这类变化持续多久了？",
    answer: "大概一个多月，连续三次关键会议我都不是第一通知对象。",
    targetDimension: "trend",
    classified: {
      facts: ["连续三次关键会议我都不是第一通知对象"],
      emotions: [],
      judgments: [],
      inferences: [],
      dimensions: ["info"],
      reverseEvidence: [],
    },
  },
  {
    question: "有没有相反的信号？",
    answer: "有，领导这周仍然让我单独负责一个小项目，但预算和关键客户不在我这里。",
    targetDimension: "reverse",
    classified: {
      facts: ["领导这周仍然让我单独负责一个小项目"],
      emotions: [],
      judgments: [],
      inferences: [],
      dimensions: ["power"],
      reverseEvidence: ["领导这周仍然让我单独负责一个小项目"],
    },
  },
  {
    question: "你最担心的判断是什么？",
    answer: "我担心领导可能在找人替代我，但我还不能确认他的真实想法。",
    targetDimension: "replace",
    classified: {
      facts: [],
      emotions: ["我担心"],
      judgments: [],
      inferences: ["领导可能在找人替代我", "我还不能确认他的真实想法"],
      dimensions: ["replace"],
      reverseEvidence: [],
    },
  },
];

const report = generateReport("我感觉最近职场位置有变化，想判断是不是被边缘化。", history);
const quality = reportQualitySnapshot(report);
const shareText = buildReportShareText(report);
const sharePayload = buildShareReportPayload(report, "2026-08-11T00:00:00.000Z");

if (quality.status !== "pass") {
  throw new Error(`quality gate failed: ${JSON.stringify(quality.gates.filter((gate) => !gate.passed))}`);
}

if (/report_data|raw_turns|inferences|openAssumptions|actions|dontDo|shouldDo/.test(JSON.stringify(sharePayload))) {
  throw new Error("share payload exposes internal report fields");
}

if (!/一句话结论|风险等级|综合评分|未来 30 天/.test(shareText)) {
  throw new Error("share text is missing required public summary sections");
}

console.log("V1 report quality smoke: PASS");
