# XRay_v1.0-rc1

| 字段 | 值 |
|------|-----|
| 版本名 | `XRay_v1.0-rc1` |
| Git Tag | `XRay_v1.0-rc1` |
| Commit | `c56a93489612a0463f9edd2810a58bd8806b107f` |
| 标签时间 (UTC) | 2026-08-07T08:03:31Z |
| Build 方式 | `vite build` (TanStack Start SSR) |
| 运行时 | Node.js 22.22.2 |
| 启动方式 | `node .output/server/index.mjs` |
| 数据库 | Supabase (PostgreSQL) |
| AI 引擎 | Cloudflare Workers AI (主) / 本地引擎 (fallback) |
| 部署目标 | 自托管 Node 服务器 / VPS |

## RC 验收结果

| 范围 | 结果 |
|------|------|
| 核心主链路（quick 5轮 / deep 10轮 / 历史 / 重扫） | ✅ PASS |
| 报告品质（6 场景 × 2 模式） | ✅ PASS |
| 390px 移动端 | ✅ PASS |
| 分享 / PDF | ✅ PASS |
| 隐私与边界 | ✅ PASS |
| RC 阻断 | 无 |

## 冻结规则

自 XRay_v1.0-rc1 起，**不再新增功能**。仅允许修改：
- RC Blocker（阻断性 bug）
- 隐私 / 安全问题
- 明显文案错误
