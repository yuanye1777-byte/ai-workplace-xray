import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

function loadEnv() {
  const envPath = path.resolve(import.meta.dirname, "../.env");
  const text = fs.readFileSync(envPath, "utf8");
  const env = {};
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)="(.+)"$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function main() {
  // 获取最新 4 个边界测试报告
  const { data, error } = await supabase
    .from("assessments")
    .select("id, created_at, diagnoses(conclusion, report_data)")
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) throw error;

  for (const item of data || []) {
    const diag = Array.isArray(item.diagnoses) ? item.diagnoses[0] : item.diagnoses;
    if (!diag?.report_data) continue;
    const r = diag.report_data;
    console.log(`\n═══════════════════════════════════════`);
    console.log(`ID: ${item.id}`);
    console.log(`时间: ${item.created_at}`);
    console.log(`结论: ${r.headline || diag.conclusion || "(无)"}`);
    console.log(`\n[最容易误判的地方] ${r.misjudgment || "(无)"}`);
    console.log(`\n[AI 逻辑推断] ${(r.inferences || []).join(" / ") || "(无)"}`);
    console.log(`\n[未验证假设] ${(r.openAssumptions || []).join(" / ") || "(无)"}`);
  }
}

main().catch(console.error);
