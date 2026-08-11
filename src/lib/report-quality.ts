import type { Report } from "@/lib/ai/types";
import {
  cleanCopy,
  cleanList,
  dynamicObserveSignals,
  friendlyLevel,
  headlineFor,
} from "@/lib/report-presenter";

export type ReportQualityGateId =
  | "score-level-consistency"
  | "evidence-separation"
  | "actionability"
  | "boundary-language"
  | "share-minimization";

export type ReportQualityGate = {
  id: ReportQualityGateId;
  label: string;
  passed: boolean;
  detail: string;
};

export type ReportQualitySnapshot = {
  status: "pass" | "needs_review";
  score: number;
  gates: ReportQualityGate[];
};

export type ShareReportPayload = {
  headline: string;
  total_score: number;
  total_level: string;
  main_issue_type: string;
  dimensions: Array<{
    key: string;
    score: number;
    level: string;
    explain: string;
  }>;
  top_signals: string[];
  known_facts: string[];
  misjudgment: string;
  created_at: string;
};

const ASSERTIVE_BOUNDARY_PATTERNS =
  /一定|必然|肯定|绝对|证明|真实意图|应该立刻|必须马上|可以去仲裁|焦虑症|诊断/;

export function reportQualitySnapshot(report: Report): ReportQualitySnapshot {
  const knownFacts = cleanList(report.knownFacts);
  const inferences = cleanList(report.inferences);
  const assumptions = cleanList(report.openAssumptions);
  const actions = [
    ...cleanList(report.actions.in72h),
    ...cleanList(report.actions.in7d),
    ...cleanList(report.actions.in30d),
  ];
  const sharePayload = buildShareReportPayload(report, new Date(0).toISOString());

  const gates: ReportQualityGate[] = [
    {
      id: "score-level-consistency",
      label: "评分与等级一致",
      passed: friendlyLevel(report.totalLevel) === scoreToLevel(report.totalScore),
      detail: "综合评分必须映射到同一套五级风险名称，避免报告页、历史页和分享页口径不一致。",
    },
    {
      id: "evidence-separation",
      label: "事实/推断/假设分离",
      passed: knownFacts.length > 0 && inferences.length > 0 && assumptions.length > 0,
      detail: "V1 报告必须保留三类信息的边界，不能把 AI 推断与未验证假设混在同一个结论里。",
    },
    {
      id: "actionability",
      label: "行动建议可执行",
      passed: actions.length >= 6 && dynamicObserveSignals(report).length >= 3,
      detail: "报告至少需要覆盖短期、近期、中期行动，并给出未来 30 天观察信号。",
    },
    {
      id: "boundary-language",
      label: "边界文案克制",
      passed: !ASSERTIVE_BOUNDARY_PATTERNS.test(cleanCopy(report.headline)),
      detail: "一句话结论不得提供法律、心理、职业决定或他人真实意图判断。",
    },
    {
      id: "share-minimization",
      label: "分享字段最小化",
      passed: !("inferences" in sharePayload) && !("openAssumptions" in sharePayload) && !("actions" in sharePayload),
      detail: "分享页只暴露摘要字段，不返回完整 report_data、原始问诊或内部推断列表。",
    },
  ];

  const failed = gates.filter((gate) => !gate.passed).length;

  return {
    status: failed === 0 ? "pass" : "needs_review",
    score: Math.max(0, 100 - failed * 12),
    gates,
  };
}

export function buildReportShareText(report: Report): string {
  const lines: string[] = [];
  const top3 = cleanList(report.topSignals).slice(0, 3);
  const observe = dynamicObserveSignals(report);

  lines.push("AI 职场 X 光报告");
  lines.push("");
  lines.push(`一句话结论：${headlineFor(report)}`);
  lines.push(`风险等级：${friendlyLevel(report.totalLevel)}`);
  lines.push(`综合评分：${clampScore(report.totalScore)}/100`);
  lines.push("");
  lines.push("前三个关键信号：");
  top3.forEach((signal, index) => lines.push(`  ${index + 1}. ${signal}`));
  lines.push("");
  lines.push("未来 30 天建议观察：");
  observe.forEach((signal, index) => lines.push(`  ${index + 1}. ${signal}`));

  return lines.join("\n");
}

export function buildShareReportPayload(
  report: Report,
  createdAt: string,
  mainIssueType: string = report.mainIssue?.type ?? "unclear",
): ShareReportPayload {
  return {
    headline: headlineFor(report),
    total_score: clampScore(report.totalScore),
    total_level: friendlyLevel(report.totalLevel),
    main_issue_type: mainIssueType,
    dimensions: report.dimensions.map((dimension) => ({
      key: dimension.key,
      score: clampScore(dimension.score),
      level: friendlyLevel(dimension.level),
      explain: cleanCopy(dimension.explain),
    })),
    top_signals: cleanList(report.topSignals).slice(0, 3),
    known_facts: cleanList(report.knownFacts).slice(0, 5),
    misjudgment: cleanCopy(report.misjudgment),
    created_at: createdAt,
  };
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function scoreToLevel(total: number): string {
  const score = clampScore(total);
  if (score <= 20) return "正常状态";
  if (score <= 40) return "轻度变化";
  if (score <= 60) return "值得关注";
  if (score <= 80) return "变化明显";
  return "变化显著";
}
