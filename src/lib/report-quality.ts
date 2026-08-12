import type { Dimension, DimensionScore, QAItem, Report, ScanMode } from "@/lib/ai/types";
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
  | "dimension-ceiling"
  | "specific-dimension-explain"
  | "quick-escalation"
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
const QUICK_FORBIDDEN_HEADLINE = /了解其他选择|评估后续方向|启动\s*Plan\s*B/i;
const TEMPLATE_EXPLAIN =
  /变化较多，建议重点关注并持续观察|可能意味着该维度上你正经历变化|暂未看到强支撑事实|有风险信号，但当前报告缺少可直接引用的事实/;
const QUICK_FORBIDDEN_ACTIONS = /了解外部机会|外部机会|内部转岗|调整团队|启动\s*Plan\s*B/i;
const QUICK_OBSERVATION_HEADLINE =
  "建议先稳住现有职责，并围绕资源流向、会议角色、信息触达建立 30 天观察线。";
const QUICK_MITIGATION =
  /没有正式交接通知|没有.*正式.*交接|没有完全替代|没有.*完全.*接替|仍被单独交付任务|仍然.*单独.*任务|没有公开负面评价|没有.*公开.*负面|权限没有变化|仍然.*负责|依然.*正常|没有明确.*承接者.*完全|没有.*替代者.*全面/;
const STRONG_EVIDENCE =
  /已.*正式交接|收到.*正式交接|正式转交|权限.*(取消|收回|关闭|停用|无法访问)|明确替代者.*(全面|完全).*接手|明确.*全面接手|持续排除.*关键会议|(连续|持续|多次|最近几次).*(关键|重要).*(会议).*(未|没|不).*(邀请|通知|参加)/;
const NEGATED_STRONG_EVIDENCE =
  /没有.*正式.*交接|没有.*正式.*转交|没有.*权限.*(取消|收回|关闭|停用)|权限没有变化|没有.*明确替代者.*(全面|完全).*接手|没有.*持续排除.*关键会议/;
const QUICK_CAPS_WITH_MITIGATION: Record<Dimension, number> = {
  power: 55,
  resource: 85,
  info: 80,
  relation: 65,
  replace: 65,
};

const DIMENSION_COPY: Record<Dimension, { label: string; subject: string }> = {
  power: { label: "决策参与", subject: "拍板权、会议角色和预算审批" },
  resource: { label: "核心资源", subject: "客户、项目、预算或权限流向" },
  info: { label: "信息透明度", subject: "关键会议通知、会前信息和决策同步" },
  relation: { label: "关键关系", subject: "直属上级的一对一沟通和公开反馈" },
  replace: { label: "发展空间", subject: "替代者接手范围和成长机会变化" },
};

const QUICK_ACTIONS: Report["actions"] = {
  in72h: [
    "整理最近 30 天的事实时间线，只记录会议、任务、资源和信息触达的具体变化。",
    "确认你当前仍负责的职责、客户、项目和权限边界，先稳住正在交付的工作。",
    "列出接下来两周必须参加或需要同步的关键会议，提前争取明确角色。",
  ],
  in7d: [
    "发起一次低冲突沟通，围绕业务目标、职责边界和近期优先级确认，不讨论猜测和情绪。",
    "在一个关键会议或项目节点中主动承担可见任务，让自己的贡献重新被看见。",
    "持续观察资源流向、会议角色和信息触达是否继续变化，并把新事实补进记录。",
  ],
  in30d: [
    "每周复盘一次观察线：资源是否继续转移、关键会议是否恢复、任务交付是否仍由你负责。",
    "如果信号没有继续恶化，优先保持稳定交付和低冲突沟通。",
    "如果信号继续扩大，再基于新增事实重新做一次深度扫描。",
  ],
};

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
      passed: !ASSERTIVE_BOUNDARY_PATTERNS.test(cleanCopy(report.headline)) && !QUICK_FORBIDDEN_HEADLINE.test(cleanCopy(report.headline)),
      detail: "一句话结论不得提供法律、心理、职业决定、他人真实意图判断或过早 Plan B 建议。",
    },
    {
      id: "dimension-ceiling",
      label: "维度分数上限",
      passed: report.dimensions.every((dimension) => dimension.score < 100 || hasStrongEvidence(report)),
      detail: "任一维度不得到 100，除非存在正式交接、权限取消、明确替代者全面接手或持续排除关键会议等强证据。",
    },
    {
      id: "specific-dimension-explain",
      label: "维度解释具体",
      passed: !TEMPLATE_EXPLAIN.test(reportText(report)),
      detail: "维度解释不得使用通用模板句，必须说明该维度对应的具体信号和反向证据。",
    },
    {
      id: "quick-escalation",
      label: "quick 不过度升级",
      passed: !QUICK_FORBIDDEN_HEADLINE.test(cleanCopy(report.headline)),
      detail: "quick 顶部结论不得出现了解其他选择、评估后续方向或启动 Plan B。",
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

export function normalizeReportForMode(
  report: Report,
  scanMode: ScanMode = "deep",
  history: QAItem[] = [],
): Report {
  const hasQuickMitigation = scanMode === "quick" && hasMitigatingEvidence(report, history);
  const strongEvidence = hasStrongEvidence(report, history);
  const dimensions = report.dimensions.map((dimension) =>
    normalizeDimension(dimension, {
      scanMode,
      hasQuickMitigation,
      strongEvidence,
    }),
  );
  const totalScore = clampTotalScore(weightedTotal(dimensions), hasQuickMitigation);
  const headline = hasQuickMitigation
    ? QUICK_OBSERVATION_HEADLINE
    : sanitizeHeadline(report.headline, totalScore);
  const trend = normalizeTrend(report.trend, history);
  const actions = normalizeActions(report.actions, scanMode, totalScore, strongEvidence, hasQuickMitigation);

  return {
    ...report,
    headline,
    totalScore,
    totalLevel: scoreToLevel(totalScore),
    dimensions,
    trend,
    explanations: cleanList(report.explanations).map(rewriteTemplateCopy).slice(0, 3),
    inferences: cleanList(report.inferences).map(rewriteTemplateCopy),
    topSignals: cleanList(report.topSignals).map(rewriteTemplateCopy).slice(0, 3),
    shouldDo: normalizeRecommendationList(report.shouldDo, scanMode, "shouldDo"),
    dontDo: normalizeRecommendationList(report.dontDo, scanMode, "dontDo"),
    actions,
  };
}

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeDimension(
  dimension: DimensionScore,
  context: { scanMode: ScanMode; hasQuickMitigation: boolean; strongEvidence: boolean },
): DimensionScore {
  const baseScore = clampScore(dimension.score);
  const quickCap = context.hasQuickMitigation ? QUICK_CAPS_WITH_MITIGATION[dimension.key] : 100;
  const strongCap = context.strongEvidence ? 100 : 95;
  const quickFloor = context.scanMode === "quick" && dimension.key === "replace" && !context.strongEvidence ? 45 : 0;
  const score = Math.max(quickFloor, Math.min(baseScore, quickCap, strongCap));

  return {
    ...dimension,
    score,
    level: scoreToLevel(score),
    explain: buildSpecificExplain({
      ...dimension,
      score,
      level: scoreToLevel(score),
    }),
  };
}

function buildSpecificExplain(dimension: DimensionScore): string {
  const meta = DIMENSION_COPY[dimension.key];
  const support = cleanList(dimension.supportingFacts)[0];
  const reverse = cleanList(dimension.reverseFacts)[0];

  if (support && reverse) {
    return `${meta.label}维度的主要信号来自「${support}」，但「${reverse}」降低了该维度的确定性。`;
  }

  if (support) {
    return `${meta.label}维度的分数主要来自「${support}」，需要继续看${meta.subject}是否持续变化。`;
  }

  if (reverse) {
    return `${meta.label}维度目前该维度信息不足，因此只做低权重处理；同时「${reverse}」提示局势尚未定型。`;
  }

  if (dimension.score <= 40) {
    return `${meta.label}维度目前缺少明确的可观察事实，暂按低到中等风险处理。`;
  }

  return `${meta.label}维度目前该维度信息不足，因此只做低权重处理；后续请补充${meta.subject}的具体事件。`;
}

function clampTotalScore(score: number, hasQuickMitigation: boolean): number {
  if (hasQuickMitigation) return Math.min(68, Math.max(55, score));
  return clampScore(score);
}

function weightedTotal(dimensions: DimensionScore[]): number {
  const weights: Record<Dimension, number> = {
    power: 1.2,
    resource: 1.2,
    info: 1,
    relation: 1,
    replace: 1.1,
  };
  let numerator = 0;
  let denominator = 0;
  for (const dimension of dimensions) {
    numerator += dimension.score * weights[dimension.key];
    denominator += weights[dimension.key];
  }
  return clampScore(numerator / denominator);
}

function sanitizeHeadline(headline: string, totalScore: number): string {
  const cleaned = cleanCopy(headline);
  if (QUICK_FORBIDDEN_HEADLINE.test(cleaned)) {
    if (totalScore <= 68) return QUICK_OBSERVATION_HEADLINE;
    return "多个关键维度出现变化，建议先稳住现有职责，并通过 30 天观察线确认趋势。";
  }
  return cleaned;
}

function normalizeTrend(trend: Report["trend"], history: QAItem[]): Report["trend"] {
  const corpus = history.map((item) => `${item.question}\n${item.answer}`).join("\n");
  if (/最近两周|近两周|这两周|两周内|上周|最近两次|近两次/.test(corpus)) {
    return {
      ...trend,
      duration: /最近两周|近两周|这两周|两周内/.test(corpus)
        ? "约 2 周内连续出现"
        : "近期连续出现，尚不能确认是长期趋势",
    };
  }
  return trend;
}

function normalizeActions(
  actions: Report["actions"],
  scanMode: ScanMode,
  totalScore: number,
  strongEvidence: boolean,
  hasQuickMitigation: boolean,
): Report["actions"] {
  if (scanMode === "quick") return QUICK_ACTIONS;
  if (totalScore >= 80 && strongEvidence && !hasQuickMitigation) return actions;
  return {
    in72h: normalizeRecommendationList(actions.in72h, scanMode, "in72h"),
    in7d: normalizeRecommendationList(actions.in7d, scanMode, "in7d"),
    in30d: normalizeRecommendationList(actions.in30d, scanMode, "in30d"),
  };
}

function normalizeRecommendationList(items: string[], scanMode: ScanMode, slot: string): string[] {
  const cleaned = cleanList(items).map(rewriteTemplateCopy).filter((item) => {
    if (scanMode === "quick") return !QUICK_FORBIDDEN_ACTIONS.test(item);
    return true;
  });
  if (cleaned.length >= 3) return cleaned.slice(0, 3);
  const fallback = QUICK_ACTIONS[slot as keyof Report["actions"]] ?? QUICK_ACTIONS.in7d;
  return [...cleaned, ...fallback].slice(0, 3);
}

function rewriteTemplateCopy(text: string): string {
  return cleanCopy(text)
    .replace(/变化较多，建议重点关注并持续观察/g, "出现可观察变化，需要结合具体事实继续验证")
    .replace(/可能意味着该维度上你正经历变化。?/g, "需要通过后续事实验证。")
    .replace(/暂未看到强支撑事实/g, "目前该维度信息不足，因此只做低权重处理")
    .replace(/有风险信号，但当前报告缺少可直接引用的事实/g, "目前该维度信息不足，因此只做低权重处理");
}

function hasMitigatingEvidence(report: Report, history: QAItem[] = []): boolean {
  return QUICK_MITIGATION.test(evidenceCorpus(report, history));
}

function hasStrongEvidence(report: Report, history: QAItem[] = []): boolean {
  return evidenceCorpus(report, history)
    .split(/[\n。；;]/)
    .some((line) => STRONG_EVIDENCE.test(line) && !NEGATED_STRONG_EVIDENCE.test(line));
}

function evidenceCorpus(report: Report, history: QAItem[] = []): string {
  const reportParts = [
    report.headline,
    ...report.knownFacts,
    ...report.topSignals,
    ...report.inferences,
    ...report.openAssumptions,
    ...report.explanations,
    ...report.dimensions.flatMap((dimension) => [
      dimension.explain,
      ...dimension.supportingFacts,
      ...dimension.reverseFacts,
    ]),
  ];
  const historyParts = history.flatMap((item) => [
    item.question,
    item.answer,
    ...(item.classified?.facts ?? []),
    ...(item.classified?.judgments ?? []),
    ...(item.classified?.inferences ?? []),
    ...(item.classified?.reverseEvidence ?? []),
  ]);
  return [...reportParts, ...historyParts].join("\n");
}

function reportText(report: Report): string {
  return [
    report.headline,
    report.totalLevel,
    ...report.topSignals,
    ...report.knownFacts,
    ...report.inferences,
    ...report.openAssumptions,
    report.misjudgment,
    ...report.observeSignals,
    ...report.dontDo,
    ...report.shouldDo,
    ...report.actions.in72h,
    ...report.actions.in7d,
    ...report.actions.in30d,
    ...report.dimensions.flatMap((dimension) => [
      dimension.level,
      dimension.explain,
      ...dimension.supportingFacts,
      ...dimension.reverseFacts,
    ]),
    report.trend.verdict,
    report.trend.frequency,
    report.trend.duration,
    report.trend.continuous,
    report.trend.coreResource,
    report.trend.successor,
  ].join("\n");
}

function scoreToLevel(total: number): string {
  const score = clampScore(total);
  if (score <= 20) return "正常状态";
  if (score <= 40) return "轻度变化";
  if (score <= 60) return "值得关注";
  if (score <= 80) return "变化明显";
  return "变化显著";
}
