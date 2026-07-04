---
AIGC:
    Label: "1"
    ContentProducer: 001191440300708461136T1XGW3
    ProduceID: 4a7fccb9e4f6f1ff830afdb2242e9356_ddefe51175fb11f19641525400d9a7a1
    ReservedCode1: YKkrNyzcv1ucO7B9uD8stTKNMFPbaIiE+wrJbd1zAoxsqlFLZtZSKVDVEQgVVH/U6oYe7KBp28RTLcb6ckRRo432bHZ9qUI/+bg7q6IlyD3g+6f5VFJs5GGPHMoFhpNos4bz0G9Zb/fi2tEzq5qz37cEepeFzu24uTS3+5JG6VVeusoQ9nCCM2cIq/8=
    ContentPropagator: 001191440300708461136T1XGW3
    PropagateID: 4a7fccb9e4f6f1ff830afdb2242e9356_ddefe51175fb11f19641525400d9a7a1
    ReservedCode2: YKkrNyzcv1ucO7B9uD8stTKNMFPbaIiE+wrJbd1zAoxsqlFLZtZSKVDVEQgVVH/U6oYe7KBp28RTLcb6ckRRo432bHZ9qUI/+bg7q6IlyD3g+6f5VFJs5GGPHMoFhpNos4bz0G9Zb/fi2tEzq5qz37cEepeFzu24uTS3+5JG6VVeusoQ9nCCM2cIq/8=
---

# AI 直播数据分析系统 — 设计文档

> 版本: v1.4 | 日期: 2026-07-02 | 目标平台: 鑫云直播 (console.clsjcorp.com)

---

## 一、系统概述

### 1.1 目标

对鑫云直播平台每场直播进行全自动录制、数据抓取与多维度分析，每半小时产出片段分析报告，直播结束后产出终场综合分析报告。内置自优化的直播分析 Skill，分析能力随使用持续迭代。

### 1.2 核心能力

| 能力 | 说明 |
|------|------|
| 自动监控 | 轮询直播列表 API，检测到开播自动启动全流程 |
| 音频录制 | 云端双路并行（TRTC SDK 主路 + 无头浏览器备路），30 分钟分段 |
| 定时抓取 | 每 30 分钟拉取评论/商品成交/观看数据等 API |
| 语音转文字 | faster-whisper medium 本地转写，超时自动切腾讯云 ASR |
| 五维分析 | 主播话术 / 互动热度 / 商品转化 / 评论舆情 / 直播节奏 |
| Skill 自优化 | 每次分析后评估并更新分析 Skill |
| 记忆文档 | SQLite 结构化存储 + Markdown 可读报告 + COS 云同步 |

---

## 二、系统架构

```
┌─────────────────────────────────────────────────────────┐
│               Celery Beat 调度引擎                        │
│   ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│   │ 状态轮询  │  │ 半小时触发│  │ 终场触发           │    │
│   │ (每30s)  │  │ (开播后)  │  │ (检测到下播)       │    │
│   └────┬─────┘  └────┬─────┘  └────────┬───────────┘    │
└────────┼─────────────┼─────────────────┼────────────────┘
         │             │                 │
         ▼             ▼                 ▼
┌────────────────┐ ┌──────────────┐ ┌──────────────┐
│  录制模块(双路) │ │  抓取模块     │ │  分析引擎     │
│  TRTC SDK 主路 │ │  API 数据     │ │  Whisper+    │
│  浏览器录制备路 │ │  增量入库     │ │  Marvis Skill│
└───────┬────────┘ └──────┬───────┘ └──────┬───────┘
        │                 │                │
        └─────────────────┼────────────────┘
                          ▼
              ┌─────────────────────┐
              │      数据层          │
              │  SQLite 结构化存储   │
              │  Markdown 分析报告   │
              │  腾讯云 COS 同步     │
              └─────────────────────┘
```

### 2.1 技术栈

| 层级 | 技术选型 |
|------|---------|
| 后端框架 | FastAPI |
| 任务队列 | Celery + Redis |
| 定时调度 | Celery Beat |
| 数据库 | SQLite |
| 录制引擎 | FFmpeg |
| 语音转文字 | faster-whisper medium（本地），超时切换腾讯云 ASR |
| 云存储 | 腾讯云 COS |
| 分析引擎 | Marvis（混元 + DeepSeek）+ 自迭代 Skill |

---

## 三、模块详细设计

### 3.1 直播监控与调度模块

#### 状态机

```
空闲 ──[检测到开播]──▶ 录制中 ──[每30min]──▶ 片段分析中
                          │
                          └──[检测到下播]──▶ 终场分析中 ──▶ 空闲
```

#### 组件

| 组件 | 职责 | 实现 |
|------|------|------|
| 状态轮询器 | 每 30s 调用直播列表 API，检测开播/下播状态 | Celery Beat `cron_task` |
| 任务编排器 | 开播→启动录制+抓取；下播→终场分析 | Celery `chain` |
| 半小时触发器 | 从开播时刻起，每 30 分钟触发片段分析 | Celery `countdown` |

#### 关键规则

- 轮询间隔 30s，避免对平台 API 造成压力
- **liveStatus 枚举**：`STARTING`=直播中，`STARTED`=已结束/未开播（仅两个值）
- 支持同时监控多场直播，每个 roomId 独立状态机
- 网络异常或 API 故障自动重试 3 次，间隔 10s
- 连续失败 3 次则标记异常并告警

---

### 3.2 录制模块（双路并行）

#### 方案选型

云端部署，无法捕获本地声卡。平台播放走 WebRTC/TRTC，不支持 RTMP/FLV/HLS 拉流。采用双路录制互为备份：

- **主路（TRTC SDK）**：通过腾讯云 TRTC SDK 进入房间，只订阅远端音频流。纯后端，资源低。
- **备路（无头浏览器）**：Playwright 无头浏览器打开监播页面，捕获 `<video>` 元素音频输出。

双路同时运行，任意一路先产出 30 分钟音频文件即触发分析，另一路文件同时保留用于交叉校验。

#### 主路：TRTC SDK 录制

```python
# 核心流程
1. POST api.xinyuntv.com/api/livebiz/openClassesRoom/assistant/public/createSession
   Body: {"roomId": "{roomId}"}
   → 返回 data.sessionToken（LiveToken）
2. GET api.xinyuntv.com/api/livebiz/openClassesRoom/assistant/public/getRoomParameter
   Headers: LiveToken: {sessionToken}, gray_version: PROD
   Params: roomId={roomId}
   → 返回 data.trtc{sdkAppId, userId, userSig, roomId}
3. TRTC SDK 进房（只订阅远端音频，不进视频）
4. 音频回调 → PCM buffer → ffmpeg 管道 → AAC 分段文件
```

| 参数 | 来源 |
|------|------|
| sdkAppId | `GET getRoomParameter?roomId={roomId}` 返回 `data.trtc.sdkAppId` |
| roomId | 同上 `data.trtc.roomId` |
| userId | 同上 `data.trtc.userId` |
| userSig | 同上 `data.trtc.userSig`（JWT，需每次进房重新获取） |

#### 备路：无头浏览器录制

```python
# 核心流程
1. Playwright Chromium 无头模式打开监播页面
2. 注入 LiveToken 鉴权（Cookie）
3. 等待 <video> 元素开始播放
4. 通过浏览器 AudioContext / MediaStream 捕获音频
5. 写入文件，30 分钟分段
```

#### 双路协作规则

```
TRTC SDK ──→ 音频文件 A ──┐
                          ├──→ 任意先完成 → 触发分析
浏览器录制 ──→ 音频文件 B ──┘
                          │
                          └──→ 两路都完成 → 交叉校验音质 → 归档较优版本
```

#### 文件管理

- 录制路径: `data/recordings/{roomId}/{date}/`
- 文件命名: `{roomId}_{YYYYMMDD}_{seq}_{src}.m4a`（src=trtc/browser）
- 终场分析完成后保留较优版本，另一版本可清理

---

### 3.3 数据抓取模块

**全部数据从管理页统计模块（api.clsjcorp.com）获取**，使用 JWT Token + 固定请求头鉴权。

| 抓取项 | API 路径 | 方法 | 频率 | 数据用途 |
|--------|---------|------|------|---------|
| 新老粉分布 | `/api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData` | POST | 每 30min | 新粉/老粉转化率与支付人数 |
| 统计概览 | `/api/livemanage/statRoomLiveSpace/anyTenant/getAnalysis` | POST | 每 30min | 新学员占比与平均观看时长 |
| 时序图表 | `/api/livemanage/statRoomLiveSpace/anyTenant/getChartData` | POST | 每 30min | 分钟级在线/互动/营销/订单趋势 |
| 学员列表 | `/api/livemanage/statRoomLiveSpace/anyTenant/getMemberData` | POST | 每 30min | 学员分页明细（含观看时长） |
| 评论消息 | `/api/livemanage/imMessage/page` | POST | 每 30min | 评论内容+身份（需按过滤规则筛选） |
| 订单汇总 | `/api/livemanage/order/getOrderAnalysis` | POST | 每 30min | 总成交数据 |
| 订单明细 | `/api/livemanage/order/getOrderAnalysisPage` | POST | 每 30min | 各商品成交明细 |

**path 请求头**：统计页 API 使用 `path: /livemanage/openClassesRoom/analysis/{roomId}`。

#### 增量抓取策略

- 所有分页 API 按 `createdTime` / `payTime` / `msgTimestamp` 过滤，只取上次抓取之后的新数据
- 上次抓取时间戳记录在 `snapshot_data` 表中
- 原始 JSON 响应同时归档到 `data/raw/{roomId}/{snapshotTime}/` 目录

#### 容错

- 单次请求超时 30s
- 失败重试 2 次
- 仍失败则在分析报告中标记该时段数据缺失

---

### 3.4 分析引擎

#### 3.4.1 音频转文字

```
30分钟音频 → faster-whisper medium → 带时间戳文本
                  ↓ 耗时 > 15min
            腾讯云 ASR → 带时间戳文本
```

- 输出格式: 带时间戳的 JSON（`[{start, end, text}]`）
- 超时机制: 启动 Whisper 后，15 分钟内未完成则终止进程，切换腾讯云 ASR
- 结果缓存: 转写文本存入 `data/transcripts/{roomId}/{seq}.json`

#### 3.4.2 五维分析框架

每次分析（片段/终场）统一按五个维度输出：

| 维度 | 分析内容 | 主要数据源 |
|------|---------|-----------|
| **主播话术** | 开场/过渡/卖点/逼单/收尾的话术结构；高频词与口头禅；语速与情绪波动；痛点描述与挖掘深度；产品使用场景还原度；主播共情力与感染力评分 | 转写文本 |
| **互动热度** | 评论量/在线人数时间曲线；互动率（评论数/在线人数）；高峰低谷拐点 | `getChartData` |
| **商品转化** | 各商品成交分析；客单价分布；爆款与滞销识别；与话术的时间关联；观看→下单→支付漏斗；新粉/老粉转化率对比与新老粉支付人数（直接使用 `getNewoldData` 的 `nconversionRate` / `oconversionRate` / `ntransactionUserCnt` / `otransactionUserCnt` 字段）；新老粉观看 ≥30min 占比 | `getOrderAnalysisPage` + `getNewoldData` |
| **评论舆情** | 真实用户情绪正负面；高频关键词云（去除水词：纯数字、无意义重复词等）；价格/质量/物流类问题归类；负面预警；观众核心诉求提取与归类 | `imMessage/page`（过滤 role≠真人） |
| **直播节奏** | 流量高峰低谷时段标注；话术-数据涨跌交叉分析；各环节时间占比；主播成交节奏分析（话术与下单峰值的时间关联）；改进建议 | 所有数据交叉 |

#### 3.4.3 Skill 自优化循环

```
分析完成
  → 评估本次分析质量（有无新洞察？有无遗漏？）
  → 若有新有效分析角度 → 追加到 Skill
  → 若某维度连续 3 次无产出 → 降权或移除
  → 版本号 +1，保存新版 Skill
```

Skill 存储: `skills/live_analysis_v{N}.md`

Skill 文件结构:
```markdown
# 直播分析 Skill v{N}

## 分析框架
[五维分析的具体指令和评分标准]

## 历史最佳实践
[从以往有效分析中沉淀的提问角度和洞察模板]

## 版本演进
- v1: 初始框架
- v2: 新增 XXX 分析角度（来自 2026-07-05 场次）
```

---

### 3.5 记忆文档与存储

#### 3.5.1 SQLite 表结构

```sql
-- 直播场次
CREATE TABLE live_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    room_name TEXT,
    start_time DATETIME NOT NULL,
    end_time DATETIME,
    status TEXT DEFAULT 'recording',  -- recording/ended/error
    stream_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 半小时快照数据
CREATE TABLE snapshot_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES live_sessions(id),
    snapshot_seq INTEGER,             -- 第几个半小时
    snapshot_time DATETIME,
    watcher_cnt INTEGER,
    comment_cnt INTEGER,
    online_user_cnt INTEGER,
    order_total DECIMAL,
    order_count INTEGER,
    raw_json TEXT,                    -- 完整 API 原始响应
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 分析报告
CREATE TABLE analysis_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER REFERENCES live_sessions(id),
    report_type TEXT DEFAULT 'segment', -- segment/final
    segment_seq INTEGER,              -- 片段序号，final 时为 0
    analysis_text TEXT,               -- 完整分析文本
    skill_version TEXT,               -- 使用的 Skill 版本
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 3.5.2 Markdown 记忆文档

存储路径: `output/reports/{YYYY-MM-DD}/{roomId}_{roomName}.md`

文档结构:
```markdown
# 直播分析：{roomName} - {date}

## 基础信息
- 直播ID: {roomId}
- 开播时间: {startTime}
- 下播时间: {endTime}
- 总时长: {duration}

## 每半小时分析

### [14:00-14:30] 片段分析 ①
[五维分析内容]

### [14:30-15:00] 片段分析 ②
[五维分析内容]

...

## 终场综合分析
[整场直播的全局五维分析 + 趋势总结 + 改进建议]

## Skill 迭代记录
- 本场使用: v{N}
- 本场更新: [如有变化]
```

#### 3.5.3 腾讯云 COS 同步

- 同步内容: SQLite 数据库 + Markdown 报告
- 同步时机: 每次片段分析完成后异步上传，终场分析完成后全量上传
- 目录结构: `ai-live-analysis/{date}/{roomId}/`
- 保留策略: 本地保留最近 30 天，COS 长期保留

---

## 四、API 确认清单

### 4.1 登录鉴权（先于所有 API 调用）

#### 验证码登录流程（grantType: CAPTCHA）

| 步骤 | API | 说明 |
|------|-----|------|
| 1 | `GET /api/oauth/anyTenant/captcha?key={key}&_t={timestamp}` | 获取验证码图片；`key` 为 `xinyun_sync_` 前缀的 32 位随机串，`_t` 为当前时间戳（ms） |
| 2 | `POST https://api.leepow.com/verifycode` | OCR 识别验证码；Body: `{"image": "base64图片"}`；返回识别结果字符串 |
| 3 | `POST https://api.clsjcorp.com/api/oauth/anyTenant/preLogin` | 验证码登录请求；Body: `{"username": "19267482243", "password": "Tycm@123", "grantType": "CAPTCHA", "key": "{captchaKey}", "code": "{识别结果}"}`；返回 `uuid` |
| 4 | `POST https://api.clsjcorp.com/api/oauth/anyTenant/tenantLogin` | 选租户登录；Body: 上述字段 + `uuid`（preLogin 返回）+ `tenantId: "751087375173437746"`；返回 `token`（JWT） |
| 5 | `POST https://api.xinyuntv.com/api/livebiz/openClassesRoom/assistant/public/createSession` | **仅 TRTC 录制用**：获取 LiveToken；Body: `{"roomId": "{roomId}"}`；返回 `data.sessionToken` |

**验证码解析规则（parseCaptcha）**：去掉识别结果中等号（`=`）后面的内容，对剩余字符串计算二元表达式，将计算结果作为最终验证码提交。

**登录请求头固定值**：
```
Authorization: bGFtcF93ZWJfcHJvOmxhbXBfd2ViX3Byb19zZWNyZXQ=
applicationid: 1
tenantid: 751087375173437746
```

**验证码登录重试**：最多重试 3 次，3 次均失败则告警并终止本次登录流程。

**两套 Token**：管理页数据 API 用 Token（JWT，72h）+ 固定请求头；TRTC 录制用 LiveToken（通过 createSession 获取）。

#### Token 管理策略

| 策略项 | 说明 |
|--------|------|
| Token 有效期 | 72 小时（来自 `tenantLogin` 响应的 JWT） |
| 提前刷新阈值 | 距离过期前 5 分钟触发自动刷新（重新执行验证码登录流程） |
| 验证码登录重试 | 最多重试 3 次，3 次均失败则告警并终止本次登录流程 |
| 刷新失败处理 | 刷新失败时立即重新执行完整登录流程（验证码获取 → OCR → preLogin → tenantLogin） |

### 4.2 调度与录制

| API | 域名 | 用途 | 鉴权 |
|-----|------|------|------|
| `POST /api/livemanage/openClassesRoom/findPage` | api.clsjcorp.com | 直播列表分页，含 liveStatus（`STARTING`=直播中，`STARTED`=已结束） | 管理页请求头 |
| `POST /api/livemanage/openClassesRoom/findNumberAnalysis` | api.clsjcorp.com | 各状态统计（total/inStart/notStart） | 管理页请求头 |
| `POST /api/livebiz/openClassesRoom/assistant/public/createSession` | **api.xinyuntv.com** | 获取 LiveToken；Body: `{"roomId": "{roomId}"}`；返回 `data.sessionToken` | LiveToken（首次可不传） |
| `GET /api/livebiz/openClassesRoom/assistant/public/getRoomParameter` | **api.xinyuntv.com** | **TRTC 进房参数**；Params: `roomId={roomId}`；返回 `data.trtc{sdkAppId, userId, userSig, roomId}` | LiveToken |

**管理页 API 请求头（所有 api.clsjcorp.com 请求均需携带）**：

| Header | 值 | 说明 |
|--------|-----|------|
| `Authorization` | `bGFtcF93ZWJfcHJvOmxhbXBfd2ViX3Byb19zZWNyZXQ=` | 固定值（登录接口除外，登录时使用此值） |
| `applicationid` | `1` | 固定值 |
| `tenantid` | `751087375173437746` | 固定值 |
| `token` | `{JWT}` | 来自 `tenantLogin` 响应的 JWT |
| `gray_version` | `lizhixiang` | 固定值 |
| `path` | `/livemanage/openClassesRoom` | lamp-cloud 权限路径 |
| `Referer` | `https://console.clsjcorp.com/` | 固定值 |
| `Origin` | `https://console.clsjcorp.com` | 固定值 |

#### 4.2.1 管理页 API 请求体格式

**findPage**（直播列表分页）：
```json
POST /api/livemanage/openClassesRoom/findPage
Body: {"model": {}, "extra": {}, "current": 1, "size": 20}
```

**findNumberAnalysis**（各状态统计）：
```json
POST /api/livemanage/openClassesRoom/findNumberAnalysis
Body: {"intelligence": false, "page": 1, "pageSize": 20}
```

**selectOptions**（获取直播场次列表）：
```
GET /api/livemanage/roomLiveSpace/selectOptions?roomId={roomId}
Params: roomId
```

### 4.3 TRTC 录制（xinyuntv.com）

**注意**：xinyuntv.com 仅用于 TRTC 录音，数据抓取已全部迁移到管理页统计模块（§4.4）。

| API | 用途 | 鉴权 |
|-----|------|------|
| `GET /api/livebiz/openClassesRoom/assistant/public/getRoomParameter?roomId={roomId}` | 获取 TRTC 进房参数（sdkAppId / userSig / roomId） | LiveToken |
| `POST /api/livebiz/openClassesRoom/assistant/public/createSession` | 创建会话，获取 LiveToken（JWT） | — |

LiveToken 通过 createSession 获取，7 天有效。

### 4.4 数据抓取（管理页 — 统计模块 — api.clsjcorp.com）

**全部数据从管理页统计模块获取**，使用 JWT Token + 固定请求头鉴权，path 头值为 `/livemanage/openClassesRoom/analysis/{roomId}`。

#### 4.4.1 核心统计 API

| API | 路径 | 用途 | Method |
|-----|------|------|--------|
| **getAnalysis** | `/api/livemanage/statRoomLiveSpace/anyTenant/getAnalysis` | 数据总览：新学员占比 `nproportion`、新学员平均观看时长 `navgWatchTimeSeconds`、新学员观看人数 `nwatcherCnt` | POST |
| **getChartData** | `/api/livemanage/statRoomLiveSpace/anyTenant/getChartData` | 分钟级时序数据（在线/互动/营销/订单趋势） | POST |
| **getNewoldData** | `/api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData` | 新老学员分布：转化率、支付人数、访问人数、≥30min 人数 | POST |
| **getMemberData** | `/api/livemanage/statRoomLiveSpace/anyTenant/getMemberData` | 学员分页列表（含观看时长） | POST |

#### 4.4.2 评论 API

| API | 路径 | 用途 |
|-----|------|------|
| **imMessage/page** | `/api/livemanage/imMessage/page` | 评论列表（含 identity 字段，需按过滤规则筛选） | POST |

评论过滤规则：`msgType=TEXT` + `examineState=EXAMINE_OK` + `role=AUDIENCE` + `videoScript=false` + `amuseOneself=false`。评论文本从 `msgBody.body` JSON 取 `content`。

**身份字段速查**：

| 字段 | 路径 | 含义 | 分析用途 |
|------|------|------|---------|
| `role` | `msgBody.serverExtension.role` | `AUDIENCE`=真人观众 | 真人识别 |
| `newUser` | `msgBody.serverExtension.newUser` | 是否新用户（首次进入直播间） | 新粉识别 |

#### 4.4.3 订单 API

| API | 路径 | 用途 |
|-----|------|------|
| **getOrderAnalysis** | `/api/livemanage/order/getOrderAnalysis` | 订单汇总数据 |
| **getOrderAnalysisPage** | `/api/livemanage/order/getOrderAnalysisPage` | 订单明细分页 |

#### 4.4.4 辅助数据 API

| 模块 | 路径 | 端点 |
|------|------|------|
| 礼物记录 | `/api/livemanage/roomGiftSendLog/anyTenant/` | `selectOptions`(GET), `getTotal`(POST), `page`(POST) |
| 红包记录 | `/api/livemanage/roomLiveModTaskRewards/anyTenant/` | `getRedPacketAmountTotal`(POST), `page`(POST) |
| 操作日志 | `/api/livelog/livelog/anyone/` | `getModules`(GET), `page`(POST) |
| 场次选项 | `/api/livemanage/roomLiveSpace/selectOptions` | GET, params: `roomId` |

**getNewoldData 字段速查**：

| API 字段 | 页面含义 |
|---------|---------|
| `nwatcherCnt` | 新学员访问人数 |
| `ntransactionUserCnt` | 新学员支付人数 |
| `nconversionRate` | 新学员支付转换率（%） |
| `nwatcher30Cnt` | 新学员观看 ≥30min 人数 |
| `ntotalWatchTimeSeconds` | 新学员总观看时长（秒） |
| `owatcherCnt` | 老学员访问人数 |
| `otransactionUserCnt` | 老学员支付人数 |
| `oconversionRate` | 老学员支付转换率（%） |
| `owatcher30Cnt` | 老学员观看 ≥30min 人数 |

### 4.5 部署环境

- 部署方式: 云端服务器（Linux）
- Python: 3.11+
- 依赖安装: 清华镜像源 (`-i https://pypi.tuna.tsinghua.edu.cn/simple`)

### 4.6 启动方式

```bash
# 启动 Redis (如果未运行)
redis-server

# 启动 Celery Worker
celery -A app.celery_app worker -l info -P solo

# 启动 Celery Beat 调度器
celery -A app.celery_app beat -l info

# 启动 FastAPI (可选，用于管理面板)
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

---

## 六、项目目录结构

```
ai_live_analysis/
├── app/
│   ├── __init__.py
│   ├── main.py                  # FastAPI 入口
│   ├── celery_app.py            # Celery 实例 + Beat 配置
│   ├── config.py                # 配置管理（环境变量读取）
│   ├── models.py                # SQLite ORM 模型
│   ├── monitor.py               # 3.1 直播监控：状态轮询 + 任务编排
│   ├── recorder.py              # 3.2 录制模块：TRTC SDK + Playwright
│   ├── fetcher.py               # 3.3 API 数据抓取与增量逻辑
│   ├── analyzer.py              # 3.4 分析引擎入口
│   ├── whisper_task.py          # faster-whisper 调用封装
│   ├── skill_manager.py         # Skill 加载/迭代/版本管理
│   └── storage.py               # COS 上传 / 本地清理
├── skills/
│   └── live_analysis_v1.md      # 初始分析 Skill
├── tests/
│   └── test_api.py              # API 连通性验证
├── data/                        # 运行时数据（.gitignore）
│   ├── recordings/
│   ├── raw/
│   └── transcripts/
├── output/
│   └── reports/
├── requirements.txt             # Python 依赖
├── .env.example                 # 环境变量模板
├── .gitignore
└── README.md
```

---

## 七、Python 依赖 (`requirements.txt`)

```
# Web & Task
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
celery[redis]>=5.3.0
redis>=5.0.0

# Database
sqlalchemy>=2.0.0

# Media & AI
faster-whisper>=1.0.0
ffmpeg-python>=0.2.0

# Cloud
cos-python-sdk-v5>=1.9.0
tencentcloud-sdk-python-asr>=3.0.0

# Browser (备路录制)
playwright>=1.40.0

# API Client
httpx>=0.27.0

# Utilities
python-dotenv>=1.0.0
pydantic>=2.0.0
pydantic-settings>=2.0.0
```

---

## 八、环境变量 (`.env.example`)

```bash
# === 鑫云平台账号 ===
XINYUN_PHONE=19267482243
XINYUN_PASSWORD=Tycm@123
XINYUN_TENANT_ID=751087375173437746

# === OCR 识别服务 ===
OCR_API_URL=https://api.leepow.com/verifycode

# === 腾讯云 COS ===
COS_SECRET_ID=
COS_SECRET_KEY=
COS_REGION=ap-guangzhou
COS_BUCKET=ai-live-analysis-xxxxx

# === 腾讯云 ASR（whisper 超时降级用） ===
ASR_SECRET_ID=
ASR_SECRET_KEY=

# === 日志与调试 ===
LOG_LEVEL=INFO

# === 调度参数 ===
POLL_INTERVAL_SECONDS=30                   # 直播状态轮询间隔
SNAPSHOT_INTERVAL_MINUTES=30               # 数据抓取间隔
WHISPER_TIMEOUT_MINUTES=15                 # 转写超时阈值
LOGIN_RETRY_MAX=3                          # 验证码登录最大重试次数
TOKEN_REFRESH_THRESHOLD_SECONDS=300        # Token 提前刷新阈值（5分钟）
```

---

## 九、核心 API 请求/响应示例

### 9.1 直播列表查询（findPage）

**请求**:
```
POST https://api.clsjcorp.com/api/livemanage/openClassesRoom/findPage
Headers: token: {JWT}
         gray_version: lizhixiang
         path: /livemanage/openClassesRoom
         Referer: https://console.clsjcorp.com/
         Origin: https://console.clsjcorp.com
Body: {"model": {}, "extra": {}, "current": 1, "size": 20}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "records": [
      {
        "id": "123456",
        "roomId": "abc123",
        "roomName": "新品首发专场",
        "liveStatus": "STARTING",
        "startTime": "2026-07-02 14:00:00",
        "coverUrl": "https://..."
      }
    ],
    "total": 1,
    "pageNo": 1
  }
}
```

### 9.2 获取 TRTC 进房参数（getRoomParameter）

**请求**:
```
GET https://api.xinyuntv.com/api/livebiz/openClassesRoom/assistant/public/getRoomParameter?roomId=100042779
Headers: LiveToken: {sessionToken}
         gray_version: PROD
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "trtc": {
      "sdkAppId": 1600073723,
      "userId": "audience_xxxxx",
      "userSig": "eJwtzEEL...",
      "roomId": 100042779
    }
  }
}
```

### 9.3 创建直播会话（createSession）

**请求**:
```
POST https://api.xinyuntv.com/api/livebiz/openClassesRoom/assistant/public/createSession
Headers: Content-Type: application/json
Body: {"roomId": "100042779"}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "sessionToken": "eyJhbG...",
    "roomSession": {
      "sessionId": "..."
    }
  }
}
```

### 9.4 评论消息（imMessage/page - clsjcorp.com）

**请求**:
```
POST https://api.clsjcorp.com/api/livemanage/imMessage/page
Headers: token: {JWT}
         gray_version: lizhixiang
         path: /livemanage/openClassesRoom/analysis/{roomId}
         Referer: https://console.clsjcorp.com/
         Content-Type: application/json
Body: {"pageNo": 1, "pageSize": 100, "roomId": "100042779", "channelIds": [], "channelGroupId": ""}
```

**响应**（一条真实 TEXT 消息示例）:
```json
{
  "code": 0,
  "data": {
    "records": [
      {
        "id": "7873747c60eb47db92bb3aac1f14f80a",
        "roomId": "100042779",
        "fromUserId": "1000000005477272",
        "fromNickName": "家有儿女",
        "fromAvatar": "https://thirdwx.qlogo.cn/...",
        "examineState": "EXAMINE_OK",
        "msgBody": {
          "msgType": "TEXT",
          "fromNick": "家有儿女",
          "fromAccount": "1000000005477272",
          "fromClientType": "REST",
          "body": "{\"content\":\"啪啪吗？可不可另外买？\",\"notifyType\":0}",
          "msgTimestamp": "1782997645129",
          "serverExtension": {
            "role": "AUDIENCE",
            "newUser": false,
            "firstEnter": true,
            "videoScript": false,
            "amuseOneself": false,
            "examineStatus": "EXAMINE_OK",
            "channelName": "忆姐"
          }
        },
        "msgType": "TEXT",
        "eventTime": "2026-07-02 21:07:25"
      }
    ],
    "total": 3456
  }
}
```

**评论过滤规则**（详见 §4.4.2）：`msgType=TEXT` + `examineState=EXAMINE_OK` + `role=AUDIENCE` + `videoScript=false` + `amuseOneself=false`。评论文本从 `msgBody.body` JSON 取 `content`。

### 9.5 订单数据（getOrderAnalysisPage - clsjcorp.com）

**请求**:
```
POST https://api.clsjcorp.com/api/livemanage/order/getOrderAnalysisPage
Headers: token: {JWT}
         gray_version: lizhixiang
         path: /livemanage/openClassesRoom/analysis/{roomId}
         Referer: https://console.clsjcorp.com/
         Origin: https://console.clsjcorp.com
Body: {"roomId": "100041846", "liveSpaceId": "782897449156796061", "current": 1, "size": 100}
```

### 9.6 新老粉学员分布（getNewoldData）

**前置步骤**：需要先获取 `liveSpaceId`

```
GET https://api.clsjcorp.com/api/livemanage/roomLiveSpace/selectOptions?roomId={roomId}
Headers: token: {JWT}
         gray_version: lizhixiang
         path: /livemanage/openClassesRoom
         Referer: https://console.clsjcorp.com/
         Origin: https://console.clsjcorp.com
→ 返回场次列表，取最新一条的 id 作为 liveSpaceId
```

**请求**:
```
POST https://api.clsjcorp.com/api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData
Headers: token: {JWT}
         gray_version: lizhixiang
         path: /livemanage/openClassesRoom/analysis/{roomId}
         Referer: https://console.clsjcorp.com/
         Origin: https://console.clsjcorp.com
Body: {"roomId": "100042359", "liveSpaceId": "784384418374330664", "channelIds": [], "channelGroupId": ""}
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "statMemberNewoldDailyVo": {
      "nconversionRate": "12.50",
      "nwatcherCnt": "120",
      "ntotalWatchTimeSeconds": "18000",
      "ntransactionUserCnt": "15",
      "nwatcher30Cnt": "45",
      "otransactionUserCnt": "38",
      "owatcherCnt": "380",
      "oconversionRate": "10.00",
      "owatcher30Cnt": "210"
    }
  },
  "msg": "ok",
  "isSuccess": true
}
```

**字段说明**：`n` 前缀 = 新学员，`o` 前缀 = 老学员。

| 字段 | 含义 | 分析用途 |
|------|------|---------|
| `nconversionRate` | 新学员支付转换率（%） | 对比老学员 → 判断新粉承接能力 |
| `oconversionRate` | 老学员支付转换率（%） | 对比新学员 → 判断老粉忠诚度 |
| `ntransactionUserCnt` | 新学员支付人数 | 新粉成交绝对量 |
| `otransactionUserCnt` | 老学员支付人数 | 老粉成交绝对量 |
| `nwatcherCnt` | 新学员访问人数 | 流量中新粉占比 |
| `owatcherCnt` | 老学员访问人数 | 流量中老粉占比 |
| `nwatcher30Cnt` | 新学员观看 ≥30min 人数 | 新粉深度观看 → 话术吸引力 |
| `owatcher30Cnt` | 老学员观看 ≥30min 人数 | 老粉深度观看 → 内容持续性 |
| `ntotalWatchTimeSeconds` | 新学员总观看时长（秒） | 新粉平均停留时长 |

---

## 十、错误处理规范

| 场景 | 策略 | 处理方式 |
|------|------|---------|
| API 请求超时 | 30s 超时 | 重试 2 次（间隔 10s），仍失败标记缺失 |
| API 返回非 200 | HTTP 状态异常 | 重试 2 次，仍失败告警 |
| API 返回 code≠0 | 业务错误 | 记录错误信息，跳过该次抓取 |
| TRTC 进房失败 | SDK 连接异常 | 立即切备路（无头浏览器），告警 |
| Whisper 超时 | 处理 > 15min | 杀进程，切换腾讯云 ASR |
| COS 上传失败 | 网络/凭证异常 | 本地保留文件，下次重试 |
| Redis 断连 | 连接中断 | Celery 自动重连，5 次仍失败则 Crash |
| Token 过期 | 401 响应 | 自动刷新 Token（重新执行验证码登录流程） |

---

## 十一、附录：完整 API 清单

### 附录 A — 管理页 API（api.clsjcorp.com）

| # | 端点 | 方法 | 用途 |
|---|------|------|------|
| 1 | `/api/livemanage/openClassesRoom/findPage` | POST | 直播列表分页 |
| 2 | `/api/livemanage/openClassesRoom/findNumberAnalysis` | POST | 各状态统计数量 |
| 3 | `/api/livemanage/roomLiveSpace/selectOptions` | GET | 获取房间所有直播场次（取 liveSpaceId） |
| 4 | `/api/livemanage/statRoomLiveSpace/anyTenant/getNewoldData` | POST | **新老粉学员分布**（新/老粉转化率、支付人数、观看≥30min人数） |
| 5 | `/api/livemanage/statRoomLiveSpace/anyTenant/getAnalysis` | POST | 统计概览（含新学员占比） |
| 6 | `/api/livemanage/statRoomLiveSpace/anyTenant/getChartData` | POST | 趋势图数据（在线/互动/营销/订单） |
| 7 | `/api/livemanage/statRoomLiveSpace/anyTenant/getMemberData` | POST | 学员明细列表（分页） |
| 8 | `/api/livemanage/order/getOrderAnalysis` | POST | 订单汇总数据 |
| 9 | `/api/livemanage/order/getOrderAnalysisPage` | POST | 订单明细分页 |

### 附录 B — 鉴权 API

| # | 端点 | 方法 | 域名 | 用途 |
|---|------|------|------|------|
| 1 | `/api/oauth/anyTenant/captcha` | GET | api.clsjcorp.com | 获取验证码图片（`key=xinyun_sync_{32位随机串}`, `_t={timestamp}`） |
| 2 | `https://api.leepow.com/verifycode` | POST | api.leepow.com | OCR 识别验证码（Body: `{"image": "base64图片"}`） |
| 3 | `/api/oauth/anyTenant/preLogin` | POST | api.clsjcorp.com | 验证码登录（grantType: CAPTCHA） |
| 4 | `/api/oauth/anyTenant/tenantLogin` | POST | api.clsjcorp.com | 选租户获 Token（JWT，72h） |
| 5 | `/api/livebiz/openClassesRoom/assistant/public/createSession` | POST | api.xinyuntv.com | 生成 LiveToken（TRTC 录制用） |

### 附录 C — TRTC 录制 API（api.xinyuntv.com）

**鉴权**：共用 LiveToken，路径前缀 `/api/livebiz/`。

| # | 端点 | 方法 | 用途 |
|---|------|------|------|
| 1 | `/api/livebiz/openClassesRoom/assistant/public/createSession` | POST | 创建会话，获取 LiveToken；Body: `{"roomId"}` |
| 2 | `/api/livebiz/openClassesRoom/assistant/public/getRoomParameter` | GET | **TRTC 进房参数**（sdkAppId, userSig, roomId） |

> 全部 API 统一响应格式: `{code: 0, data: {...}, isSuccess: true}`

---

## 十二、下一步

| 优先级 | 任务 | 估时 |
|--------|------|------|
| P0 | `app/config.py` — 环境变量加载与配置类 | 0.5h |
| P0 | `app/models.py` — SQLite 表结构 + ORM | 1h |
| P0 | `app/celery_app.py` — Celery + Beat 初始化 | 1h |
| P1 | `app/fetcher.py` — API 抓取模块（含登录鉴权） | 3h |
| P1 | `app/monitor.py` — 状态轮询 + 任务编排 | 2h |
| P1 | `app/recorder.py` — TRTC 录制 + Playwright 备路 | 4h |
| P1 | `app/whisper_task.py` — Whisper 转写封装 | 2h |
| P2 | `app/analyzer.py` — 分析引擎（五维 + Skill 调用） | 3h |
| P2 | `app/skill_manager.py` — Skill 加载/迭代 | 1.5h |
| P2 | `app/storage.py` — COS 同步 + 本地清理 | 1h |
| P2 | `app/main.py` — FastAPI 管理面板 | 2h |
| P3 | `tests/test_api.py` — API 连通性测试 | 1h |
| P3 | `skills/live_analysis_v1.md` — 初始分析 Skill | 1h |

> 总计估时约 23h，建议按 P0 → P1 → P2 → P3 顺序实施。
*（内容由AI生成，仅供参考）*
