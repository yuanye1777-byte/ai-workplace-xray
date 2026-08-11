// AI 访谈服务端函数 - 使用 Cloudflare Workers AI REST API 动态生成问题、分类回答、装配报告

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { generateReport as localReport } from "./report";
import { chooseNextQuestion as localNextQuestion, classifyAnswer as localClassify } from "./interview";
import { normalizeReportForMode } from "@/lib/report-quality";
import type { Classified, Dimension, QAItem, Report, ScanMode } from "./types";

// NOTE: 系统提示词位于 ./prompts.server；在 handler 内动态 import，避免打进前端 bundle。

const DIMS = ["power", "resource", "info", "relation", "replace"] as const;

const ISSUE_ENUM = [
  "hollowing_out",
  "marginalization",
  "power_change",
  "resource_transfer",
  "information_loss",
  "trust_decline",
  "successor_forming",
  "loss_of_favor",
  "promotion_stagnation",
  "relationship_risk",
  "value_decline",
  "normal_adjustment",
  "org_restructure",
  "career_pivot",
  "unclear",
] as const;

// ------- 输入验证 -------
// 明确的体量上限：防止超长文本 / 超长历史被拼进 prompt，造成异常昂贵的 AI 调用。
const MAX_TEXT = 2000; // 单个用户输入字段最大字符数
const MAX_SHORT_TEXT = 500; // 分类片段等短字段
const MAX_LIST = 12; // 分类结果数组最大长度
const MAX_HISTORY = 20; // 访谈历史最大轮数

const snippet = () => z.string().max(MAX_SHORT_TEXT);

const ClassifiedSchema = z.object({
  facts: z.array(snippet()).max(MAX_LIST).default([]),
  emotions: z.array(snippet()).max(MAX_LIST).default([]),
  judgments: z.array(snippet()).max(MAX_LIST).default([]),
  inferences: z.array(snippet()).max(MAX_LIST).default([]),
  dimensions: z.array(z.enum(DIMS)).max(MAX_LIST).default([]),
  reverseEvidence: z.array(snippet()).max(MAX_LIST).default([]),
});

const QAItemSchema = z.object({
  question: z.string().max(MAX_TEXT),
  answer: z.string().max(MAX_TEXT),
  classified: ClassifiedSchema.optional(),
  targetDimension: z.string().max(64).optional(),
});

const InterviewInputSchema = z.object({
  initial: z.string().min(1).max(MAX_TEXT),
  history: z.array(QAItemSchema).max(MAX_HISTORY).default([]),
  scanMode: z.enum(["quick", "deep"]).default("deep"),
});

/**
 * 消耗一次 AI 调用配额；超出限额时返回 false，调用方回退到本地启发式引擎，
 * 不会向付费 AI 服务发起请求。
 */
async function allowAiCall(label: string): Promise<boolean> {
  try {
    const { consumeAiQuota, getClientKey } = await import("./rate-limit.server");
    const allowed = consumeAiQuota(getClientKey());
    if (!allowed) console.warn(`[ai] quota exceeded, using local engine for ${label}`);
    return allowed;
  } catch {
    return true;
  }
}

// ------- P1-1: 深度模式追问纠偏 -------

interface NextTurnResult {
  done: boolean;
  question?: string | null;
  targetDimension?: string | null;
}

/**
 * 深度模式：如果用户上一轮回答未针对当前问题，追问一次而非直接进入下一题。
 * 只在 history >= 2（至少完成一轮 Q&A）且上一轮非 clarify 时才检查。
 */
function enforceReask(
  history: QAItem[],
  original: NextTurnResult,
  maxRounds: number,
  scanMode: ScanMode,
): NextTurnResult {
  if (scanMode !== "deep") return original;
  if (original.done) return original;
  if (history.length < 2) return original;

  const last = history[history.length - 1];
  if (!last) return original;

  // 上一轮已经是追问，不再二次追问
  if (last.targetDimension === "clarify" || (last.targetDimension as string) === "reask") return original;

  const answer = last.answer ?? "";
  const question = last.question ?? "";

  // 检测"跑题"：回答很短（< 15 字）或明显是行动/想法而非针对问题
  // 注意：不检查"回答是否包含问题关键词"——用户自然不会复述问题原文，该检查误判率极高
  const isTooShort = answer.replace(/\s/g, "").length < 15;
  const isActionAnswer = /^(我会|我打算|我准备|我想先|我觉得应该|建议|可以试试)/.test(answer.trim());

  if (!isTooShort && !isActionAnswer) return original;

  console.log("[nextTurnFn] deep reask: user likely evaded question, asking once more");
  return {
    done: false,
    question: `这个回答更像行动想法，我想确认刚才的问题：${question}`,
    targetDimension: "reask",
  };
}

// ------- 服务端函数 -------

export const classifyAnswerFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      text: z.string().min(1).max(MAX_TEXT),
      question: z.string().max(MAX_TEXT).optional(),
    }).parse(input),
  )
  .handler(async ({ data }): Promise<Classified> => {
    try {
      if (!(await allowAiCall("classifyAnswerFn"))) return localClassify(data.text);
      const { generateText } = await import("ai");
      const {
        createCloudflareAiGatewayProvider,
        requireCloudflareAccountId,
        requireCloudflareApiToken,
        requireCloudflareAiModel,
      } = await import("./cloudflare.gateway.server");
      const { CLASSIFIER_SYSTEM_PROMPT } = await import("./prompts.server");
      const gateway = createCloudflareAiGatewayProvider(
        requireCloudflareAccountId(),
        requireCloudflareApiToken(),
      );
      const model = gateway(requireCloudflareAiModel());

      const prompt = `${data.question ? `AI 上一个问题：${data.question}\n` : ""}用户回答：${data.text}

请只输出符合 schema 的 JSON，不要 markdown 代码块。`;

      console.log("[classifyAnswerFn] calling generateText");
      const { text } = await Promise.race([
        generateText({
          model,
          system: CLASSIFIER_SYSTEM_PROMPT,
          prompt,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("generateText timeout after 10s")), 10_000),
        ),
      ]);
      console.log("[classifyAnswerFn] generateText returned, text length:", text?.length ?? 0);
      const parsed = tryParseJson(text);
      if (parsed) {
        return normalizeClassified(ClassifiedSchema.parse(parsed));
      }
      throw new Error("AI 分类 JSON 解析失败");
    } catch (error) {
      console.warn("classifyAnswerFn fallback to local:", (error as Error).message);
      return localClassify(data.text);
    }
  });

export const nextTurnFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InterviewInputSchema.parse(input))
  .handler(async ({ data }) => {
    const isQuick = data.scanMode === "quick";
    const AI_MAX_ROUNDS = isQuick ? 5 : 10;
    console.log(`[nextTurnFn] ENTER scanMode=${data.scanMode} isQuick=${isQuick} history.length=${data.history.length} AI_MAX_ROUNDS=${AI_MAX_ROUNDS}`);
    try {
      // 硬上限：quick=5轮 deep=10轮，超过自动结束
      if (data.history.length >= AI_MAX_ROUNDS) {
        console.log(`[nextTurnFn] HARD CAP: history.length=${data.history.length} >= ${AI_MAX_ROUNDS}, returning done=true`);
        return { done: true, question: null, targetDimension: null };
      }

      if (!(await allowAiCall("nextTurnFn")) || isQuick) {
        // quick 模式强制走本地确定性策略，确保 5 轮路径不被 AI 自由发挥破坏
        if (isQuick) {
          console.log("[nextTurnFn] quick mode: using deterministic local engine");
        }
        const local = localNextQuestion(data.initial, data.history as QAItem[], AI_MAX_ROUNDS, data.scanMode);
        console.log(`[nextTurnFn] local fallback: done=${local.done} question=${local.question?.slice(0,30) ?? "null"}`);
        // P1-1: 深度模式追问纠偏 — 用户未回答问题时追问一次
        const corrected = isQuick ? local : enforceReask(data.history as QAItem[], local, AI_MAX_ROUNDS, data.scanMode);
        return {
          done: corrected.done,
          question: corrected.question ?? null,
          targetDimension: (corrected.targetDimension ?? null) as string | null,
        };
      }
      const { generateText } = await import("ai");
      const {
        createCloudflareAiGatewayProvider,
        requireCloudflareAccountId,
        requireCloudflareApiToken,
        requireCloudflareAiModel,
      } = await import("./cloudflare.gateway.server");
      const { INTERVIEWER_SYSTEM_PROMPT, formatHistoryForPrompt, buildInterviewerSystemPrompt } = await import(
        "./prompts.server"
      );
      const gateway = createCloudflareAiGatewayProvider(
        requireCloudflareAccountId(),
        requireCloudflareApiToken(),
      );
      const model = gateway(requireCloudflareAiModel());

      // targetDimension 用宽口径 string 接收：AI 偶有把 issueType
      // (如 career_pivot) 填入此字段的倾向，不再因此抛 Zod 异常强制回退。
      const VALID_TARGET_DIMS = new Set([...DIMS, "clarify", "reverse", "trend", "general"]);
      const schema = z.object({
        status: z.enum(["interviewing", "ready_for_report"]),
        nextQuestion: z.string().nullable(),
        targetDimension: z.string().nullable(),
        reason: z.string().nullable(),
        confidence: z.number().nullable(),
        informationSufficiency: z.number().nullable().optional(),
        detectedIssues: z
          .array(
            z.object({
              type: z.enum(ISSUE_ENUM),
              confidence: z.number(),
            }),
          )
          .optional()
          .default([]),
      });

      const prompt = `${formatHistoryForPrompt(data.initial, data.history as QAItem[])}

当前访谈模式：${data.scanMode === "quick" ? "快速扫描（最多 5 轮）" : "深度扫描（最多 10 轮）"}。

请根据上面的完整历史和当前模式，输出下一步动作 JSON。
{
  "status": "interviewing" | "ready_for_report",
  "nextQuestion": string | null,
  "targetDimension": "power" | "resource" | "info" | "relation" | "replace" | "clarify" | "reverse" | "trend" | "general" | null,
  "reason": string | null,
  "confidence": number | null,
  "informationSufficiency": number | null,
  "detectedIssues": [{ "type": "${ISSUE_ENUM.join(" | ")}", "confidence": number }]
}
只输出 JSON，不要 markdown 代码块。`;

      console.log("[nextTurnFn] calling generateText, history length:", data.history.length, "scanMode=", data.scanMode);
      let parsed: z.infer<typeof schema> | null = null;
      const { text } = await Promise.race([
        generateText({
          model,
          system: buildInterviewerSystemPrompt(data.scanMode),
          prompt,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("generateText timeout after 10s")), 10_000),
        ),
      ]);
      console.log("[nextTurnFn] generateText returned, text length:", text?.length ?? 0);
      const raw = tryParseJson(text);
      if (raw) parsed = schema.parse(raw);
      if (!parsed) throw new Error("AI 追问 JSON 解析失败");

      // 防重复：如果 AI 又出了一个已经问过的问题，退回到本地补维度逻辑
      if (
        parsed.status === "interviewing" &&
        parsed.nextQuestion &&
        data.history.some((h) => h.question.trim() === parsed!.nextQuestion!.trim())
      ) {
        const local = localNextQuestion(data.initial, data.history as QAItem[], AI_MAX_ROUNDS, data.scanMode);
        return {
          done: local.done,
          question: local.question ?? null,
          targetDimension: (local.targetDimension ?? null) as string | null,
        };
      }

      // 只向前端返回展示所需字段；detectedIssues / informationSufficiency / reason / confidence 只保留在服务端日志。
      if (process.env.NODE_ENV !== "production") {
        console.log("[interview] server-side context", {
          detectedIssues: parsed.detectedIssues,
          informationSufficiency: parsed.informationSufficiency,
          confidence: parsed.confidence,
          reason: parsed.reason,
        });
      }
      // 归一化 targetDimension：AI 偶把 issueType 填入此字段，映射到合法值或 null。
      const normalizedTarget =
        parsed.targetDimension && VALID_TARGET_DIMS.has(parsed.targetDimension)
          ? parsed.targetDimension
          : null;

      // 硬上限：quick=5轮 deep=10轮，不到目标轮次时忽略 AI 的 ready_for_report
      const FORCE_MIN_ROUNDS = isQuick ? 5 : 10;
      const forceContinue = data.history.length + 1 < FORCE_MIN_ROUNDS && parsed.status === "ready_for_report";
      if (forceContinue) {
        console.log("[nextTurnFn] AI wants to end at round", data.history.length + 1, "but forcing continue to", FORCE_MIN_ROUNDS, `(scanMode=${data.scanMode})`);
        const local = localNextQuestion(data.initial, data.history as QAItem[], FORCE_MIN_ROUNDS, data.scanMode);
        return {
          done: false,
          question: local.question ?? null,
          targetDimension: (local.targetDimension ?? null) as string | null,
        };
      }

      const aiResult = {
        done: parsed.status === "ready_for_report",
        question: parsed.nextQuestion ?? null,
        targetDimension: normalizedTarget,
      };
      // P1-1: 深度模式追问纠偏 — AI 可能未检测到用户跑题
      const reaskResult = enforceReask(data.history as QAItem[], aiResult, AI_MAX_ROUNDS, data.scanMode);
      return reaskResult;
    } catch (error) {
      console.warn("nextTurnFn fallback to local:", (error as Error).message);
      const local = localNextQuestion(data.initial, data.history as QAItem[], isQuick ? 5 : 10, data.scanMode);
      // P1-1: 深度模式追问纠偏
      const corrected = isQuick ? local : enforceReask(data.history as QAItem[], local, isQuick ? 5 : 10, data.scanMode);
      return {
        done: corrected.done,
        question: corrected.question ?? null,
        targetDimension: (corrected.targetDimension ?? null) as string | null,
      };
    }
  });

export const generateReportFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => InterviewInputSchema.parse(input))
  .handler(async ({ data }): Promise<Report> => {
    try {
      if (!(await allowAiCall("generateReportFn"))) {
        return localReport(data.initial, data.history as QAItem[], data.scanMode);
      }
      const { generateText } = await import("ai");
      const {
        createCloudflareAiGatewayProvider,
        requireCloudflareAccountId,
        requireCloudflareApiToken,
        requireCloudflareAiModel,
      } = await import("./cloudflare.gateway.server");
      const { REPORT_SYSTEM_PROMPT, formatHistoryForPrompt } = await import(
        "./prompts.server"
      );
      const gateway = createCloudflareAiGatewayProvider(
        requireCloudflareAccountId(),
        requireCloudflareApiToken(),
      );
      const model = gateway(requireCloudflareAiModel());

      const prompt = `${formatHistoryForPrompt(data.initial, data.history as QAItem[])}

请基于以上完整访谈生成 JSON 格式的「AI 职场 X 光报告」，字段必须严格如下：
{
  "headline": string,
  "mainIssue": { "type": string, "label": string, "confidence": number },
  "secondaryIssues": [ { "type": string, "label": string, "confidence": number } ],
  "potentialRisks": [ { "type": string, "label": string, "confidence": number } ],
  "totalScore": number 0-100,
  "totalLevel": string,
  "dimensions": [ { "key": "power"|"resource"|"info"|"relation"|"replace",
                    "score": number, "level": string, "explain": string,
                    "supportingFacts": string[], "reverseFacts": string[] }, x5 ],
  "topSignals": string[3],
  "trend": { "verdict": string, "frequency": string, "duration": string,
             "continuous": string, "coreResource": string, "successor": string },
  "futureTrend": {
     "in30d": { "risk": "上升"|"稳定"|"下降", "note": string },
     "in3m": string[3]
  },
  "explanations": string[3],
  "knownFacts": string[],
  "inferences": string[],
  "openAssumptions": string[],
  "misjudgment": string,
  "reversalSpace": "高"|"中"|"低",
  "observeSignals": string[3],
  "dontDo": string[3],
  "shouldDo": string[3],
  "actions": { "in72h": string[3], "in7d": string[3], "in30d": string[3] }
}
mainIssue.type / secondaryIssues[].type / potentialRisks[].type 只能取自：
${ISSUE_ENUM.join(", ")}。label 用简体中文写完整名称。
只输出 JSON，不要 markdown 代码块。`;

      const { text } = await Promise.race([
        generateText({
          model,
          system: REPORT_SYSTEM_PROMPT,
          prompt,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("generateText timeout after 30s")), 30_000),
        ),
      ]);

      const parsed = tryParseJson(text);
      if (parsed && looksLikeReport(parsed)) {
        return sanitizeReport(parsed, data.scanMode, data.history as QAItem[]);
      }
      throw new Error("AI 报告 JSON 解析失败");
    } catch (error) {
      console.warn("generateReportFn fallback to local:", (error as Error).message);
      return localReport(data.initial, data.history as QAItem[], data.scanMode);
    }
  });

// ------- helpers -------

function tryParseJson(text: string): unknown | null {
  if (!text) return null;
  const trimmed = text.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** P0-2: 从维度 supportingFacts 中提取与分数一致的 topSignals */
function pickConsistentTopSignals(
  dims: { key: string; score: number; explain?: string; supportingFacts: string[]; reverseFacts: string[] }[],
  fallback: string[],
): string[] {
  const signals: string[] = [];
  const sorted = [...dims].sort((a, b) => b.score - a.score);
  for (const d of sorted) {
    for (const f of d.supportingFacts) {
      if (!signals.includes(f)) signals.push(f);
      if (signals.length >= 3) return signals;
    }
  }
  // 没有足够 supportingFacts → 用 fallback 或维度 explain
  for (const d of sorted) {
    if (d.score >= 40 && d.explain && !signals.includes(d.explain)) {
      signals.push(d.explain);
      if (signals.length >= 3) return signals;
    }
  }
  return signals.length > 0 ? signals : (fallback.slice(0, 3).length > 0 ? fallback.slice(0, 3) : ["暂无明确信号。"]);
}

function normalizeClassified(c: z.infer<typeof ClassifiedSchema>): Classified {
  return {
    facts: c.facts.slice(0, 8),
    emotions: c.emotions.slice(0, 6),
    judgments: c.judgments.slice(0, 6),
    inferences: c.inferences.slice(0, 6),
    dimensions: Array.from(new Set(c.dimensions)) as Dimension[],
    reverseEvidence: c.reverseEvidence.slice(0, 6),
  };
}

function looksLikeReport(x: unknown): x is Record<string, unknown> {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.headline === "string" &&
    typeof o.totalScore === "number" &&
    Array.isArray(o.dimensions) &&
    Array.isArray(o.topSignals)
  );
}

/** P1-1: score → level 字符串映射 */
function scoreToLevelStr(total: number): string {
  if (total <= 20) return "正常状态";
  if (total <= 40) return "轻度变化";
  if (total <= 60) return "值得关注";
  if (total <= 80) return "变化明显";
  return "变化显著";
}

/** P1-1: 检查 level 是否与 score 匹配 */
function scoreMatchesLevel(score: number, level: string): boolean {
  return scoreToLevelStr(score) === level;
}

function sanitizeReport(raw: Record<string, unknown>, scanMode: ScanMode, history: QAItem[]): Report {
  const r = raw as unknown as Report;
  // 确保维度按固定顺序，缺失补齐
  const byKey = new Map(r.dimensions?.map((d) => [d.key, d]) ?? []);
  const dims = DIMS.map(
    (k) =>
      byKey.get(k) ?? {
        key: k,
        score: 20,
        level: "正常状态",
        explain: `${k} 维度信息不足`,
        supportingFacts: [],
        reverseFacts: [],
      },
  );
  // P1-1: totalScore ↔ totalLevel 一致性
  const fixedLevel = scoreMatchesLevel(r.totalScore, r.totalLevel) ? r.totalLevel : scoreToLevelStr(r.totalScore);
  return normalizeReportForMode({
    ...r,
    totalScore: Math.max(0, Math.min(100, Math.round(r.totalScore))),
    totalLevel: fixedLevel,
    dimensions: dims,
    // P0-2: 用维度 supportingFacts 重算 topSignals，避免与 scores 不一致
    topSignals: pickConsistentTopSignals(dims, r.topSignals ?? []),
    explanations: (r.explanations ?? []).slice(0, 3),
    knownFacts: r.knownFacts ?? [],
    inferences: r.inferences ?? [],
    openAssumptions: r.openAssumptions ?? [],
    observeSignals: (r.observeSignals ?? []).slice(0, 3),
    dontDo: (r.dontDo ?? []).slice(0, 3),
    shouldDo: (r.shouldDo ?? []).slice(0, 3),
    actions: {
      in72h: (r.actions?.in72h ?? []).slice(0, 3),
      in7d: (r.actions?.in7d ?? []).slice(0, 3),
      in30d: (r.actions?.in30d ?? []).slice(0, 3),
    },
    mainIssue: r.mainIssue,
    secondaryIssues: (r.secondaryIssues ?? []).slice(0, 4),
    potentialRisks: (r.potentialRisks ?? []).slice(0, 4),
    futureTrend: r.futureTrend
      ? {
          in30d: r.futureTrend.in30d,
          in3m: (r.futureTrend.in3m ?? []).slice(0, 3),
        }
      : undefined,
  }, scanMode, history);
}
