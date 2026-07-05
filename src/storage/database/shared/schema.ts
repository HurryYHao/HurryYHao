import { sql } from "drizzle-orm";
import { pgTable, serial, integer, varchar, text, timestamp, boolean, numeric, jsonb, index } from "drizzle-orm/pg-core";

// 系统表 - 必须保留
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 直播场次
export const liveSessions = pgTable(
  "live_sessions",
  {
    id: serial().primaryKey(),
    room_id: varchar("room_id", { length: 100 }),
    room_name: varchar("room_name", { length: 500 }),
    anchor_name: varchar("anchor_name", { length: 100 }),
    live_space_id: varchar("live_space_id", { length: 100 }),
    start_time: varchar("start_time", { length: 50 }),
    end_time: varchar("end_time", { length: 50 }),
    status: varchar("status", { length: 20 }).notNull().default("idle"),
    last_snapshot_seq: integer("last_snapshot_seq").default(0),
    last_analysis_time: timestamp("last_analysis_time", { withTimezone: true }),
    room_type: varchar("room_type", { length: 50 }),
    template_name: varchar("template_name", { length: 200 }),
    trtc_info: jsonb("trtc_info"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("live_sessions_status_idx").on(table.status),
    index("live_sessions_anchor_idx").on(table.anchor_name),
  ]
);

// 快照数据
export const snapshotData = pgTable(
  "snapshot_data",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    snapshot_seq: integer("snapshot_seq").notNull().default(0),
    snapshot_time: timestamp("snapshot_time", { withTimezone: true }),
    watcher_cnt: integer("watcher_cnt").default(0),
    comment_cnt: integer("comment_cnt").default(0),
    online_user_cnt: integer("online_user_cnt").default(0),
    order_total: numeric("order_total", { precision: 12, scale: 2 }).default("0"),
    order_count: integer("order_count").default(0),
    new_fan_conversion_rate: numeric("new_fan_conversion_rate", { precision: 5, scale: 4 }).default("0"),
    old_fan_conversion_rate: numeric("old_fan_conversion_rate", { precision: 5, scale: 4 }).default("0"),
    new_fan_pay_count: integer("new_fan_pay_count").default(0),
    old_fan_pay_count: integer("old_fan_pay_count").default(0),
    raw_json: jsonb("raw_json"),
    transcription: text("transcription"),
    recording_url: varchar("recording_url", { length: 500 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("snapshot_data_session_idx").on(table.session_id),
    index("snapshot_data_seq_idx").on(table.session_id, table.snapshot_seq),
  ]
);

// 分析报告
export const analysisReports = pgTable(
  "analysis_reports",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    report_type: varchar("report_type", { length: 50 }).notNull().default("segment"),
    segment_seq: integer("segment_seq").default(0),
    anchor_analysis: text("anchor_analysis"),
    interaction_analysis: text("interaction_analysis"),
    conversion_analysis: text("conversion_analysis"),
    sentiment_analysis: text("sentiment_analysis"),
    rhythm_analysis: text("rhythm_analysis"),
    analysis_text: text("analysis_text"),
    analysis_json: jsonb("analysis_json"),
    skill_version: varchar("skill_version", { length: 50 }),
    model_used: varchar("model_used", { length: 100 }),
    anchor_name: varchar("anchor_name", { length: 100 }),
    template_name: varchar("template_name", { length: 200 }),
    room_type: varchar("room_type", { length: 50 }),
    overall_score: numeric("overall_score", { precision: 3, scale: 1 }),
    anchor_score: numeric("anchor_score", { precision: 3, scale: 1 }),
    interaction_score: numeric("interaction_score", { precision: 3, scale: 1 }),
    conversion_score: numeric("conversion_score", { precision: 3, scale: 1 }),
    sentiment_score: numeric("sentiment_score", { precision: 3, scale: 1 }),
    rhythm_score: numeric("rhythm_score", { precision: 3, scale: 1 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analysis_reports_session_idx").on(table.session_id),
    index("analysis_reports_type_idx").on(table.report_type),
  ]
);

// 系统配置
export const systemConfig = pgTable(
  "system_config",
  {
    id: serial().primaryKey(),
    config_key: varchar("config_key", { length: 200 }).notNull().unique(),
    config_value: text("config_value"),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("system_config_key_idx").on(table.config_key),
  ]
);

// 实时预警
export const liveAlerts = pgTable(
  "live_alerts",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    alert_type: varchar("alert_type", { length: 50 }).notNull(),
    level: varchar("level", { length: 20 }),
    severity: varchar("severity", { length: 20 }).notNull().default("medium"),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    evidence: text("evidence"),
    suggestion: text("suggestion"),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    triggered_at: timestamp("triggered_at", { withTimezone: true }),
    resolved_at: timestamp("resolved_at", { withTimezone: true }),
    is_read: boolean("is_read").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("live_alerts_session_idx").on(table.session_id),
    index("live_alerts_severity_idx").on(table.severity),
    index("live_alerts_status_idx").on(table.status),
  ]
);

// 录制片段
export const recordingSegments = pgTable(
  "recording_segments",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    room_id: varchar("room_id", { length: 100 }),
    segment_seq: integer("segment_seq").notNull().default(0),
    start_time: timestamp("start_time", { withTimezone: true }),
    end_time: timestamp("end_time", { withTimezone: true }),
    duration_seconds: integer("duration_seconds").default(0),
    local_path: varchar("local_path", { length: 500 }),
    file_size: integer("file_size").default(0),
    status: varchar("status", { length: 20 }).default("pending"),
    transcribe_status: varchar("transcribe_status", { length: 20 }).default("pending"),
    error_message: text("error_message"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("recording_segments_session_idx").on(table.session_id),
  ]
);

// 行动项
export const actionItems = pgTable(
  "action_items",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    report_id: integer("report_id").references(() => analysisReports.id),
    anchor_name: varchar("anchor_name", { length: 100 }),
    dimension: varchar("dimension", { length: 50 }),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    priority: varchar("priority", { length: 20 }).default("medium"),
    source_quote: text("source_quote"),
    status: varchar("status", { length: 20 }).default("pending"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("action_items_session_idx").on(table.session_id),
  ]
);

// 知识库
export const analysisKnowledge = pgTable(
  "analysis_knowledge",
  {
    id: serial().primaryKey(),
    category: varchar("category", { length: 100 }).notNull(),
    dimension: varchar("dimension", { length: 50 }),
    key: varchar("key", { length: 500 }).notNull(),
    value: text("value").notNull(),
    confidence: integer("confidence").default(1),
    sample_count: integer("sample_count").default(1),
    last_validated_at: timestamp("last_validated_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("analysis_knowledge_category_idx").on(table.category),
    index("analysis_knowledge_key_idx").on(table.key),
  ]
);

// Skill版本
export const skillVersions = pgTable(
  "skill_versions",
  {
    id: serial().primaryKey(),
    version: varchar("version", { length: 50 }).notNull(),
    content: text("content"),
    change_log: text("change_log"),
    is_active: boolean("is_active").default(false),
    knowledge_snapshot: jsonb("knowledge_snapshot"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("skill_versions_version_idx").on(table.version),
  ]
);

// 直播脚本
export const liveScripts = pgTable(
  "live_scripts",
  {
    id: serial().primaryKey(),
    session_date: varchar("session_date", { length: 50 }),
    anchor_name: varchar("anchor_name", { length: 100 }),
    keywords: text("keywords"),
    content_points: text("content_points"),
    product_list: text("product_list"),
    transaction_data: text("transaction_data"),
    source: varchar("source", { length: 100 }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("live_scripts_anchor_idx").on(table.anchor_name),
  ]
);

// 分钟级指标
export const liveMetricsMinute = pgTable(
  "live_metrics_minute",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    minute_index: integer("minute_index").notNull().default(0),
    online_count: integer("online_count").default(0),
    comment_count: integer("comment_count").default(0),
    click_count: integer("click_count").default(0),
    order_count: integer("order_count").default(0),
    paid_count: integer("paid_count").default(0),
    paid_amount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0"),
    viewer_count: integer("viewer_count").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("live_metrics_minute_session_idx").on(table.session_id),
    index("live_metrics_minute_minute_idx").on(table.session_id, table.minute_index),
  ]
);

// 商品指标
export const liveGoodsMetrics = pgTable(
  "live_goods_metrics",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    goods_id: varchar("goods_id", { length: 100 }),
    goods_name: varchar("goods_name", { length: 500 }),
    click_count: integer("click_count").default(0),
    order_count: integer("order_count").default(0),
    paid_count: integer("paid_count").default(0),
    unpaid_count: integer("unpaid_count").default(0),
    pay_amount: numeric("pay_amount", { precision: 12, scale: 2 }).default("0"),
    click_to_order_rate: numeric("click_to_order_rate", { precision: 5, scale: 4 }).default("0"),
    order_to_pay_rate: numeric("order_to_pay_rate", { precision: 5, scale: 4 }).default("0"),
    click_to_pay_rate: numeric("click_to_pay_rate", { precision: 5, scale: 4 }).default("0"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("live_goods_metrics_session_idx").on(table.session_id),
    index("live_goods_metrics_goods_idx").on(table.session_id, table.goods_id),
  ]
);

// 时间轴事件
export const liveTimelineEvents = pgTable(
  "live_timeline_events",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    timestamp: timestamp("timestamp", { withTimezone: true }),
    offset_seconds: integer("offset_seconds").default(0),
    event_type: varchar("event_type", { length: 50 }).notNull(),
    content: text("content"),
    metrics: jsonb("metrics"),
    source: varchar("source", { length: 50 }).default("system"),
    importance: varchar("importance", { length: 20 }).default("medium"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("live_timeline_events_session_idx").on(table.session_id),
    index("live_timeline_events_type_idx").on(table.event_type),
  ]
);

// 后台任务
export const backgroundJobs = pgTable(
  "background_jobs",
  {
    id: serial().primaryKey(),
    job_type: varchar("job_type", { length: 100 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    payload: jsonb("payload"),
    max_retry: integer("max_retry").default(3),
    locked_by: varchar("locked_by", { length: 100 }),
    locked_until: timestamp("locked_until", { withTimezone: true }),
    started_at: timestamp("started_at", { withTimezone: true }),
    result: jsonb("result"),
    finished_at: timestamp("finished_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("background_jobs_type_idx").on(table.job_type),
    index("background_jobs_status_idx").on(table.status),
  ]
);

// Worker心跳
export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    id: serial().primaryKey(),
    worker_id: varchar("worker_id", { length: 100 }).notNull(),
    worker_type: varchar("worker_type", { length: 50 }).notNull(),
    status: varchar("status", { length: 20 }).notNull().default("running"),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("worker_heartbeats_worker_idx").on(table.worker_id),
  ]
);

// 主播画像
export const anchorProfiles = pgTable(
  "anchor_profiles",
  {
    id: serial().primaryKey(),
    anchor_name: varchar("anchor_name", { length: 100 }).notNull().unique(),
    avg_sales: numeric("avg_sales", { precision: 12, scale: 2 }),
    avg_viewers: integer("avg_viewers"),
    avg_online: integer("avg_online"),
    avg_conversion_rate: numeric("avg_conversion_rate", { precision: 5, scale: 4 }),
    avg_comment_rate: numeric("avg_comment_rate", { precision: 5, scale: 4 }),
    avg_score: numeric("avg_score", { precision: 3, scale: 1 }),
    dimension_scores: jsonb("dimension_scores"),
    strengths: text("strengths"),
    weaknesses: text("weaknesses"),
    best_product_types: text("best_product_types"),
    total_sessions: integer("total_sessions").default(0),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("anchor_profiles_name_idx").on(table.anchor_name),
  ]
);

// 主播记忆
export const anchorMemories = pgTable(
  "anchor_memories",
  {
    id: serial().primaryKey(),
    anchor_name: varchar("anchor_name", { length: 100 }).notNull(),
    schema_version: varchar("schema_version", { length: 20 }),
    created_by_model: varchar("created_by_model", { length: 100 }),
    last_updated_by_model: varchar("last_updated_by_model", { length: 100 }),
    is_archived: boolean("is_archived").default(false),
    key_observations: text("key_observations"),
    strengths: text("strengths"),
    improvement_areas: text("improvement_areas"),
    historical_summary: text("historical_summary"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("anchor_memories_name_idx").on(table.anchor_name),
  ]
);

// 商品记忆
export const productMemories = pgTable(
  "product_memories",
  {
    id: serial().primaryKey(),
    goods_name: varchar("goods_name", { length: 500 }).notNull(),
    schema_version: varchar("schema_version", { length: 20 }),
    created_by_model: varchar("created_by_model", { length: 100 }),
    last_updated_by_model: varchar("last_updated_by_model", { length: 100 }),
    is_archived: boolean("is_archived").default(false),
    conversion_insights: text("conversion_insights"),
    optimal_pitches: text("optimal_pitches"),
    performance_summary: text("performance_summary"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("product_memories_name_idx").on(table.goods_name),
  ]
);

// 会话记忆
export const sessionMemories = pgTable(
  "session_memories",
  {
    id: serial().primaryKey(),
    session_id: integer("session_id").notNull().references(() => liveSessions.id),
    schema_version: varchar("schema_version", { length: 20 }),
    analyzed_by_model: varchar("analyzed_by_model", { length: 100 }),
    is_archived: boolean("is_archived").default(false),
    key_insights: text("key_insights"),
    what_worked: text("what_worked"),
    what_failed: text("what_failed"),
    action_outcomes: text("action_outcomes"),
    new_learnings: text("new_learnings"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("session_memories_session_idx").on(table.session_id),
  ]
);

// 运行时日志
export const runtimeLogs = pgTable(
  "runtime_logs",
  {
    id: serial().primaryKey(),
    log_level: varchar("log_level", { length: 20 }).notNull().default("info"),
    log_type: varchar("log_type", { length: 50 }),
    source: varchar("source", { length: 100 }),
    message: text("message"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

// 系统操作日志
export const systemOperationLogs = pgTable(
  "system_operation_logs",
  {
    id: serial().primaryKey(),
    operation_type: varchar("operation_type", { length: 100 }),
    description: text("description"),
    status: varchar("status", { length: 20 }).default("success"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  }
);
