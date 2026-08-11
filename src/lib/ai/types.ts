// AI 职场 X 光 - 共享类型定义

export type Dimension = "power" | "resource" | "info" | "relation" | "replace";

export const DIMENSION_LABEL: Record<Dimension, string> = {
  power: "权力",
  resource: "资源",
  info: "信息",
  relation: "关系",
  replace: "替代风险",
};

// 用户输入被 AI 内部拆解为四类语义
export type StatementKind = "fact" | "emotion" | "judgment" | "inference";

export const STATEMENT_LABEL: Record<StatementKind, string> = {
  fact: "事实",
  emotion: "情绪",
  judgment: "判断",
  inference: "推测",
};

export interface Classified {
  facts: string[];       // 可观察的行为 / 事件
  emotions: string[];    // 感受、情绪
  judgments: string[];   // "他对我不满" 这种主观定性
  inferences: string[];  // "所以他想让我走" 这种推断
  // 该轮涉及到的维度（用于覆盖度判断）
  dimensions: Dimension[];
  // 该轮出现的反向证据（例如"但他这周仍然让我主导某项目"）
  reverseEvidence: string[];
}

export interface QAItem {
  question: string;
  answer: string;
  classified?: Classified;
  targetDimension?: Dimension | "clarify" | "reverse" | "trend";
}

export interface DimensionScore {
  key: Dimension;
  score: number; // 0-100
  level: string;
  explain: string;
  supportingFacts: string[];   // 支持该维度判断的用户事实
  reverseFacts: string[];      // 反向证据
}

export type IssueType =
  | "hollowing_out"
  | "marginalization"
  | "power_change"
  | "resource_transfer"
  | "information_loss"
  | "trust_decline"
  | "successor_forming"
  | "loss_of_favor"
  | "promotion_stagnation"
  | "relationship_risk"
  | "value_decline"
  | "normal_adjustment"
  | "org_restructure"
  | "career_pivot"
  | "unclear";

export interface DetectedIssue {
  type: IssueType;
  label: string;
  confidence: number;
}

export interface Report {
  headline: string;                 // 一句话结论
  mainIssue?: DetectedIssue;        // AI 自动识别的主问题（v1 常见：被架空）
  secondaryIssues?: DetectedIssue[];// 次级问题
  potentialRisks?: DetectedIssue[]; // 潜在风险
  totalScore: number;               // 综合风险 0-100
  totalLevel: string;               // 风险等级文字
  dimensions: DimensionScore[];     // 五维扫描
  topSignals: string[];             // 最值得警惕的 3 个信号（引用用户事实）
  trend: {
    verdict: string;                // "偶然" or "趋势"
    frequency: string;
    duration: string;
    continuous: string;
    coreResource: string;
    successor: string;
  };
  futureTrend?: {
    in30d: { risk: "上升" | "稳定" | "下降"; note: string };
    in3m: string[];
  };
  explanations: string[];           // 最可能的 3 种解释（可能性，非事实）
  knownFacts: string[];             // 已知事实（引用用户话）
  inferences: string[];             // AI 推断（明确标注为推断）
  openAssumptions: string[];        // 待验证假设
  misjudgment: string;              // 最容易误判的地方
  reversalSpace: "高" | "中" | "低";
  observeSignals: string[];         // 未来 30 天要观察的 3 个信号
  dontDo: string[];
  shouldDo: string[];
  actions: {
    in72h: string[];
    in7d: string[];
    in30d: string[];
  };
}

export interface NextQuestion {
  done: boolean;
  question?: string;
  targetDimension?: Dimension | "clarify" | "reverse" | "trend";
  reason?: string; // 内部：为什么现在问这个（便于调试/日志）
}

export type ScanMode = "quick" | "deep";

export interface AIService {
  classify(text: string): Promise<Classified>;
  nextQuestion(initial: string, history: QAItem[], scanMode?: ScanMode): Promise<NextQuestion>;
  generateReport(initial: string, history: QAItem[], scanMode?: ScanMode): Promise<Report>;
}
