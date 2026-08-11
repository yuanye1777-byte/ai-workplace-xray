// 服务端 AI 调用限额（仅服务端使用，不会打进前端 bundle）
// 目的：防止有人绕过 UI 直接批量调用 AI 服务端函数，刷爆付费 AI 额度。
// 超限时调用方应回退到本地启发式引擎（不产生任何外部 API 费用）。

import { getRequestHeader } from "@tanstack/react-start/server";

type Bucket = { count: number; resetAt: number };

const WINDOW_MS = 60_000; // 1 分钟窗口
const MAX_PER_WINDOW = 20; // 单个客户端每分钟最多 20 次 AI 调用
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_DAY = 300; // 单个客户端每天最多 300 次 AI 调用
const GLOBAL_MAX_PER_DAY = 5_000; // 全站每日 AI 调用预算上限

const minuteBuckets = new Map<string, Bucket>();
const dayBuckets = new Map<string, Bucket>();
let globalBucket: Bucket = { count: 0, resetAt: Date.now() + DAY_MS };

function hit(map: Map<string, Bucket>, key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (existing.count >= max) return false;
  existing.count += 1;
  return true;
}

function sweep(map: Map<string, Bucket>) {
  if (map.size < 5_000) return;
  const now = Date.now();
  for (const [k, v] of map) if (v.resetAt <= now) map.delete(k);
}

/** 从请求头中推断调用方标识（IP），无法识别时归入共享桶。 */
export function getClientKey(): string {
  try {
    const ip =
      getRequestHeader("cf-connecting-ip") ||
      getRequestHeader("x-real-ip") ||
      (getRequestHeader("x-forwarded-for") ?? "").split(",")[0]?.trim();
    return ip && ip.length > 0 ? ip : "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * 检查并消耗一次 AI 调用配额。
 * 返回 false 表示超限，调用方必须回退到本地引擎，不要发起付费 AI 请求。
 */
export function consumeAiQuota(clientKey: string): boolean {
  const now = Date.now();
  if (globalBucket.resetAt <= now) globalBucket = { count: 0, resetAt: now + DAY_MS };
  if (globalBucket.count >= GLOBAL_MAX_PER_DAY) return false;

  sweep(minuteBuckets);
  sweep(dayBuckets);

  if (!hit(minuteBuckets, clientKey, WINDOW_MS, MAX_PER_WINDOW)) return false;
  if (!hit(dayBuckets, clientKey, DAY_MS, MAX_PER_DAY)) return false;

  globalBucket.count += 1;
  return true;
}
