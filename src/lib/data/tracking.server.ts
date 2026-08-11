// Phase 1 数据层：匿名身份 / 职场周期 / 检测记录 / 诊断 / 基线快照
// 所有数据库访问只在服务端执行（service role），浏览器不直接访问数据库。

import { getRequestHeader, setResponseHeader } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { CURRENT_MODEL_VERSION, CURRENT_PROMPT_VERSION } from "../ai/version";
import type { Report } from "../ai/types";
import type { Json, Database } from "@/integrations/supabase/types";

const toJson = (v: unknown): Json => JSON.parse(JSON.stringify(v ?? null)) as Json;

const COOKIE_NAME = "xray_uid";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 2; // 2 年

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

function readCookieUid(): string | null {
  const raw = getRequestHeader("cookie") ?? "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE_NAME) {
      const val = decodeURIComponent(v.join("="));
      return UUID_RE.test(val) ? val : null;
    }
  }
  return null;
}

function writeCookieUid(uid: string) {
  setResponseHeader(
    "set-cookie",
    `${COOKIE_NAME}=${uid}; Path=/; Max-Age=${COOKIE_MAX_AGE}; HttpOnly; SameSite=Lax; Secure`,
  );
}

/** 读取或创建匿名用户；始终返回稳定的 anonymous_user_id（HttpOnly Cookie 持久化）。 */
export async function ensureAnonymousUser(): Promise<{
  anonymousUserId: string;
  created: boolean;
}> {
  const supabase = await db();
  const existing = readCookieUid();

  if (existing) {
    const { data } = await supabase
      .from("users")
      .select("anonymous_user_id")
      .eq("anonymous_user_id", existing)
      .maybeSingle();
    if (data) {
      writeCookieUid(existing);
      await supabase
        .from("users")
        .update({ last_active_at: new Date().toISOString() })
        .eq("anonymous_user_id", existing);
      return { anonymousUserId: existing, created: false };
    }
    // Cookie 存在但记录缺失（例如数据被清理）→ 用同一个 ID 补建，保证身份稳定
    const { error } = await supabase.from("users").insert({ anonymous_user_id: existing });
    if (error) throw error;
    writeCookieUid(existing);
    return { anonymousUserId: existing, created: true };
  }

  const uid = crypto.randomUUID();
  const { error } = await supabase.from("users").insert({ anonymous_user_id: uid });
  if (error) throw error;
  writeCookieUid(uid);
  return { anonymousUserId: uid, created: true };
}

export async function updateLastActive(anonymousUserId: string): Promise<void> {
  const supabase = await db();
  await supabase
    .from("users")
    .update({ last_active_at: new Date().toISOString() })
    .eq("anonymous_user_id", anonymousUserId);
}

export async function createCareerContext(
  anonymousUserId: string,
  title = "我的职场档案",
): Promise<string> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("career_contexts")
    .insert({ anonymous_user_id: anonymousUserId, title, status: "active" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function getActiveCareerContext(
  anonymousUserId: string,
): Promise<string | null> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("career_contexts")
    .select("id")
    .eq("anonymous_user_id", anonymousUserId)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id ?? null;
}

export async function getOrCreateActiveCareerContext(
  anonymousUserId: string,
): Promise<string> {
  return (
    (await getActiveCareerContext(anonymousUserId)) ??
    (await createCareerContext(anonymousUserId))
  );
}

export type AssessmentType = "INITIAL" | "FOLLOW_UP" | "REASSESSMENT";

export async function createAssessment(input: {
  anonymousUserId: string;
  careerContextId: string;
  type?: AssessmentType;
}): Promise<string> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("assessments")
    .insert({
      anonymous_user_id: input.anonymousUserId,
      career_context_id: input.careerContextId,
      type: input.type ?? "INITIAL",
      status: "started",
      started_at: new Date().toISOString(),
      model_version: CURRENT_MODEL_VERSION,
      prompt_version: CURRENT_PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateAssessmentStatus(
  assessmentId: string,
  status: "started" | "completed" | "abandoned",
): Promise<void> {
  const supabase = await db();
  const { error } = await supabase
    .from("assessments")
    .update({
      status,
      model_version: CURRENT_MODEL_VERSION,
      prompt_version: CURRENT_PROMPT_VERSION,
      ...(status === "completed" ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq("id", assessmentId);
  if (error) throw error;
}

/** 保存原始问诊记录（不做二次 AI 处理，仅归档，用于未来追溯）。 */
export async function saveTurns(input: {
  assessmentId: string;
  anonymousUserId: string;
  initial: string;
  history: Array<{
    question: string;
    answer: string;
    targetDimension?: string;
    classified?: unknown;
  }>;
}): Promise<void> {
  const supabase = await db();
  const rows = [
    {
      assessment_id: input.assessmentId,
      anonymous_user_id: input.anonymousUserId,
      turn_index: 0,
      question: null as string | null,
      answer: input.initial,
      target_dimension: "initial",
      classified: null as Json,
    },
    ...input.history.map((h, i) => ({
      assessment_id: input.assessmentId,
      anonymous_user_id: input.anonymousUserId,
      turn_index: i + 1,
      question: h.question,
      answer: h.answer,
      target_dimension: h.targetDimension ?? null,
      classified: toJson(h.classified ?? null),
    })),
  ];
  const { error } = await supabase
    .from("assessment_turns")
    .upsert(rows, { onConflict: "assessment_id,turn_index" });
  if (error) throw error;
}

function dimensionMap(report: Report) {
  const byKey = new Map(report.dimensions.map((d) => [d.key, d.score]));
  return {
    power: byKey.get("power") ?? null,
    resource: byKey.get("resource") ?? null,
    information: byKey.get("info") ?? null,
    trust: byKey.get("relation") ?? null,
    core_task: byKey.get("replace") ?? null,
  };
}

/** 保存结构化诊断：事实 / 信号 / 结论分开存储。 */
export async function saveDiagnosis(input: {
  assessmentId: string;
  anonymousUserId: string;
  careerContextId: string;
  report: Report;
}): Promise<string> {
  const supabase = await db();
  const { report } = input;
  const { data, error } = await supabase
    .from("diagnoses")
    .insert({
      assessment_id: input.assessmentId,
      anonymous_user_id: input.anonymousUserId,
      career_context_id: input.careerContextId,
      issue_type: report.mainIssue?.type ?? "unclear",
      risk_level: report.totalLevel,
      risk_score: report.totalScore,
      confidence: report.mainIssue?.confidence ?? null,
      five_dimensions: toJson(dimensionMap(report)),
      key_facts: toJson(report.knownFacts ?? []),
      key_signals: toJson(report.topSignals ?? []),
      conclusion: report.headline,
      report_data: toJson(report),
      model_version: CURRENT_MODEL_VERSION,
      prompt_version: CURRENT_PROMPT_VERSION,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/** 首次检测完成后的基线快照，供未来 FOLLOW_UP 对比。 */
export async function saveBaselineSnapshot(input: {
  diagnosisId: string;
  assessmentId: string;
  anonymousUserId: string;
  careerContextId: string;
  report: Report;
}): Promise<string> {
  const supabase = await db();
  const dims = dimensionMap(input.report);
  const { data, error } = await supabase
    .from("baseline_snapshots")
    .insert({
      diagnosis_id: input.diagnosisId,
      assessment_id: input.assessmentId,
      anonymous_user_id: input.anonymousUserId,
      career_context_id: input.careerContextId,
      power_state: dims.power,
      resource_state: dims.resource,
      information_state: dims.information,
      trust_state: dims.trust,
      core_task_state: dims.core_task,
      issue_type: input.report.mainIssue?.type ?? "unclear",
      risk_level: input.report.totalLevel,
      confidence: input.report.mainIssue?.confidence ?? null,
      snapshot_data: toJson({
        model_version: CURRENT_MODEL_VERSION,
        prompt_version: CURRENT_PROMPT_VERSION,
        dimensions: input.report.dimensions,
        totalScore: input.report.totalScore,
        totalLevel: input.report.totalLevel,
        trend: input.report.trend,
        knownFacts: input.report.knownFacts,
        topSignals: input.report.topSignals,
        conclusion: input.report.headline,
      }),
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function hasBaseline(careerContextId: string): Promise<boolean> {
  const supabase = await db();
  const { data, error } = await supabase
    .from("baseline_snapshots")
    .select("id")
    .eq("career_context_id", careerContextId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

/* ----------------------- 读取函数（历史记录） ----------------------- */

/** 读取 cookie 中的匿名用户 ID（不创建用户，无副作用）。 */
export function getAnonymousUserId(): string | null {
  return readCookieUid();
}

/** 获取用户所有已完成的检测列表（含诊断摘要），按时间降序。 */
export async function listCompletedAssessments(
  supabase: SupabaseClient<Database>,
  anonymousUserId: string,
): Promise<
  Array<{
    id: string;
    created_at: string;
    headline: string;
    total_score: number;
    main_issue_type: string;
  }>
> {
  const { data, error } = await supabase
    .from("assessments")
    .select(
      `
      id,
      created_at,
      diagnoses!inner(
        conclusion,
        risk_score,
        issue_type
      )
    `,
    )
    .eq("anonymous_user_id", anonymousUserId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map((row: any) => {
    const diag = Array.isArray(row.diagnoses)
      ? row.diagnoses[0]
      : row.diagnoses;
    return {
      id: row.id,
      created_at: row.created_at,
      headline: diag?.conclusion ?? "（无结论）",
      total_score: diag?.risk_score ?? 0,
      main_issue_type: diag?.issue_type ?? "unclear",
    };
  });
}

/** 获取单个检测的完整数据（含问诊记录与诊断报告）。 */
export async function getAssessmentDetail(
  supabase: SupabaseClient<Database>,
  assessmentId: string,
): Promise<{
  assessment: Database["public"]["Tables"]["assessments"]["Row"];
  turns: Database["public"]["Tables"]["assessment_turns"]["Row"][];
  diagnosis: Database["public"]["Tables"]["diagnoses"]["Row"] | null;
} | null> {
  const { data: assessment, error: aErr } = await supabase
    .from("assessments")
    .select("*")
    .eq("id", assessmentId)
    .maybeSingle();
  if (aErr) throw aErr;
  if (!assessment) return null;

  const { data: turns, error: tErr } = await supabase
    .from("assessment_turns")
    .select("*")
    .eq("assessment_id", assessmentId)
    .order("turn_index", { ascending: true });
  if (tErr) throw tErr;

  const { data: diagnosis, error: dErr } = await supabase
    .from("diagnoses")
    .select("*")
    .eq("assessment_id", assessmentId)
    .maybeSingle();
  if (dErr) throw dErr;

  return {
    assessment,
    turns: turns ?? [],
    diagnosis: diagnosis ?? null,
  };
}

/* ----------------------- 分享读取（无需登录） ----------------------- */

/** 分享页所需的最小数据子集，不暴露完整 report_data / 原始输入 / raw turns。 */
export interface SharedReportData {
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
}

/** 通过 assessment ID 获取分享所需的报告数据（不要求登录）。只返回展示所需字段。 */
export async function getSharedReport(
  supabase: SupabaseClient<Database>,
  assessmentId: string,
): Promise<SharedReportData | null> {
  const { data, error } = await supabase
    .from("assessments")
    .select(
      `
      id,
      created_at,
      status,
      diagnoses!inner(
        conclusion,
        risk_score,
        risk_level,
        issue_type,
        report_data
      )
    `,
    )
    .eq("id", assessmentId)
    .eq("status", "completed")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const diag = Array.isArray(data.diagnoses) ? data.diagnoses[0] : data.diagnoses;
  if (!diag) return null;

  // 只提取分享页展示所需的最小字段，不暴露完整 report_data
  const raw = diag.report_data as Record<string, unknown> | null;
  const dims = Array.isArray(raw?.dimensions)
    ? (raw!.dimensions as Array<{ key: string; score: number; level: string; explain: string }>)
        .map((d) => ({ key: d.key, score: d.score, level: d.level ?? "", explain: d.explain ?? "" }))
    : [];
  const topSignals = Array.isArray(raw?.topSignals) ? (raw!.topSignals as string[]).slice(0, 3) : [];
  const knownFacts = Array.isArray(raw?.knownFacts) ? (raw!.knownFacts as string[]).slice(0, 5) : [];
  const misjudgment = typeof raw?.misjudgment === "string" ? raw!.misjudgment : "";

  return {
    headline: diag.conclusion ?? "（无结论）",
    total_score: diag.risk_score ?? 0,
    total_level: diag.risk_level ?? "",
    main_issue_type: diag.issue_type ?? "unclear",
    dimensions: dims,
    top_signals: topSignals,
    known_facts: knownFacts,
    misjudgment,
    created_at: data.created_at,
  };
}
