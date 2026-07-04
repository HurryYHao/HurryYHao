# AI 直播数据分析系统 - 技术文档

## 1. 系统概述

### 1.1 产品定位

AI 直播数据分析系统针对鑫云直播平台（console.clsjcorp.com）的每一场直播，执行全自动数据抓取与多维度 AI 分析，每 30 分钟产出片段分析报告，直播结束后产出终场综合分析报告。系统以主播为维度进行数据分类，以雅文老师的历史数据作为核心基准，支持跨场次、跨主播的对比分析。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| 自动监控 | 30 秒轮询直播状态，自动检测开播/结束 |
| 数据抓取 | 8 个管理页 API 全量分页抓取，杜绝数据截断 |
| 30 分钟分段录制 | ffmpeg 从 FLV 流录制音频，每 30 分钟自动分段 |
| 音频转写 | ASR 自动将录音转为文字，注入 AI 分析 |
| 五维 AI 分析 | 主播话术 / 互动热度 / 商品转化 / 评论舆情 / 直播节奏 |
| 跨场对比 | 整场分析与同主播前一场对比，标注进步/退步 |
| 核心基准 | 以雅文老师为基准主播，其他主播自动对比基准线 |
| 知识自学习 | 每次分析自动提取知识，换模型后加载知识即理解分析路径 |
| 脚本投喂 | 支持 Excel 投喂历史脚本和商品成交数据 |
| 知识库管理 | 浏览/搜索知识库、AI 对话、数据备份/导出/导入 |

### 1.3 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router, Turbopack) |
| UI | React 19 + shadcn/ui + Tailwind CSS 4 |
| 语言 | TypeScript 5 (strict) |
| 数据库 | Supabase (PostgreSQL) |
| AI 模型 | doubao-seed-2-0-pro (via coze-coding-dev-sdk) |
| ASR | coze-coding-dev-sdk ASRClient |
| 音频录制 | ffmpeg (服务端子进程) |
| 包管理 | pnpm |

---

## 2. 系统架构

```
┌──────────────────────────────────────────────────────┐
│                    前端 (React)                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ 概览页    │ │ 监控页    │ │ 报告页    │ │ 知识库页  │ │
│  │/dashboard│ │/monitor  │ │/reports  │ │/knowledge│ │
│  └─────┬────┘ └─────┬────┘ └─────┬────┘ └─────┬────┘ │
│        │            │            │            │       │
│  ┌─────┴────────────┴────────────┴────────────┴────┐ │
│  │              API Routes (Next.js)                 │ │
│  └──────────────────┬───────────────────────────────┘ │
└─────────────────────┼─────────────────────────────────┘
                      │
┌─────────────────────┼─────────────────────────────────┐
│              后端服务 (Server Side)                     │
│  ┌──────────┐ ┌─────┴────┐ ┌──────────┐ ┌──────────┐ │
│  │ auth.ts  │ │monitor.ts│ │fetcher.ts│ │recorder  │ │
│  │ 验证码    │ │ 状态机    │ │ 8个API   │ │ ffmpeg   │ │
│  │ OCR登录  │ │ 轮询调度  │ │ 分页抓取  │ │ 30min分段│ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐              │
│  │analyzer  │ │report.ts │ │knowledge │              │
│  │ 五维分析  │ │ Markdown │ │ 自学习    │              │
│  │ 跨场对比  │ │ 报告生成  │ │ 知识进化  │              │
│  └──────────┘ └──────────┘ └──────────┘              │
│  ┌──────────────────────────────────────────────┐    │
│  │            Supabase (PostgreSQL)               │    │
│  │  live_sessions / snapshot_data /              │    │
│  │  analysis_reports / analysis_knowledge /      │    │
│  │  live_scripts / skill_versions / system_config│    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

---

## 3. 核心工作流

### 3.1 直播监控与自动录制

```
前端30秒轮询 → GET /api/monitor/status
    │
    ├── pollLiveStatus() 检测直播状态
    │   ├── 检测到开播(liveStatus=STARTING) → startSession()
    │   │   ├── 创建 live_sessions 记录(status=recording)
    │   │   ├── 提取 anchor_name 从 room_name
    │   │   └── autoStartRecording() → ffmpeg 录制
    │   │
    │   └── 检测到结束(liveStatus=STARTED) → endSession()
    │       ├── stopAudioRecording() → 终止 ffmpeg
    │       ├── resetRetryCount()
    │       └── 执行终场分析 → 更新 status=ended
    │
    └── checkAndRunScheduledAnalysis() 检查定时任务
        ├── 检查录制健康(isStreamDead) → 3次失败自动结束会话
        ├── 检查录制中断 → canAutoRestart() 限制重试(3次/10min)
        └── 距上次分析超30分钟 → runSegmentAnalysis()
            ├── fetchAllSnapshotData() 全量抓取
            ├── ASR 转写当前段音频
            └── runAnalysis(segment) → 五维分析
```

### 3.2 数据抓取流程

```
fetchAllSnapshotData(roomId, liveSpaceId)
    │
    ├── fetchNewoldData()          → 新老粉分布
    ├── fetchAnalysis()            → 统计概览
    ├── fetchChartData()           → 分钟级时序数据
    ├── fetchAllComments()         → 全量评论(自动分页)
    ├── fetchAllOrderAnalysisPage() → 全量订单(自动分页)
    ├── fetchAllMemberData()       → 全量学员(自动分页)
    ├── fetchRoomInfo()            → 房间信息
    └── fetchGoodsAnalysis()       → 商品分析
```

**关键设计**：所有列表数据均使用 `fetchAll*` 变体，自动翻页获取全部数据，杜绝截断。

### 3.3 AI 分析流程

```
runAnalysis() / streamAnalysis()
    │
    ├── getPreviousSessionComparison()  → 查找同主播前一场数据
    ├── getAnchorBenchmark()            → 获取核心基准(雅文老师)数据
    ├── getHistoricalContext()          → 匹配历史脚本
    ├── buildKnowledgeContext()         → 加载高置信度知识
    │
    ├── buildAnalysisPrompt()
    │   ├── 当前直播核心指标(成交/场观/人均产值/在线/评论/时长)
    │   ├── 分钟级时间曲线(在线/评论/点击/成交额)
    │   ├── 评论分秒级数据(HH:MM:SS + 内容 + 发送者)
    │   ├── 商品漏斗(点击→下单→已支付→未支付+转化率)
    │   ├── 新老粉≥30min占比
    │   ├── 转录文本(ASR)
    │   ├── 前一场对比数据(整场分析时)
    │   ├── 核心基准对比(非雅文老师时)
    │   └── 历史脚本 + 知识库上下文
    │
    ├── LLMClient.chat() → 生成五维分析
    │
    ├── extractKnowledgeFromAnalysis()  → 从分析提取知识
    ├── mergeKnowledge()               → upsert 知识(置信度管理)
    └── saveScriptFromAnalysis()        → 提取脚本存入 live_scripts
```

### 3.4 音频录制与转写

```
autoStartRecording(roomId, roomName, sessionId, streamUrl)
    │
    ├── resolveStreamUrl() → 三级回退获取 FLV 地址
    │   ├── 1. getRoomParameter() API 查询
    │   ├── 2. 数据库缓存查询
    │   └── 3. 默认构造规则
    │
    ├── ffmpeg -i <flv_url> -t 1800 -vn -acodec libmp3lame <output>
    │   └── 文件名: {roomName}_seg{n}_{HH-mm}.mp3
    │
    ├── 片段完成(code=0):
    │   ├── 清除 retryTracker
    │   ├── 更新 snapshot_data.recording_url
    │   ├── 自动启动下一段
    │   └── 自动触发 ASR 转写
    │
    └── 异常退出(code≠0):
        ├── 累加 retryTracker
        ├── 3次失败 → isStreamDead() → 自动结束会话
        └── canAutoRestart() 检查 → 10分钟内最多3次重启
```

---

## 4. 数据库设计

### 4.1 表结构总览

| 表名 | 用途 | 核心字段 |
|------|------|---------|
| `live_sessions` | 直播场次 | room_id, room_name, anchor_name, status, start_time, end_time |
| `snapshot_data` | 30分钟快照 | session_id, snapshot_seq, watcher_cnt, order_total, recording_url, transcription |
| `analysis_reports` | 分析报告 | session_id, report_type, anchor_name, analysis_text, segment_seq |
| `analysis_knowledge` | 自学习知识库 | category, dimension, key, value, confidence, sample_count |
| `live_scripts` | 直播脚本 | session_date, anchor_name, keywords, content_points, product_list |
| `skill_versions` | Skill版本 | version, content, knowledge_snapshot, is_active |
| `system_config` | 系统配置 | config_key, config_value |

### 4.2 状态机

```
live_sessions.status:
  idle → recording → analyzing → ended
                    ↘ error

转换条件:
  idle → recording    : 检测到开播(liveStatus=STARTING)
  recording → analyzing : 定时30分钟触发片段分析
  analyzing → recording : 分析完成，继续录制
  recording → ended    : 检测到直播结束 / 流失效(isStreamDead)
  * → error           : 登录失败/分析异常
```

### 4.3 主播分类机制

- `anchor_name` 字段自动从 `room_name` 提取（如"7月2号雅文老师闺蜜直播间" → "雅文老师"）
- `analysis_reports.anchor_name` 继承会话的主播名
- 报告页按主播分组展示，雅文老师标记为"核心基准"
- 整场分析自动与同主播前一场对比
- 非雅文老师的主播自动与雅文老师基准数据对比

### 4.4 知识库体系

**类别 (category)**:
| 类别 | 说明 |
|------|------|
| threshold | 阈值标准（如"在线人数>500为优秀"） |
| pattern | 数据模式（如"开播30分钟流量高峰"） |
| benchmark | 基准数据（如"雅文老师场均成交44153元"） |
| rule | 分析规则（如"转化率<2%需重点优化"） |

**维度 (dimension)**: anchor / interaction / conversion / sentiment / rhythm / general

**置信度 (confidence)**: 1-5 分，多次验证的知识置信度递增

---

## 5. API 接口文档

### 5.1 鉴权接口

#### POST /api/auth/login
登录鑫云平台（验证码 OCR + preLogin + tenantLogin）

| 参数 | 类型 | 说明 |
|------|------|------|
| action | string | `status`=查询登录状态, `login`=执行登录 |

**登录流程**:
1. GET 验证码图片 → OCR 识别算术表达式 → 计算结果
2. POST preLogin（验证码验证）→ 获取临时 token
3. POST tenantLogin → 获取管理页 JWT Token（72h 有效）
4. POST createSession → 获取 LiveToken（7天有效）

### 5.2 监控接口

#### GET /api/monitor/status
获取监控状态概览，自动触发 pollLiveStatus()

**响应**:
```json
{
  "success": true,
  "data": {
    "numberAnalysis": { "total": 18, "inStart": 0 },
    "rooms": [{
      "roomId": "100042779",
      "roomName": "7月2号雅文老师闺蜜直播间",
      "liveStatus": "STARTING",
      "online": "1523"
    }],
    "sessions": [{
      "id": 1,
      "status": "recording",
      "anchor_name": "雅文老师"
    }]
  }
}
```

#### POST /api/monitor/status
手动触发状态轮询

#### POST /api/monitor/segment
手动触发片段分析

| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | number | 会话 ID |

### 5.3 数据抓取接口

#### POST /api/fetcher/snapshot
手动触发数据快照抓取

| 参数 | 类型 | 说明 |
|------|------|------|
| roomId | string | 房间 ID |
| sessionId | number | 会话 ID |

#### GET /api/live-data
获取直播实时数据（评论/订单/商品/学员/时序图表）

| 参数 | 类型 | 说明 |
|------|------|------|
| roomId | string | 房间 ID |

**关键处理**:
- 订单过滤：仅显示 `payStatus=SUCCESS`
- 商品漏斗：点击→下单→已支付→未支付+转化率
- 全量分页：评论/订单/学员均自动翻页

### 5.4 AI 分析接口

#### POST /api/analysis/run
执行 AI 分析（非流式）

| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | number | 会话 ID |
| type | string | `segment`=片段分析, `final`=整场分析 |

#### GET /api/analysis/run
SSE 流式 AI 分析

| 参数 | 类型 | 说明 |
|------|------|------|
| sessionId | number | 会话 ID |
| type | string | `segment` / `final` |

**响应格式** (SSE):
```
data: {"content":"分析文本片段1"}

data: {"content":"分析文本片段2"}

data: {"done":true}
```

### 5.5 录制接口

#### GET /api/recorder/status
获取录制状态（所有活跃录制进程）

#### POST /api/recorder/start
手动开始录制

| 参数 | 类型 | 说明 |
|------|------|------|
| roomId | string | 房间 ID |
| roomName | string | 直播间名称 |
| sessionId | number | 会话 ID |

#### POST /api/recorder/stop
手动停止录制

| 参数 | 类型 | 说明 |
|------|------|------|
| roomId | string | 房间 ID |

#### GET /api/recorder/segments
获取录制片段列表

| 参数 | 类型 | 说明 |
|------|------|------|
| roomId | string | 房间 ID |
| roomName | string | 直播间名称 |

#### POST /api/recorder/transcribe
ASR 转写音频

| 参数 | 类型 | 说明 |
|------|------|------|
| audioUrl | string | 音频路径(相对/绝对) |
| sessionId | number | 会话 ID |
| segmentSeq | number | 片段序号 |

**转写策略**: 优先从本地文件读取 base64 发送给 ASR，避免公网 URL 访问问题

### 5.6 会话与报告接口

#### GET /api/sessions
获取会话列表

| 参数 | 类型 | 说明 |
|------|------|------|
| page | number | 页码 (默认 1) |
| pageSize | number | 每页数量 (默认 20) |

#### GET /api/reports/[id]
获取报告详情

| 参数 | 类型 | 说明 |
|------|------|------|
| format | string | `json`=结构化, `markdown`=Markdown文本 |

### 5.7 知识库接口

#### GET /api/knowledge/feed
查询知识/脚本数据

| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | `knowledge`=知识, `scripts`=脚本, `all`=全部 |
| category | string | 按类别筛选 |
| dimension | string | 按维度筛选 |

#### POST /api/knowledge/feed
批量投喂脚本数据

#### DELETE /api/knowledge/feed
删除知识条目

| 参数 | 类型 | 说明 |
|------|------|------|
| id | number | 知识条目 ID |
| type | string | `knowledge` / `script` |

#### POST /api/knowledge/chat
AI 对话（SSE 流式）

| 参数 | 类型 | 说明 |
|------|------|------|
| message | string | 用户消息 |

**机制**: 自动搜索相关知识注入对话上下文

#### GET /api/knowledge/backup
查询上次备份时间

#### POST /api/knowledge/backup
手动备份（知识+脚本存入 system_config）

#### GET /api/knowledge/export
导出数据

| 参数 | 类型 | 说明 |
|------|------|------|
| type | string | `skill`=技能包, `all`=原始数据 |

#### POST /api/knowledge/import
导入数据

---

## 6. 前端页面

### 6.1 页面路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/` | 首页 | 302 重定向到 `/dashboard` |
| `/dashboard` | 概览页 | 直播列表、核心指标、录制状态 |
| `/dashboard/monitor` | 监控页 | 录制控制、状态详情、轮询日志 |
| `/dashboard/live` | 直播详情 | 评论/订单/商品/学员/时序图表 |
| `/dashboard/reports` | 分析报告 | 按主播分类的报告列表+详情 |
| `/dashboard/knowledge` | 知识库 | 知识浏览/脚本查看/AI对话 |
| `/dashboard/settings` | 系统设置 | 登录状态、Token管理 |

### 6.2 侧边栏导航

```
┌─────────────────┐
│ 直播概览         │ → /dashboard
│ 直播监控         │ → /dashboard/monitor
│ 分析报告         │ → /dashboard/reports
│ 知识库           │ → /dashboard/knowledge
│ 系统设置         │ → /dashboard/settings
└─────────────────┘
```

---

## 7. 鑫云平台对接

### 7.1 双套鉴权体系

| 体系 | Token | 有效期 | 用途 | 域名 |
|------|-------|--------|------|------|
| 管理页 | JWT Token | 72h | 统计API、房间管理 | api.clsjcorp.com |
| 监播页 | LiveToken | 7天 | 直播间操作 | api.xinyuntv.com |

### 7.2 登录流程

```
1. GET /api/oauth/anyTenant/captcha → 获取验证码图片
2. OCR 识别验证码（算术表达式 → 计算结果）
3. POST /cs/user/preLogin → 验证码验证
4. POST /cs/user/tenantLogin → 获取管理页 Token
5. POST /live/auth/createSession → 获取 LiveToken
```

### 7.3 管理页固定请求头

```
Authorization: bGFtcF93ZWJfcHJvOmxhbXBfd2ViX3Byb19zZWNyZXQ=
applicationid: 1
tenantid: 751087375173437746
gray_version: lizhixiang
path: /livemanage/openClassesRoom
```

### 7.4 liveStatus 枚举

| 值 | 含义 |
|----|------|
| `STARTING` | 直播中 |
| `STARTED` | 已结束 |
| `NOT_STARTED` | 未开播 |

### 7.5 管理页统计 API 一览

| API 端点 | 用途 |
|----------|------|
| `/api/livemanage/openClassesRoom/findPage` | 直播间列表 |
| `/api/livemanage/openClassesRoom/findNumberAnalysis` | 状态统计 |
| `/api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData` | 新老粉分布 |
| `/api/livemanage/statRoomLiveSpace/anyTenant/getAnalysis` | 统计概览 |
| `/api/livemanage/statRoomLiveSpace/anyTenant/getChartData` | 分钟级时序 |
| `/api/livemanage/statRoomLiveSpace/anyTenant/getMemberData` | 学员数据(分页) |
| `/api/livemanage/statRoomLiveSpace/anyTenant/getCommentData` | 评论数据(分页) |
| `/api/livemanage/statRoomLiveSpace/anyTenant/getOrderAnalysisPage` | 订单数据(分页) |
| `/api/livemanage/statRoomLiveSpace/anyTenant/getGoodsAnalysis` | 商品分析 |
| `/api/livemanage/openClassesRoom/getRoomParameter` | 房间参数(含流地址) |

---

## 8. AI 分析 Prompt 结构

### 8.1 片段分析 (segment)

```
1. 当前直播核心指标
   ├── 成交总额 / 累计观看(场观) / 人均产值
   ├── 在线人数 / 评论数 / 评论人数
   ├── 平均在线 / 直播时长
   └── 新老粉≥30min占比

2. 时间曲线数据（分钟级）
   在线/评论/点击/成交额 趋势

3. 商品漏斗数据
   点击→下单→已支付→未支付 + 各环转化率

4. 评论分秒级数据
   HH:MM:SS + 内容 + 发送者类型

5. 转录文本（ASR）

6. 五维分析要求
   ├── 主播话术：开场/产品介绍/逼单/互动话术
   ├── 互动热度：峰值时段、互动类型分布
   ├── 商品转化：漏斗分析、流失环节
   ├── 评论舆情：情绪分布、高频词Top30、负面预警
   └── 直播节奏：流量波动、话术与数据交叉分析

7. 历史脚本 + 知识库上下文
```

### 8.2 整场分析 (final)

在片段分析基础上追加：

```
8. 前一场对比
   ├── 成交总额变化 + 百分比
   ├── 场观变化 + 人均产值对比
   ├── 在线/评论/转化率对比
   └── 五维对比表格 + 进步/退步分析

9. 核心基准对比（非雅文老师时）
   ├── 与雅文老师的差距
   ├── 基准线偏差分析
   └── 改进方向

10. 完整转录脚本（全量拼接）
```

---

## 9. 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `COZE_SUPABASE_URL` | Supabase 项目 URL | - |
| `COZE_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | - |
| `XINYUN_PHONE` | 鑫云平台手机号 | 19267482243 |
| `XINYUN_PASSWORD` | 鑫云平台密码 | Tycm@123 |
| `XINYUN_TENANT_ID` | 租户 ID | 751087375173437746 |
| `POLL_INTERVAL_SECONDS` | 前端轮询间隔(秒) | 30 |
| `SNAPSHOT_INTERVAL_MINUTES` | 片段分析间隔(分钟) | 30 |
| `LOGIN_RETRY_MAX` | 登录重试次数 | 3 |
| `TOKEN_REFRESH_THRESHOLD_SECONDS` | Token 刷新提前量(秒) | 300 |
| `COZE_PROJECT_DOMAIN_DEFAULT` | 对外访问域名 | - |
| `DEPLOY_RUN_PORT` | 服务监听端口 | 5000 |
| `COZE_PROJECT_ENV` | 环境标识 DEV/PROD | DEV |

---

## 10. 部署与运维

### 10.1 构建命令

```bash
pnpm install        # 安装依赖
pnpm run build      # 生产构建
pnpm run start      # 生产启动
pnpm ts-check       # TypeScript 类型检查
pnpm lint           # ESLint 检查
```

### 10.2 开发环境

```bash
pnpm run dev        # 开发模式（HMR 自动热更新）
```

### 10.3 录音文件存储

- 开发环境：`${COZE_WORKSPACE_PATH}/public/recordings/`
- 生产环境：`/tmp/recordings/`（临时目录，需定期清理或迁移至对象存储）

### 10.4 知识库数据持久化

- 自动备份：知识库数据自动备份到 `system_config` 表（`config_key='knowledge_backup'`）
- 生产初始化：`knowledge-seed.ts` 检查知识库为空时自动从备份恢复
- 手动备份：POST `/api/knowledge/backup`
- 数据导出：GET `/api/knowledge/export?type=skill` → 技能包 JSON

### 10.5 健康检查

- 数据库连接：`health_check` 表
- 服务探活：GET `/api/monitor/status`
- 日志路径：`/app/work/logs/bypass/<project>/app.log`

---

## 11. 关键设计决策

### 11.1 全量分页抓取

所有列表类 API 均使用 `fetchAll*` 变体，自动翻页获取全部数据：
- `fetchAllComments()` — 全量评论
- `fetchAllOrderAnalysisPage()` — 全量订单
- `fetchAllMemberData()` — 全量学员

### 11.2 录制中断保护

- retryTracker 机制：10 分钟内最多自动重启 3 次
- isStreamDead：连续 3 次录制失败且 5 分钟内 → 视为流已失效
- 片段完成才清除重试计数（不在 spawn 时清除，因 ffmpeg 可能异步 404）

### 11.3 ASR 本地优先

转写音频时优先从本地文件读取 base64 发送，而非依赖公网 URL：
- 避免中文文件名 URL 编码问题
- 避免公网域名访问超时
- 回退：本地文件不存在时使用 URL 模式

### 11.4 Supabase 客户端懒加载

所有 API 路由使用懒加载模式创建 Supabase 客户端，避免构建时（无环境变量）报错：

```typescript
let _db: ReturnType<typeof getSupabaseClient> | null = null;
function getDb() {
  if (!_db) _db = getSupabaseClient();
  return _db;
}
```

### 11.5 防重复分析

`runningAnalyses` (Set\<number\>) 记录正在执行分析的 sessionId，防止同一会话被重复触发。

---

## 12. 数据安全

- Token 存储在 `system_config` 表，生产环境通过环境变量注入
- 管理页 Authorization 为 Base64 编码的 OAuth2 客户端凭证
- 日志中禁止输出密钥、token、密码等敏感信息
- Supabase 使用 service_role_key（RLS 公开读写）

---

## 13. 目录结构

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/login/          # 登录鉴权 API
│   │   │   ├── monitor/status/      # 监控状态 API
│   │   │   ├── monitor/segment/     # 片段分析 API
│   │   │   ├── fetcher/snapshot/    # 数据抓取 API
│   │   │   ├── analysis/run/        # AI分析 API (含SSE流式)
│   │   │   ├── live-data/           # 实时数据 API
│   │   │   ├── reports/[id]/        # 报告详情 API
│   │   │   ├── sessions/            # 会话列表 API
│   │   │   ├── recorder/            # 录制控制 API
│   │   │   │   ├── start/           # 开始录制
│   │   │   │   ├── stop/            # 停止录制
│   │   │   │   ├── status/          # 录制状态
│   │   │   │   ├── segments/        # 片段列表
│   │   │   │   └── transcribe/      # ASR转写
│   │   │   └── knowledge/           # 知识库 API
│   │   │       ├── feed/            # 投喂/查询
│   │   │       ├── chat/            # AI对话(SSE)
│   │   │       ├── backup/          # 备份
│   │   │       ├── export/          # 导出
│   │   │       └── import/          # 导入
│   │   ├── dashboard/               # 前端页面
│   │   │   ├── page.tsx             # 概览页
│   │   │   ├── monitor/             # 监控页
│   │   │   ├── live/                # 直播详情页
│   │   │   ├── reports/             # 分析报告页
│   │   │   ├── knowledge/           # 知识库页
│   │   │   └── settings/            # 系统设置页
│   │   ├── layout.tsx
│   │   └── page.tsx (→ redirect /dashboard)
│   ├── components/
│   │   ├── ui/                      # shadcn/ui 组件
│   │   └── dashboard/
│   │       └── server-audio-recorder.tsx  # 录制控制组件
│   ├── hooks/
│   │   └── use-live-analysis.ts     # 核心数据 Hook
│   ├── lib/
│   │   ├── server/
│   │   │   ├── config.ts            # 环境变量与常量
│   │   │   ├── auth.ts              # 登录鉴权(OCR+Token)
│   │   │   ├── monitor.ts           # 状态机+轮询+调度
│   │   │   ├── fetcher.ts           # 数据抓取(8API+分页)
│   │   │   ├── recorder.ts          # ffmpeg录制+分段+重试
│   │   │   ├── analyzer.ts          # AI分析+对比+知识提取
│   │   │   ├── report.ts            # Markdown报告生成
│   │   │   └── knowledge-seed.ts    # 生产环境数据初始化
│   │   └── utils.ts
│   └── storage/database/
│       ├── supabase-client.ts        # Supabase 客户端(懒加载)
│       └── shared/schema.ts          # 数据库 Schema
├── public/
│   └── recordings/                   # 音频录制文件
├── DESIGN.md                         # 设计规范
├── AGENTS.md                         # 工程规范
└── SYSTEM_DOC.md                     # 本文档
```
