# AI 直播数据分析系统

## 项目概览

对鑫云直播平台（console.clsjcorp.com）每场直播进行全自动数据抓取与多维度AI分析，每30分钟产出片段分析报告，直播结束后产出终场综合分析报告。

### 版本技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL) — 通过 `coze-coding-dev-sdk.getDbUrl()` 获取连接字符串，使用 `pg` 库直接连接
- **AI 模型**: coze-coding-dev-sdk (doubao-seed-2-0-pro)

## 目录结构

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/          # 登录鉴权 API
│   │   │   ├── monitor/status/      # 监控状态 API
│   │   │   ├── monitor/segment/     # 片段分析 API
│   │   │   ├── fetcher/snapshot/    # 数据抓取 API
│   │   │   ├── analysis/run/        # AI分析 API (含SSE流式)
│   │   │   ├── reports/[id]/        # 报告详情 API
│   │   │   ├── sessions/            # 会话列表 API
│   │   │   ├── alerts/              # 实时预警 API
│   │   │   ├── timeline/            # 直播时间轴 API
│   │   │   └── knowledge/           # 知识库 API (feed+import)
│   │   ├── dashboard/               # 前端仪表盘
│   │   │   ├── monitor/             # 直播监控页
│   │   │   ├── reports/             # 分析报告页
│   │   │   ├── timeline/            # 直播时间轴页
│   │   │   ├── alerts/              # 实时预警页
│   │   │   └── settings/            # 系统设置页
│   │   ├── layout.tsx
│   │   └── page.tsx (→ redirect /dashboard)
│   ├── components/ui/               # shadcn/ui 组件
│   ├── hooks/
│   │   └── use-live-analysis.ts     # 核心数据 Hook
│   ├── lib/
│   │   ├── server/
│   │   │   ├── config.ts            # 环境变量与常量配置
│   │   │   ├── auth.ts              # 登录鉴权（验证码OCR+Token管理）
│   │   │   ├── monitor.ts           # 直播监控（状态机+轮询+自动30分钟片段分析+1分钟实时预警）
│   │   │   ├── fetcher.ts           # 数据抓取（8个API+增量逻辑）
│   │   │   ├── analyzer.ts          # AI分析引擎（五维+Skill自优化）
│   │   │   └── report.ts            # Markdown报告生成
│   │   └── utils.ts
│   └── storage/database/
│       ├── supabase-client.ts        # 数据库客户端（DbQueryBuilder，兼容Supabase Client API）
│       ├── local-storage.ts          # re-export supabase-client
│       └── shared/schema.ts          # Drizzle ORM Schema（10+表定义）
├── DESIGN.md                        # 设计风格文档
└── AGENTS.md                        # 本文件
```

## 构建和测试命令

- 安装依赖: `pnpm install`
- 开发环境: `pnpm run dev`
- 类型检查: `pnpm ts-check`
- Lint 检查: `pnpm lint`
- 构建: `pnpm run build`

## 数据库架构

### 存储方式
- 使用 Supabase PostgreSQL，通过 `coze-coding-dev-sdk.getDbUrl()` 获取连接字符串
- `supabase-client.ts` 实现了 `DbQueryBuilder`，镜像 Supabase Client API（`.from().select().eq().single()` 等）
- 自动 camelCase ↔ snake_case 转换（数据库列名 snake_case，前端期望 camelCase）
- **已弃用** localStorage (storage.json 文件)，`local-storage.ts` 仅做 re-export

### 核心数据表

| 表名 | 用途 | 唯一约束 |
|------|------|----------|
| `live_sessions` | 直播场次（idle→recording→analyzing→ended/error） | id (PK) |
| `snapshot_data` | 每30分钟快照数据（观看/评论/订单/新老粉） | id (PK) |
| `analysis_reports` | 五维分析报告（含analysis_json/action_items/alerts等） | id (PK) |
| `live_alerts` | 实时预警（规则引擎+AI分析生成） | id (PK) |
| `live_timeline_events` | 时间轴事件（快照/分析/预警等） | id (PK) |
| `live_metrics_minute` | 分钟级指标（在线/评论/成交等） | id (PK) |
| `analysis_knowledge` | 知识库条目 | (category, dimension, key) |
| `live_scripts` | 主播话术模板 | (session_date, anchor_name) |
| `anchor_profiles` | 主播画像 | id (PK) |
| `system_config` | 系统配置（Token存储、轮询参数） | config_key (UNIQUE) |

### 序列同步
迁移数据后需重置序列：`SELECT setval('表名_id_seq', (SELECT MAX(id) FROM 表名));`

## API 接口清单

| 接口 | 方法 | 用途 |
|------|------|------|
| `/api/auth/login` | POST | 登录鉴权（验证码OCR+preLogin+tenantLogin） |
| `/api/monitor/status` | GET | 获取监控状态概览 |
| `/api/monitor/status` | POST | 手动触发状态轮询 |
| `/api/monitor/segment` | POST | 手动触发片段分析 |
| `/api/fetcher/snapshot` | POST | 手动触发数据抓取 |
| `/api/analysis/run` | POST | 执行AI分析 |
| `/api/analysis/run` | GET | SSE流式AI分析 |
| `/api/sessions` | GET | 获取会话列表 |
| `/api/reports/[id]` | GET | 获取报告详情（JSON/Markdown） |
| `/api/alerts` | GET | 获取实时预警列表 |
| `/api/alerts` | PATCH | 更新预警状态 |
| `/api/timeline` | GET | 获取时间轴数据（事件+指标） |
| `/api/knowledge/feed` | GET | 获取知识库数据（话术+画像） |
| `/api/knowledge/import` | POST | 导入技能包（知识+话术） |

## 自动录制与片段分析

### 工作流程
1. 前端30秒轮询 → GET `/api/monitor/status`
2. 每次轮询时，后端 `checkAndRunScheduledAnalysis()` 检查所有 RECORDING 会话
3. 如果距离 `last_analysis_time` 超过 `snapshotIntervalMinutes`（默认30分钟），自动触发 `runSegmentAnalysis()`
4. `runSegmentAnalysis()` 执行：抓取快照数据 → AI五维分析 → 更新 `last_snapshot_seq` 和 `last_analysis_time`
5. 直播结束时，`endSession()` 执行终场分析后标记 ENDED

### 1分钟实时预警
- `checkAndRunRealtimeAlerts()` 挂载在30秒轮询循环上
- 5条规则引擎实时检测：在线骤降、互动偏低、成交停滞、新粉占比过高、在线激增
- 防重复：最近10条同类型预警不重复生成
- 预警时间使用实际直播偏移（start_time + offsetMinutes）

### 防重复机制
- `runningAnalyses` (Set<number>) 记录正在执行分析的 sessionId，防止同一会话被重复触发

### 前端展示
- 监控页：录制状态卡片（红点录制标识、录制时长、已抓取段数、上次分析时间、下次分析倒计时、分析进度条）
- 概览页：录制中直播卡片（录制标识、时长、下次分析倒计时）
- 轮询日志：自动分析触发时记录 `[自动分析]` 日志

## 鑫云平台 API 说明

### 两套鉴权体系

1. **管理页 Token** (JWT, 72h): 登录流程 获取，用于 api.clsjcorp.com
2. **监播页 LiveToken** (JWT, 7天): createSession 获取，用于 api.xinyuntv.com

### 验证码登录流程

1. GET `/api/oauth/anyTenant/captcha` → 获取验证码图片
2. POST `https://api.leepow.com/verifycode` → OCR 识别
3. POST `/cs/user/preLogin` → 验证码登录
4. POST `/cs/user/tenantLogin` → 获取管理页 Token
5. POST `/live/auth/createSession` → 获取 LiveToken

### 管理页固定请求头

```
Authorization: bGFtcF93ZWJfcHJvOmxhbXBfd2ViX3Byb19zZWNyZXQ=
applicationid: 1
tenantid: 751087375173437746
gray_version: lizhixiang
path: /livemanage/openClassesRoom
```

### liveStatus 枚举

- `STARTING` = 直播中
- `STARTED` = 已结束/未开播

## 代码风格指南

- TypeScript strict 模式
- 禁止隐式 any
- 数据库查询使用 `DbQueryBuilder`（supabase-client.ts），兼容 Supabase Client API 链式调用
- LLM 调用使用 coze-coding-dev-sdk
- 前端使用 shadcn/ui 语义化变量，禁止硬编码颜色
- DbQueryBuilder 不支持 Supabase 的 join 语法（`select('*, rel(cols)')`），需拆成两次查询再手动关联
