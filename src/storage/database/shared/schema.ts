import { sql } from "drizzle-orm";
import { pgTable, serial, text, varchar, timestamp, integer, numeric, jsonb, boolean, index, decimal, bigint } from "drizzle-orm/pg-core";

// System table - must be preserved
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 直播场次
export const liveSessions = pgTable(
  "live_sessions",
  {
    id: serial().primaryKey(),
    room_id: varchar("room_id", { length: 100 }).notNull(),
    room_name: varchar("room_name", { length: 255 }),
    live_space_id: varchar("live_space_id", { length: 100 }),
    start_time: timestamp("start_time", { withTimezone: true }),
    end_time: timestamp("end_time", { withTimezone: true }),
    status: varchar("status", { length: 20 }).notNull().default("idle"), // idle/recording/analyzing/ended/error
    trtc_info: jsonb("trtc_info"), // { sdkAppId, userId, userSig, roomId }
    last_snapshot_seq: integer("last_snapshot_seq").default(0),
    last_analysis_time: timestamp("last_analysis_time", { withTimezone: true }), // 上次片段分析时间
    live_token: text("live_token"), // 监播页 LiveToken
    token_expires_at: timestamp("token_expires_at", { withTimezone: true }),
    error_message: text("error_message"),
    anchor_name: varchar("anchor_name", { length: 100 }), // 主播名称（从room_name提取）
    session_type: varchar("session_type", { length: 20 }).notNull().default("live"), // live/replay - 区分实时直播还是录播回放
    room_type: varchar("room_type", { length: 20 }), // normal/intelligence - 区分普通直播和智能直播
    template_name: varchar("template_name", { length: 255 }), // 智能直播模板名称
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("live_sessions_room_id_idx").on(table.room_id),
    index("live_sessions_status_idx").on(table.status),
    index("live_sessions_created_at_idx").on(table.created_at),
    index("live_sessions_anchor_name_idx").on(table.anchor_name),
  ]
);

// 半小时快照数据
export const snapshotData = pgTable(
  "snapshot_data",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    snapshot_seq: integer("snapshot_seq").notNull(), // 第几个半小时
    snapshot_time: timestamp("snapshot_time", { withTimezone: true }).notNull(),
    // 实时统计
    watcher_cnt: integer("watcher_cnt"),
    comment_cnt: integer("comment_cnt"),
    online_user_cnt: integer("online_user_cnt"),
    // 订单汇总
    order_total: numeric("order_total", { precision: 12, scale: 2 }),
    order_count: integer("order_count"),
    // 新老粉数据
    new_fan_conversion_rate: varchar("new_fan_conversion_rate", { length: 20 }),
    old_fan_conversion_rate: varchar("old_fan_conversion_rate", { length: 20 }),
    new_fan_pay_count: integer("new_fan_pay_count"),
    old_fan_pay_count: integer("old_fan_pay_count"),
    // 原始JSON响应
    raw_json: jsonb("raw_json"),
    // 录制文件URL
    recording_url: text("recording_url"),
    // 音频转写文本
    transcription: text("transcription"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("snapshot_data_session_id_idx").on(table.session_id),
    index("snapshot_data_snapshot_time_idx").on(table.snapshot_time),
    index("snapshot_data_session_seq_idx").on(table.session_id, table.snapshot_seq),
  ]
);

// 分析报告
export const analysisReports = pgTable(
  "analysis_reports",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    report_type: varchar("report_type", { length: 20 }).notNull().default("segment"), // segment/final
    segment_seq: integer("segment_seq").default(0), // 片段序号，final 时为 0
    // 五维分析文本
    anchor_analysis: text("anchor_analysis"),        // 主播话术
    interaction_analysis: text("interaction_analysis"), // 互动热度
    conversion_analysis: text("conversion_analysis"),  // 商品转化
    sentiment_analysis: text("sentiment_analysis"),     // 评论舆情
    rhythm_analysis: text("rhythm_analysis"),           // 直播节奏
    // 完整分析文本（Markdown格式）
    analysis_text: text("analysis_text"),
    skill_version: varchar("skill_version", { length: 20 }),
    model_used: varchar("model_used", { length: 50 }),
    knowledge_version: varchar("knowledge_version", { length: 50 }),
    anchor_name: varchar("anchor_name", { length: 100 }), // 主播名称（用于分类）
    // 智能直播相关字段
    template_name: varchar("template_name", { length: 255 }), // 智能模板名称
    room_type: varchar("room_type", { length: 20 }), // 直播类型 normal/intelligence
    // 结构化评分
    overall_score: numeric("overall_score", { precision: 3, scale: 1 }),
    anchor_score: numeric("anchor_score", { precision: 3, scale: 1 }),
    interaction_score: numeric("interaction_score", { precision: 3, scale: 1 }),
    conversion_score: numeric("conversion_score", { precision: 3, scale: 1 }),
    sentiment_score: numeric("sentiment_score", { precision: 3, scale: 1 }),
    rhythm_score: numeric("rhythm_score", { precision: 3, scale: 1 }),
    // 结构化数据
    alerts: jsonb("alerts").default([]),          // 预警列表 [{type,title,description,severity}]
    action_items: jsonb("action_items").default([]), // 建议行动 [{dimension,title,priority,description}]
    highlights: jsonb("highlights").default([]),    // 亮点 [{dimension,title,description}]
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analysis_reports_session_id_idx").on(table.session_id),
    index("analysis_reports_report_type_idx").on(table.report_type),
    index("analysis_reports_session_type_idx").on(table.session_id, table.report_type),
    index("analysis_reports_anchor_name_idx").on(table.anchor_name),
    index("analysis_reports_template_name_idx").on(table.template_name),
  ]
);

// Skill 版本记录
export const skillVersions = pgTable(
  "skill_versions",
  {
    id: serial().primaryKey(),
    version: varchar("version", { length: 20 }).notNull().unique(),
    content: text("content").notNull(), // Skill Markdown 内容
    change_log: text("change_log"),
    knowledge_snapshot: text("knowledge_snapshot"), // 生成此版本时的知识快照
    is_active: integer("is_active").notNull().default(1), // 1=当前使用
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("skill_versions_is_active_idx").on(table.is_active),
  ]
);

// 系统配置（Token存储等）
export const systemConfig = pgTable(
  "system_config",
  {
    id: serial().primaryKey(),
    config_key: varchar("config_key", { length: 100 }).notNull().unique(),
    config_value: text("config_value"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("system_config_key_idx").on(table.config_key),
  ]
);

// 分析知识库（自学习进化）
export const analysisKnowledge = pgTable(
  "analysis_knowledge",
  {
    id: serial().primaryKey(),
    category: varchar("category", { length: 50 }).notNull(),     // threshold/pattern/benchmark/rule
    dimension: varchar("dimension", { length: 50 }).notNull(),   // anchor/interaction/conversion/sentiment/rhythm/general
    key: varchar("key", { length: 200 }).notNull(),              // 知识键名
    value: text("value").notNull(),                              // 知识值
    source: varchar("source", { length: 100 }),                  // 来源场次/报告
    confidence: integer("confidence").default(1),                // 置信度 1-5
    sample_count: integer("sample_count").default(1),            // 支撑样本数
    last_validated_at: timestamp("last_validated_at", { withTimezone: true }),
    // 审核机制
    review_status: varchar("review_status", { length: 20 }).notNull().default("auto"), // auto/approved/rejected/flagged
    source_report_id: integer("source_report_id"),               // 来源报告ID
    source_session_id: integer("source_session_id"),             // 来源场次ID
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    reviewed_by: varchar("reviewed_by", { length: 100 }),
    decay_factor: numeric("decay_factor", { precision: 3, scale: 2 }).notNull().default("1.00"), // 置信度衰减因子
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analysis_knowledge_category_idx").on(table.category),
    index("analysis_knowledge_dimension_idx").on(table.dimension),
    index("analysis_knowledge_review_status_idx").on(table.review_status),
  ]
);

// 直播脚本与商品成交数据（投喂）
export const liveScripts = pgTable(
  "live_scripts",
  {
    id: serial().primaryKey(),
    session_date: varchar("session_date", { length: 50 }).notNull(),   // 场次日期
    anchor_name: varchar("anchor_name", { length: 100 }),              // 主播名称
    keywords: text("keywords"),                                         // 核心关键词
    content_points: text("content_points"),                             // 内容要点(完整脚本)
    product_list: text("product_list"),                                 // 产品清单(含金额)
    transaction_data: text("transaction_data"),                         // 成交数据
    replay_transaction: varchar("replay_transaction", { length: 100 }),// 录播成交数据
    source: varchar("source", { length: 100 }),                         // 来源
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("live_scripts_date_idx").on(table.session_date),
  ]
);

// 后台任务队列
export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: serial().primaryKey(),
    job_type: varchar("job_type", { length: 50 }).notNull(), // monitor/record/transcribe/analysis/retry
    session_id: integer("session_id"),
    segment_seq: integer("segment_seq"),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/running/success/failed/cancelled
    payload: jsonb("payload"),
    result: jsonb("result"),
    error_message: text("error_message"),
    retry_count: integer("retry_count").notNull().default(0),
    max_retry: integer("max_retry").notNull().default(3),
    locked_by: varchar("locked_by", { length: 100 }),
    locked_until: timestamp("locked_until", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    started_at: timestamp("started_at", { withTimezone: true }),
    finished_at: timestamp("finished_at", { withTimezone: true }),
  },
  (table) => [
    index("bg_jobs_status_idx").on(table.status),
    index("bg_jobs_type_idx").on(table.job_type),
    index("bg_jobs_session_idx").on(table.session_id),
  ]
);

// 复盘行动项
export const actionItems = pgTable(
  "action_items",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    report_id: integer("report_id"),
    anchor_name: varchar("anchor_name", { length: 100 }),
    dimension: varchar("dimension", { length: 50 }).notNull(), // anchor/interaction/conversion/sentiment/rhythm
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    priority: varchar("priority", { length: 20 }).notNull().default("medium"), // high/medium/low
    assignee: varchar("assignee", { length: 100 }),
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/in_progress/done/verified/skipped
    due_date: timestamp("due_date", { withTimezone: true }),
    verified_in_session_id: integer("verified_in_session_id"),  // 在哪一场验证
    verified_result: varchar("verified_result", { length: 20 }), // improved/unchanged/worsened
    source_quote: text("source_quote"),                         // 原始建议原文
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("action_items_session_idx").on(table.session_id),
    index("action_items_status_idx").on(table.status),
    index("action_items_anchor_idx").on(table.anchor_name),
  ]
);

// 直播实时预警
export const liveAlerts = pgTable(
  "live_alerts",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    alert_type: varchar("alert_type", { length: 50 }).notNull(), // viewer_drop/conversion_low/negative_surge/no_order/script_drift/long_product
    severity: varchar("severity", { length: 20 }).notNull().default("warning"), // critical/warning/info
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    metric_name: varchar("metric_name", { length: 50 }),
    metric_value: numeric("metric_value", { precision: 12, scale: 2 }),
    threshold_value: numeric("threshold_value", { precision: 12, scale: 2 }),
    is_read: boolean("is_read").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("live_alerts_session_idx").on(table.session_id),
    index("live_alerts_read_idx").on(table.is_read),
  ]
);

// 商品作战卡
export const productBattleCards = pgTable(
  "product_battle_cards",
  {
    id: serial().primaryKey(),
    goods_name: varchar("goods_name", { length: 255 }).notNull(), // 商品名称
    summary_stats: jsonb("summary_stats"), // 汇总统计数据
    best_session: jsonb("best_session"), // 最佳场次
    worst_session: jsonb("worst_session"), // 最差场次
    ai_analysis: text("ai_analysis"), // AI 分析文本
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_battle_cards_goods_name_idx").on(table.goods_name),
    index("product_battle_cards_created_at_idx").on(table.created_at),
  ]
);

// ==================== 持久化记忆存储系统 ====================

// 记忆版本管理
export const memoryVersions = pgTable(
  "memory_versions",
  {
    id: serial().primaryKey(),
    version: varchar("version", { length: 50 }).notNull().unique(), // 记忆数据结构版本
    schema_definition: jsonb("schema_definition").notNull(), // 完整的schema定义
    change_log: text("change_log"), // 版本变更说明
    is_active: integer("is_active").notNull().default(1), // 1=当前激活版本
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    migrated_at: timestamp("migrated_at", { withTimezone: true }), // 数据迁移完成时间
  },
  (table) => [
    index("memory_versions_is_active_idx").on(table.is_active),
    index("memory_versions_version_idx").on(table.version),
  ]
);

// AI模型元数据记录
export const aiModelMetadata = pgTable(
  "ai_model_metadata",
  {
    id: serial().primaryKey(),
    provider: varchar("provider", { length: 50 }).notNull(), // AI提供商：zhenjing/coze/openai等
    model_name: varchar("model_name", { length: 100 }).notNull(), // 模型名称
    model_version: varchar("model_version", { length: 50 }), // 模型版本
    capabilities: jsonb("capabilities"), // 模型能力标签数组
    memory_schema_version: varchar("memory_schema_version", { length: 50 }).notNull(), // 关联的记忆schema版本
    config: jsonb("config"), // 模型特定配置
    is_active: integer("is_active").notNull().default(1),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ai_model_metadata_provider_idx").on(table.provider),
    index("ai_model_metadata_is_active_idx").on(table.is_active),
    index("ai_model_memory_version_idx").on(table.memory_schema_version),
  ]
);

// 主播记忆档案
export const anchorMemories = pgTable(
  "anchor_memories",
  {
    id: serial().primaryKey(),
    anchor_name: varchar("anchor_name", { length: 100 }).notNull(), // 主播名称
    schema_version: varchar("schema_version", { length: 50 }).notNull().default("1.0.0"), // 数据结构版本
    // 主播核心画像
    personality_traits: jsonb("personality_traits"), // 性格特征标签
    speaking_style: jsonb("speaking_style"), // 话术风格分析
    strengths: jsonb("strengths"), // 优势标签
    improvement_areas: jsonb("improvement_areas"), // 待改进领域
    // 历史分析总结
    historical_summary: text("historical_summary"), // 历史表现总结
    key_observations: jsonb("key_observations"), // 关键观察数组
    best_practices: jsonb("best_practices"), // 最佳实践数组
    common_mistakes: jsonb("common_mistakes"), // 常见问题数组
    // 业务标签
    product_specialties: jsonb("product_specialties"), // 擅长的商品类目
    performance_trends: jsonb("performance_trends"), // 表现趋势数据
    // 关联模型
    created_by_model: varchar("created_by_model", { length: 100 }), // 创建此记忆的模型
    last_updated_by_model: varchar("last_updated_by_model", { length: 100 }), // 最后更新的模型
    // 元数据
    is_archived: boolean("is_archived").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("anchor_memories_anchor_name_idx").on(table.anchor_name),
    index("anchor_memories_schema_version_idx").on(table.schema_version),
    index("anchor_memories_is_archived_idx").on(table.is_archived),
  ]
);

// 商品记忆档案
export const productMemories = pgTable(
  "product_memories",
  {
    id: serial().primaryKey(),
    goods_name: varchar("goods_name", { length: 255 }).notNull(), // 商品名称
    schema_version: varchar("schema_version", { length: 50 }).notNull().default("1.0.0"), // 数据结构版本
    // 商品核心画像
    product_category: varchar("product_category", { length: 100 }), // 商品类目
    product_tags: jsonb("product_tags"), // 商品标签数组
    // 历史表现数据
    performance_summary: text("performance_summary"), // 历史表现总结
    best_performance: jsonb("best_performance"), // 最佳表现记录
    worst_performance: jsonb("worst_performance"), // 最差表现记录
    conversion_insights: jsonb("conversion_insights"), // 转化洞察
    // 话术与经验
    optimal_pitches: jsonb("optimal_pitches"), // 最佳话术数组
    pricing_strategies: jsonb("pricing_strategies"), // 价格策略
    display_tips: jsonb("display_tips"), // 展示技巧
    // 业务标签
    performance_trends: jsonb("performance_trends"), // 趋势数据
    success_factors: jsonb("success_factors"), // 成功因素分析
    // 关联模型
    created_by_model: varchar("created_by_model", { length: 100 }),
    last_updated_by_model: varchar("last_updated_by_model", { length: 100 }),
    // 元数据
    is_archived: boolean("is_archived").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    archived_at: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("product_memories_goods_name_idx").on(table.goods_name),
    index("product_memories_schema_version_idx").on(table.schema_version),
    index("product_memories_is_archived_idx").on(table.is_archived),
  ]
);

// 直播场景记忆
export const sessionMemories = pgTable(
  "session_memories",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id, { onDelete: "cascade" }),
    schema_version: varchar("schema_version", { length: 50 }).notNull().default("1.0.0"), // 数据结构版本
    // 场景信息
    room_name: varchar("room_name", { length: 255 }),
    anchor_name: varchar("anchor_name", { length: 100 }),
    session_date: timestamp("session_date", { withTimezone: true }),
    // 场景关键记忆
    key_insights: jsonb("key_insights"), // 关键洞察数组
    what_worked: jsonb("what_worked"), // 成功因素数组
    what_failed: jsonb("what_failed"), // 失败因素数组
    action_outcomes: jsonb("action_outcomes"), // 行动项执行结果
    // 上下文关系
    learnings_applied: jsonb("learnings_applied"), // 应用了哪些之前的经验
    new_learnings: jsonb("new_learnings"), // 本场次学到的新经验
    // 模型记录
    analyzed_by_model: varchar("analyzed_by_model", { length: 100 }), // 分析此场的模型
    // 元数据
    is_archived: boolean("is_archived").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("session_memories_session_id_idx").on(table.session_id),
    index("session_memories_anchor_name_idx").on(table.anchor_name),
    index("session_memories_schema_version_idx").on(table.schema_version),
  ]
);

// 通用分析记忆（跨场景经验）
export const generalKnowledgeMemories = pgTable(
  "general_knowledge_memories",
  {
    id: serial().primaryKey(),
    knowledge_type: varchar("knowledge_type", { length: 50 }).notNull(), // 知识类型：best_practice/lesson_learned/insight等
    category: varchar("category", { length: 50 }).notNull(), // 分类：anchor/conversion/interaction/rhythm/sentiment
    schema_version: varchar("schema_version", { length: 50 }).notNull().default("1.0.0"),
    // 知识内容
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content").notNull(),
    tags: jsonb("tags"), // 标签数组
    // 验证信息
    validation_count: integer("validation_count").default(0), // 验证次数
    success_rate: numeric("success_rate", { precision: 5, scale: 2 }), // 成功率
    source_sessions: jsonb("source_sessions"), // 来源场次数组
    // 模型记录
    created_by_model: varchar("created_by_model", { length: 100 }),
    last_validated_by_model: varchar("last_validated_by_model", { length: 100 }),
    // 元数据
    confidence: integer("confidence").default(3), // 1-5置信度
    is_archived: boolean("is_archived").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("general_knowledge_type_idx").on(table.knowledge_type),
    index("general_knowledge_category_idx").on(table.category),
    index("general_knowledge_schema_version_idx").on(table.schema_version),
    index("general_knowledge_is_archived_idx").on(table.is_archived),
  ]
);

// 模型切换记录
export const modelSwitchLogs = pgTable(
  "model_switch_logs",
  {
    id: serial().primaryKey(),
    old_provider: varchar("old_provider", { length: 50 }),
    old_model: varchar("old_model", { length: 100 }),
    new_provider: varchar("new_provider", { length: 50 }),
    new_model: varchar("new_model", { length: 100 }),
    old_schema_version: varchar("old_schema_version", { length: 50 }),
    new_schema_version: varchar("new_schema_version", { length: 50 }),
    // 迁移信息
    migration_status: varchar("migration_status", { length: 20 }).default("pending"), // pending/running/completed/failed
    migration_details: jsonb("migration_details"), // 迁移详情
    error_message: text("error_message"),
    // 元数据
    triggered_by: varchar("triggered_by", { length: 100 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("model_switch_created_at_idx").on(table.created_at),
    index("model_switch_status_idx").on(table.migration_status),
  ]
);

// ==================== 系统日志 ====================

// 系统操作日志
export const systemOperationLogs = pgTable(
  "system_operation_logs",
  {
    id: serial().primaryKey(),
    operation_type: varchar("operation_type", { length: 50 }).notNull(), // login/logout/start_monitor/stop_monitor/create_user/update_config等
    user_id: varchar("user_id", { length: 100 }),
    username: varchar("username", { length: 100 }),
    // 操作详情
    resource_type: varchar("resource_type", { length: 50 }), // session/user/config/product等
    resource_id: varchar("resource_id", { length: 100 }),
    action: varchar("action", { length: 50 }), // create/update/delete/view
    description: text("description"), // 操作描述
    // 数据变更
    old_value: jsonb("old_value"), // 变更前的值
    new_value: jsonb("new_value"), // 变更后的值
    // 请求信息
    ip_address: varchar("ip_address", { length: 50 }),
    user_agent: text("user_agent"),
    // 结果
    status: varchar("status", { length: 20 }).notNull().default("success"), // success/failed/partial
    error_message: text("error_message"),
    // 时间
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sys_log_operation_type_idx").on(table.operation_type),
    index("sys_log_user_idx").on(table.user_id),
    index("sys_log_created_at_idx").on(table.created_at),
    index("sys_log_status_idx").on(table.status),
  ]
);

// 运行日志
export const runtimeLogs = pgTable(
  "runtime_logs",
  {
    id: serial().primaryKey(),
    log_level: varchar("log_level", { length: 20 }).notNull(), // debug/info/warn/error/fatal
    log_type: varchar("log_type", { length: 50 }).notNull(), // system/monitor/worker/analysis/api等
    source: varchar("source", { length: 100 }).notNull(), // 日志来源：模块/文件/函数名
    // 内容
    message: text("message").notNull(),
    context: jsonb("context"), // 附加上下文数据
    error_stack: text("error_stack"), // 错误堆栈
    // 关联
    session_id: integer("session_id"),
    job_id: integer("job_id"),
    // 性能
    duration_ms: integer("duration_ms"), // 执行耗时（毫秒）
    memory_usage: integer("memory_usage"), // 内存使用（KB）
    // 元数据
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("runtime_log_level_idx").on(table.log_level),
    index("runtime_log_source_idx").on(table.source),
    index("runtime_log_created_at_idx").on(table.created_at),
  ]
);

// ==================== 系统监控 ====================

// 监控问题记录
export const monitorIssues = pgTable(
  "monitor_issues",
  {
    id: serial().primaryKey(),
    issue_type: varchar("issue_type", { length: 50 }).notNull(), // api_error/business_error/resource_overload/timeout/unknown
    severity: varchar("severity", { length: 20 }).notNull().default("warning"), // info/warning/error/critical
    module: varchar("module", { length: 100 }).notNull(), // 关联的系统模块
    // 问题详情
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    error_details: jsonb("error_details"), // 错误详情对象
    log_snippet: text("log_snippet"), // 日志片段
    screenshot_url: varchar("screenshot_url", { length: 500 }), // 截图URL
    // 环境信息
    environment: jsonb("environment"), // 当前系统运行环境参数
    // 复现步骤
    reproduction_steps: jsonb("reproduction_steps"), // 复现步骤数组
    // 统计信息
    occurrence_count: integer("occurrence_count").default(1).notNull(), // 发生次数
    first_occurred_at: timestamp("first_occurred_at", { withTimezone: true }).defaultNow().notNull(),
    last_occurred_at: timestamp("last_occurred_at", { withTimezone: true }).defaultNow().notNull(),
    // 处理状态
    status: varchar("status", { length: 20 }).notNull().default("open"), // open/investigating/resolved/ignored
    assignee: varchar("assignee", { length: 100 }),
    resolution: text("resolution"),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    // 元数据
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("monitor_issue_type_idx").on(table.issue_type),
    index("monitor_severity_idx").on(table.severity),
    index("monitor_module_idx").on(table.module),
    index("monitor_status_idx").on(table.status),
    index("monitor_occurred_at_idx").on(table.last_occurred_at),
  ]
);

// 监控测试用例执行记录
export const monitorTestRuns = pgTable(
  "monitor_test_runs",
  {
    id: serial().primaryKey(),
    test_case_id: varchar("test_case_id", { length: 100 }).notNull(),
    test_name: varchar("test_name", { length: 200 }).notNull(),
    test_type: varchar("test_type", { length: 50 }).notNull(), // normal/exception/boundary
    test_module: varchar("test_module", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(), // passed/failed/skipped
    // 执行详情
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }),
    duration_ms: integer("duration_ms"),
    // 结果详情
    result: jsonb("result"),
    error_message: text("error_message"),
    // 元数据
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("monitor_test_case_id_idx").on(table.test_case_id),
    index("monitor_test_type_idx").on(table.test_type),
    index("monitor_test_status_idx").on(table.status),
    index("monitor_test_created_at_idx").on(table.created_at),
  ]
);

// 系统健康检查记录
export const healthChecks = pgTable(
  "health_checks",
  {
    id: serial().primaryKey(),
    check_type: varchar("check_type", { length: 50 }).notNull(), // api/resource/database/worker
    check_name: varchar("check_name", { length: 200 }).notNull(),
    status: varchar("status", { length: 20 }).notNull(), // healthy/unhealthy/degraded
    // 检查详情
    details: jsonb("details"),
    response_time_ms: integer("response_time_ms"),
    // 阈值相关
    threshold_warning: jsonb("threshold_warning"), // 警告阈值
    threshold_error: jsonb("threshold_error"), // 错误阈值
    // 元数据
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("health_check_type_idx").on(table.check_type),
    index("health_check_status_idx").on(table.status),
    index("health_check_created_at_idx").on(table.created_at),
  ]
);

// 资源使用记录
export const resourceUsage = pgTable(
  "resource_usage",
  {
    id: serial().primaryKey(),
    // CPU
    cpu_usage_percent: numeric("cpu_usage_percent"),
    cpu_load_avg_1m: numeric("cpu_load_avg_1m"),
    cpu_load_avg_5m: numeric("cpu_load_avg_5m"),
    cpu_load_avg_15m: numeric("cpu_load_avg_15m"),
    // 内存
    memory_used_bytes: bigint("memory_used_bytes", { mode: "number" }),
    memory_total_bytes: bigint("memory_total_bytes", { mode: "number" }),
    memory_usage_percent: numeric("memory_usage_percent"),
    // 磁盘
    disk_used_bytes: bigint("disk_used_bytes", { mode: "number" }),
    disk_total_bytes: bigint("disk_total_bytes", { mode: "number" }),
    disk_usage_percent: numeric("disk_usage_percent"),
    // 网络
    network_in_bytes_per_sec: numeric("network_in_bytes_per_sec"),
    network_out_bytes_per_sec: numeric("network_out_bytes_per_sec"),
    // 进程
    process_count: integer("process_count"),
    active_connections: integer("active_connections"),
    // 元数据
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("resource_usage_created_at_idx").on(table.created_at),
  ]
);

// 告警推送记录
export const monitorAlerts = pgTable(
  "monitor_alerts",
  {
    id: serial().primaryKey(),
    issue_id: integer("issue_id").references(() => monitorIssues.id),
    alert_type: varchar("alert_type", { length: 50 }).notNull(), // instant/daily/weekly
    alert_level: varchar("alert_level", { length: 20 }).notNull(), // info/warning/error/critical
    // 推送目标
    channels: jsonb("channels"), // 推送渠道数组
    recipients: jsonb("recipients"), // 接收人数组
    // 推送内容
    title: varchar("title", { length: 500 }).notNull(),
    content: text("content"),
    // 推送结果
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/sent/failed
    sent_at: timestamp("sent_at", { withTimezone: true }),
    error_message: text("error_message"),
    // 元数据
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("monitor_alert_issue_id_idx").on(table.issue_id),
    index("monitor_alert_type_idx").on(table.alert_type),
    index("monitor_alert_level_idx").on(table.alert_level),
    index("monitor_alert_status_idx").on(table.status),
    index("monitor_alert_created_at_idx").on(table.created_at),
  ]
);

// 监控报告
export const monitorReports = pgTable(
  "monitor_reports",
  {
    id: serial().primaryKey(),
    report_type: varchar("report_type", { length: 50 }).notNull(), // hourly/daily/weekly/custom
    start_time: timestamp("start_time", { withTimezone: true }).notNull(),
    end_time: timestamp("end_time", { withTimezone: true }).notNull(),
    // 报告内容
    summary: jsonb("summary"), // 摘要信息
    issues_summary: jsonb("issues_summary"), // 问题汇总
    test_results: jsonb("test_results"), // 测试结果
    health_trends: jsonb("health_trends"), // 健康趋势
    resource_trends: jsonb("resource_trends"), // 资源趋势
    recommendations: jsonb("recommendations"), // 建议
    // 报告文件
    report_url: varchar("report_url", { length: 500 }),
    // 元数据
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("monitor_report_type_idx").on(table.report_type),
    index("monitor_report_time_idx").on(table.start_time, table.end_time),
    index("monitor_report_created_at_idx").on(table.created_at),
  ]
);
