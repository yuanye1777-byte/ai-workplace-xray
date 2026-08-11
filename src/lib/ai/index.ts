// AI 服务门面 - 现在完全走 Cloudflare Workers AI 服务端函数
// 本地 heuristics 只作为服务端调用失败时的兜底（在 *.functions.ts 内部）

import {
  classifyAnswerFn,
  generateReportFn,
  nextTurnFn,
} from "./interview.functions";
import { canFinishEarly, chooseNextQuestion, classifyAnswer } from "./interview";
import { generateReport as localReport } from "./report";
import type {
  AIService,
  Classified,
  Dimension,
  NextQuestion,
  QAItem,
  Report,
  ScanMode,
} from "./types";

/**
 * 给所有 AI 调用加客户端超时保护：服务端 10s 兜底 + 客户端 18s race。
 * 万一后端没响应或卡死，客户端也会兜底到本地启发式引擎，不会让用户卡死。
 */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} client timeout ${ms}ms`)), ms),
    ),
  ]);
}

export const aiService: AIService = {
  async classify(text: string): Promise<Classified> {
    try {
      const result = await withTimeout(
        classifyAnswerFn({ data: { text } }),
        18_000,
        "classify",
      );
      return result;
    } catch (e) {
      console.warn("[aiService.classify] fallback to local:", (e as Error).message);
      return classifyAnswer(text);
    }
  },
  async nextQuestion(initial: string, history: QAItem[], scanMode: ScanMode = "deep"): Promise<NextQuestion> {
    const maxRounds = scanMode === "quick" ? 5 : 10;
    console.log(`[aiService.nextQuestion] ENTER scanMode=${scanMode} history.length=${history.length} maxRounds=${maxRounds}`);
    try {
      const res = await withTimeout(
        nextTurnFn({ data: { initial, history, scanMode } }),
        18_000,
        "nextQuestion",
      );
      // P0-1: RPC 层可能返回 undefined（Cloudflare tunnel 1033 等网络异常），提前兜底
      if (!res) {
        throw new Error("nextTurnFn returned undefined");
      }
      console.log(`[aiService.nextQuestion] nextTurnFn returned: done=${res.done} question=${res.question?.slice(0,30) ?? "null"} targetDimension=${res.targetDimension}`);
      if (res.done) {
        return { done: true };
      }
      return {
        done: false,
        question: res.question ?? undefined,
        targetDimension: (res.targetDimension ?? undefined) as
          | Dimension
          | "clarify"
          | "reverse"
          | "trend"
          | undefined,
      };
    } catch (e) {
      console.warn("[aiService.nextQuestion] fallback to local:", (e as Error).message);
      const local = chooseNextQuestion(initial, history, maxRounds, scanMode);
      console.log(`[aiService.nextQuestion] local fallback: done=${local.done} question=${local.question?.slice(0,30) ?? "null"} targetDimension=${local.targetDimension}`);
      if (local.done) return { done: true };
      return {
        done: false,
        question: local.question,
        targetDimension: local.targetDimension,
      };
    }
  },
  async generateReport(initial: string, history: QAItem[], scanMode: ScanMode = "deep"): Promise<Report> {
    try {
      return await withTimeout(
        generateReportFn({ data: { initial, history, scanMode } }),
        30_000,
        "generateReport",
      );
    } catch (e) {
      console.warn("[aiService.generateReport] fallback to local:", (e as Error).message);
      return localReport(initial, history, scanMode);
    }
  },
};

export { canFinishEarly, chooseNextQuestion, classifyAnswer };
export * from "./types";
