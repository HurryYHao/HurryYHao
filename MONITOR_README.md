# 系统监控系统

## 概述

系统监控系统用于自动化监控系统运行状态，包括健康检查、问题检测、测试用例执行、资源监控和报告生成等功能。

## 功能特性

### 1. 问题记录系统
- 实时捕获系统运行时出现的问题
- 问题按严重程度分级（info/warning/error/critical）
- 问题自动去重与计数
- 环境信息记录

### 2. 健康检查
- API 端点健康检查
- 数据库连接检查
- 资源使用检查
- 阈值告警

### 3. 测试用例执行
- 正常业务流程验证
- 异常场景容错能力测试
- 边界条件触发验证
- 定时自动化执行

### 4. 资源监控
- CPU/内存/磁盘使用情况记录
- 资源使用率告警
- 资源趋势分析

### 5. 报告生成
- 日报/周报/月报
- 问题汇总统计
- 测试结果统计
- 健康趋势分析

## 快速开始

### 前置条件

1. 确保系统已正常运行
2. 确认数据库中已创建相关表（见下方表结构）

### 启动监控服务

#### 方法 1: 使用独立监控服务

```bash
# 使用 ts-node 运行
npx ts-node scripts/monitor-server.ts

# 或者使用 tsx（如果已安装）
npx tsx scripts/monitor-server.ts
```

#### 方法 2: 通过 API 手动触发检查

```bash
# 健康检查
curl -X POST http://localhost:3001/api/monitor/health

# 运行测试
curl -X POST http://localhost:3001/api/monitor/tests

# 生成报告
curl -X POST http://localhost:3001/api/monitor/reports \
  -H "Content-Type: application/json" \
  -d '{"type": "daily"}'
```

### 访问监控界面

在系统监控页面提供完整的监控界面，包括：

- 系统概览
- 问题记录
- 健康检查结果
- 测试用例执行情况
- 资源使用情况

## API 接口

### 健康检查

#### 获取健康检查记录

```http
GET /api/monitor/health
```

#### 执行健康检查

```http
POST /api/monitor/health
```

#### 查看问题记录

```http
GET /api/monitor/issues
```

#### 运行测试用例

```http
POST /api/monitor/tests
```

#### 查看资源使用

```http
GET /api/monitor/resources
```

#### 生成报告

```http
POST /api/monitor/reports
```

## API 接口文档

### 健康检查 API

#### 健康检查接口

```typescript
// GET /api/monitor/health
```

#### 查询参数

无

#### 响应示例

```json
{
  "success": true,
  "data": {
    "recent": [
      {
        "id": 1,
        "check_type": "api",
        "check_name": "/api/sessions",
        "status": "healthy",
        "details": {},
        "response_time_ms": 50,
        "created_at": "2024-01-01T00:00:00.000Z"
      }
    ]
  }
}
```

### 问题记录 API

#### 问题记录接口

```typescript
// 获取问题记录
GET /api/monitor/issues
```

#### 查询参数

- `status`: 问题状态
- `severity`: 严重程度
- `module`: 模块
- `page`: 页码
- `pageSize`: 每页数量

#### 响应示例

```json
{
  "success": true,
  "data": {
    "issues": [...],
    "total": 10,
    "page": 1,
    "pageSize": 20
  }
}
```

### 测试用例 API

#### 测试用例接口

```typescript
// 获取测试记录
GET /api/monitor/tests

// 运行测试
POST /api/monitor/tests
```

#### 响应示例

```json
{
  "success": true,
  "data": [...]
}
```

### 资源使用 API

#### 资源使用接口

```typescript
// 获取资源使用记录
GET /api/monitor/resources

// 记录资源使用
POST /api/monitor/resources
```

#### 响应示例

```json
{
  "success": true,
  "data": [...]
}
```

### 报告生成 API

#### 报告生成接口

```typescript
// 获取报告
GET /api/monitor/reports

// 生成报告
POST /api/monitor/reports
```

#### 请求体参数

- `type`: 报告类型（daily/weekly/monthly）
- `startTime`: 开始时间
- `endTime`: 结束时间

#### 响应示例

```json
{
  "success": true,
  "data": {
    "id": 1,
    "report_type": "daily",
    "summary": {},
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

## 监控系统架构

### 系统模块

1. **监控管理器** (monitor-manager)

核心管理监控服务的核心模块，提供：

- 健康检查执行
- 问题记录管理
- 测试用例运行
- 资源使用监控
- 报告生成

2. **监控服务器** (monitor-server)

独立的监控服务进程，提供：

- 持续运行的监控服务
- 定时任务执行
- 实时告警
- 系统状态管理

3. **API 路由** (API Routes)

提供 REST API 接口：

- 健康检查 API
- 问题记录 API
- 测试用例 API
- 资源使用 API
- 报告生成 API

4. **前端组件** (Components)

用户界面组件：

- 问题显示
- 测试结果
- 资源趋势图
- 报告查看

### 数据库表结构

#### 问题记录表 (monitor_issues)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| issue_type | varchar | 问题类型 |
| severity | varchar | 严重程度 |
| module | varchar | 模块 |
| title | varchar | 标题 |
| description | text | 描述 |
| error_details | jsonb | 错误详情 |
| log_snippet | text | 日志片段 |
| environment | jsonb | 环境信息 |
| reproduction_steps | jsonb | 重现步骤 |
| occurrence_count | integer | 发生次数 |
| first_occurred_at | timestamp | 首次发生时间 |
| last_occurred_at | timestamp | 最后发生时间 |
| status | varchar | 状态 |
| assignee | varchar | 负责人 |
| resolution | text | 解决方案 |
| resolved_at | timestamp | 解决时间 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

#### 测试运行记录表 (monitor_test_runs)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| test_case_id | varchar | 测试用例 ID |
| test_name | varchar | 测试名称 |
| test_type | varchar | 测试类型 |
| test_module | varchar | 测试模块 |
| status | varchar | 状态 |
| start_time | timestamp | 开始时间 |
| end_time | timestamp | 结束时间 |
| duration_ms | integer | 执行时间（毫秒） |
| result | jsonb | 结果 |
| error_message | text | 错误信息 |
| created_at | timestamp | 创建时间 |

#### 健康检查表 (health_checks)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| check_type | varchar | 检查类型 |
| check_name | varchar | 检查名称 |
| status | varchar | 状态 |
| details | jsonb | 详情 |
| response_time_ms | integer | 响应时间（毫秒） |
| threshold_warning | jsonb | 警告阈值 |
| threshold_error | jsonb | 错误阈值 |
| created_at | timestamp | 创建时间 |

#### 资源使用表 (resource_usage)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| cpu_usage_percent | numeric | CPU 使用率 |
| cpu_load_avg_1m | numeric | CPU 平均负载（1分钟） |
| cpu_load_avg_5m | numeric | CPU 平均负载（5分钟） |
| cpu_load_avg_15m | numeric | CPU 平均负载（15分钟） |
| memory_used_bytes | bigint | 已使用内存（字节） |
| memory_total_bytes | bigint | 总内存（字节） |
| memory_usage_percent | numeric | 内存使用率 |
| disk_used_bytes | bigint | 已使用磁盘（字节） |
| disk_total_bytes | bigint | 总磁盘（字节） |
| disk_usage_percent | numeric | 磁盘使用率 |
| network_in_bytes_per_sec | numeric | 网络入流量（字节/秒） |
| network_out_bytes_per_sec | numeric | 网络出流量（字节/秒） |
| process_count | integer | 进程数 |
| active_connections | integer | 活动连接数 |
| created_at | timestamp | 创建时间 |

#### 告警记录表 (monitor_alerts)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| issue_id | integer | 问题 ID |
| alert_type | varchar | 告警类型 |
| alert_level | varchar | 告警级别 |
| channels | jsonb | 通知渠道 |
| recipients | jsonb | 接收人 |
| title | varchar | 标题 |
| content | text | 内容 |
| status | varchar | 状态 |
| sent_at | timestamp | 发送时间 |
| error_message | text | 错误信息 |
| created_at | timestamp | 创建时间 |

#### 报告表 (monitor_reports)

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | integer | 主键 |
| report_type | varchar | 报告类型 |
| start_time | timestamp | 开始时间 |
| end_time | timestamp | 结束时间 |
| summary | jsonb | 摘要 |
| issues_summary | jsonb | 问题汇总 |
| test_results | jsonb | 测试结果 |
| health_trends | jsonb | 健康趋势 |
| resource_trends | jsonb | 资源趋势 |
| recommendations | jsonb | 建议 |
| report_url | varchar | 报告文件 |
| created_at | timestamp | 创建时间 |

## 配置说明

### 监控配置

默认配置

```typescript
const MONITOR_CONFIG = {
  healthCheckInterval: 60000, // 健康检查间隔 1 分钟
  resourceUsageInterval: 30000, // 资源使用记录间隔 30 秒
  testRunInterval: 300000, // 测试运行间隔 5 分钟
  reportInterval: 86400000, // 日报生成间隔 24 小时
  alertThresholds: {
    cpuWarning: 70, // CPU 警告阈值
    cpuCritical: 90, // CPU 严重阈值
    memoryWarning: 80, // 内存警告阈值
    memoryCritical: 95, // 内存严重阈值
    diskWarning: 85, // 磁盘警告阈值
    diskCritical: 95 // 磁盘严重阈值
  }
};
```

## 测试用例说明

### 测试用例类型

1. **正常业务流程验证

- 获取会话列表 API
- 获取日志列表 API
- 获取商品列表 API

2. **异常场景容错**

- 无效 API 端点
- 空请求测试

3. **边界条件触发**

- 大数据量分页

### 扩展测试用例

您可以扩展测试用例：

```typescript
// 在 monitor-manager.ts 中添加
const TEST_CASES = [
  {
    id: 'your-test-id',
    name: 'Your Test Name',
    type: 'normal',
    module: 'your-module',
    test: async () => {
      // 您的测试逻辑
    }
  }
];
```

## 告警机制

### 问题严重程度

| 级别 | 说明 | 动作 |
| --- | --- | --- |
| info | 信息 | 仅记录 |
| warning | 警告 | 记录并提示 |
| error | 错误 | 记录并告警 |
| critical | 严重 | 记录、告警并立即处理 |

### 告警触发条件

1. **资源使用超过阈值

2. **健康检查失败

3. **测试用例执行失败

4. **API 响应时间过长

## 报告生成

### 报告类型

1. **日报**

- 每日汇总
- 问题统计
- 测试结果
- 健康趋势
- 资源趋势
- 改进建议

2. **周报**

- 周度汇总
- 问题统计
- 测试结果
- 健康趋势
- 资源趋势
- 改进建议

3. **月报**

- 月度汇总
- 问题统计
- 测试结果
- 健康趋势
- 资源趋势
- 改进建议

## 问题处理流程

1. **问题发现**

系统自动检测问题并记录

2. **问题分类**

系统按严重程度和模块分类

3. **问题通知**

触发告警通知相关人员

4. **问题解决**

问题修复并记录解决方案

5. **问题验证**

验证问题是否已解决

6. **问题关闭**

问题解决后关闭问题

## 扩展与定制

### 扩展测试用例

在 monitor-manager.ts 中添加自定义测试用例

```typescript
const TEST_CASES = [
  // 现有测试用例
  {
    id: 'custom-test-id',
    name: 'Custom Test Name',
    type: 'normal',
    module: 'custom-module',
    test: async () => {
      // 测试逻辑
    }
  }
];
```

### 扩展健康检查

在 monitor-manager.ts 中添加自定义检查

```typescript
// 在 runHealthCheck 函数中添加
if (checkType === 'all' || checkType === 'custom') {
  // 自定义检查逻辑
}
```

### 自定义告警渠道

在 recordIssue 函数中扩展告警逻辑

```typescript
// 在 triggerAlert 函数中
// 添加自定义通知渠道
```

## 故障排查

### 常见问题

1. **监控服务无法启动

检查端口是否被占用，检查依赖是否安装正确

2. **健康检查失败**

检查 API 是否正常响应，检查网络连接

3. **测试用例执行失败**

检查测试环境配置，检查相关接口是否正常

### 日志查看

系统日志位于：

```bash
# 查看系统日志
/data/storage.json 中的 runtime_logs 表
```

监控日志位于：

```bash
# 监控服务日志输出在控制台
```

## 维护与更新

### 数据清理

定期清理过期数据可以释放存储空间

```typescript
// 实现清理逻辑
```

### 性能优化

- 调整监控频率
- 优化数据库索引
- 定期归档历史数据

## 附录

### 术语表

| 术语 | 说明 |
| --- | --- |
| 健康检查 | 系统运行状态检查 |
| 测试用例 | 验证系统功能的测试 |
| 资源使用 | CPU/内存/磁盘使用情况 |
| 告警 | 问题发生时的通知机制 |
| 报告 | 监控数据的汇总展示 |

### 参考资源

- [Next.js 官方文档](https://nextjs.org/docs)
- [Supabase 官方文档](https://supabase.com/docs)
- [TypeScript 官方文档](https://www.typescriptlang.org/docs/)
