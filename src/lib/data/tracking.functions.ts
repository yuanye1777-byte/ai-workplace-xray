// Phase 1 数据层服务端函数（薄封装，真实逻辑在 ./tracking.server）

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const UUID = z.string().uuid();

const StartSchema = z.object({
  type: z.enum(["INITIAL", "FOLLOW_UP", "REASSESSMENT"]).default("INITIAL"),
});

const TurnSchema = z.object({
  question: z.string().max(2000),
  answer: z.string().max(2000),
  targetDimension: z.string().max(64).optional(),
  classified: z.unknown().optional(),
});

const CompleteSchema = z.object({
  assessmentId: UUID,
  initial: z.string().max(2000).default(""),
  history: z.array(TurnSchema).max(20).default([]),
  report: z.record(z.string(), z.unknown()),
});

const AbandonSchema = z.object({ assessmentId: UUID });

/** 开始一次检测：确保匿名身份 + 职场周期，并创建 assessment 记录。 */
export const startAssessmentFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => StartSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    try {
      const t = await import("./tracking.server");
      const { anonymousUserId } = await t.ensureAnonymousUser();
      const careerContextId = await t.getOrCreateActiveCareerContext(anonymousUserId);
      const assessmentId = await t.createAssessment({
        anonymousUserId,
        careerContextId,
        type: data.type,
      });
      return { assessmentId, careerContextId, ok: true as const };
    } catch (error) {
      console.warn("startAssessmentFn failed:", (error as Error).message);
      return { assessmentId: null, careerContextId: null, ok: false as const };
    }
  });

/** 检测完成：归档原始问诊 + 结构化诊断 + 首次检测基线快照。 */
export const completeAssessmentFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => CompleteSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const t = await import("./tracking.server");
      const { anonymousUserId } = await t.ensureAnonymousUser();
      const careerContextId = await t.getOrCreateActiveCareerContext(anonymousUserId);
      const report = data.report as unknown as import("../ai/types").Report;

      await t.saveTurns({
        assessmentId: data.assessmentId,
        anonymousUserId,
        initial: data.initial,
        history: data.history,
      });
      const diagnosisId = await t.saveDiagnosis({
        assessmentId: data.assessmentId,
        anonymousUserId,
        careerContextId,
        report,
      });
      const isFirst = !(await t.hasBaseline(careerContextId));
      if (isFirst) {
        await t.saveBaselineSnapshot({
          diagnosisId,
          assessmentId: data.assessmentId,
          anonymousUserId,
          careerContextId,
          report,
        });
      }
      await t.updateAssessmentStatus(data.assessmentId, "completed");
      await t.updateLastActive(anonymousUserId);
      return { ok: true as const, diagnosisId, baselineCreated: isFirst };
    } catch (error) {
      console.warn("completeAssessmentFn failed:", (error as Error).message);
      return { ok: false as const, diagnosisId: null, baselineCreated: false };
    }
  });

/** 用户中途放弃 */
export const abandonAssessmentFn = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => AbandonSchema.parse(input))
  .handler(async ({ data }) => {
    try {
      const t = await import("./tracking.server");
      await t.updateAssessmentStatus(data.assessmentId, "abandoned");
      return { ok: true as const };
    } catch (error) {
      console.warn("abandonAssessmentFn failed:", (error as Error).message);
      return { ok: false as const };
    }
  });

/* ----------------------- 历史记录读取 ----------------------- */

/** 获取当前用户所有已完成的检测列表。 */
export const listHistoryFn = createServerFn({ method: "GET" })
  .handler(async () => {
    try {
      const t = await import("./tracking.server");
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const uid = t.getAnonymousUserId();
      if (!uid) return { items: [] as const, ok: true as const };
      const items = await t.listCompletedAssessments(supabaseAdmin, uid);
      return { items, ok: true as const };
    } catch (error) {
      console.warn("listHistoryFn failed:", (error as Error).message);
      return { items: [] as const, ok: false as const };
    }
  });

/** 获取单个检测的完整详情（含问诊记录与诊断报告）。 */
export const getHistoryDetailFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ assessmentId: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const t = await import("./tracking.server");
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const detail = await t.getAssessmentDetail(
        supabaseAdmin,
        data.assessmentId,
      );
      return { detail, ok: true as const };
    } catch (error) {
      console.warn("getHistoryDetailFn failed:", (error as Error).message);
      return { detail: null, ok: false as const };
    }
  });

/* ----------------------- 分享读取（无需登录） ----------------------- */

/** 通过 assessment ID 获取分享所需的报告数据（不要求登录）。 */
export const getSharedReportFn = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ id: z.string() }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const t = await import("./tracking.server");
      const { supabaseAdmin } = await import(
        "@/integrations/supabase/client.server"
      );
      const report = await t.getSharedReport(supabaseAdmin, data.id);
      return { report, ok: true as const };
    } catch (error) {
      console.warn("getSharedReportFn failed:", (error as Error).message);
      return { report: null, ok: false as const };
    }
  });
