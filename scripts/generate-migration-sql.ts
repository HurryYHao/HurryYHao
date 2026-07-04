import { readFileSync } from 'fs';
import { join } from 'path';

// 直接使用exec_sql迁移 - 通过生成SQL文件
const dataPath = join(process.cwd(), 'data/storage.json');
const data = JSON.parse(readFileSync(dataPath, 'utf-8'));

function escapeSql(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  return "'" + String(str).replace(/'/g, "''").replace(/\\/g, "\\\\") + "'";
}

function escapeJson(obj: unknown): string {
  if (obj === null || obj === undefined) return 'NULL';
  return "'" + JSON.stringify(obj).replace(/'/g, "''").replace(/\\/g, "\\\\") + "'";
}

function toTs(val: string | null | undefined): string {
  if (!val) return 'NOW()';
  return escapeSql(val);
}

const sqls: string[] = [];

// 1. system_config
(data.systemConfig || []).forEach((c: Record<string, unknown>) => {
  sqls.push(`INSERT INTO system_config (key, value, created_at, updated_at) VALUES (${escapeSql(c.config_key as string)}, ${escapeJson(c.config_value)}, ${toTs(c.created_at as string)}, ${toTs(c.updated_at as string)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;`);
});

// 2. live_sessions
(data.liveSessions || []).forEach((s: Record<string, unknown>) => {
  sqls.push(`INSERT INTO live_sessions (id, room_id, room_name, anchor_name, status, start_time, end_time, live_token, last_snapshot_seq, last_analysis_time, created_at, updated_at) VALUES (${s.id}, ${escapeSql(s.room_id as string)}, ${escapeSql(s.room_name as string)}, ${escapeSql(s.anchor_name as string)}, ${escapeSql(s.status as string)}, ${toTs(s.start_time as string)}, ${s.end_time ? toTs(s.end_time as string) : 'NULL'}, ${escapeSql(s.live_token as string)}, ${s.last_snapshot_seq || 0}, ${s.last_analysis_time ? toTs(s.last_analysis_time as string) : 'NULL'}, ${toTs(s.created_at as string)}, ${toTs(s.updated_at as string)}) ON CONFLICT (id) DO UPDATE SET room_name = EXCLUDED.room_name, anchor_name = EXCLUDED.anchor_name, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at;`);
});

// 3. snapshot_data
(data.snapshotData || []).forEach((s: Record<string, unknown>) => {
  sqls.push(`INSERT INTO snapshot_data (id, session_id, snapshot_seq, snapshot_time, raw_json, created_at) VALUES (${s.id}, ${s.session_id}, ${s.snapshot_seq || 0}, ${toTs(s.snapshot_time as string)}, ${escapeJson(s.raw_json)}, ${toTs(s.created_at as string)}) ON CONFLICT DO NOTHING;`);
});

// 4. analysis_reports
(data.analysisReports || []).forEach((r: Record<string, unknown>) => {
  sqls.push(`INSERT INTO analysis_reports (id, session_id, report_type, segment_seq, analysis_text, anchor_name, template_name, overall_score, anchor_score, interaction_score, conversion_score, sentiment_score, rhythm_score, created_at, updated_at) VALUES (${r.id}, ${r.session_id}, ${escapeSql(r.report_type as string)}, ${r.segment_seq || 0}, ${escapeSql(r.analysis_text as string)}, ${escapeSql(r.anchor_name as string)}, ${escapeSql(r.template_name as string)}, ${r.overall_score || 0}, ${r.anchor_score || 0}, ${r.interaction_score || 0}, ${r.conversion_score || 0}, ${r.sentiment_score || 0}, ${r.rhythm_score || 0}, ${toTs(r.created_at as string)}, ${toTs(r.updated_at as string)}) ON CONFLICT DO NOTHING;`);
});

// 5. live_timeline_events
(data.liveTimelineEvents || []).forEach((e: Record<string, unknown>) => {
  sqls.push(`INSERT INTO live_timeline_events (id, session_id, timestamp, offset_seconds, event_type, content, metrics, source, importance, created_at, updated_at) VALUES (${e.id}, ${e.session_id}, ${toTs(e.timestamp as string)}, ${e.offset_seconds || 0}, ${escapeSql(e.event_type as string)}, ${escapeSql(e.content as string)}, ${e.metrics ? escapeJson(e.metrics) : 'NULL'}, ${escapeSql(e.source as string)}, ${escapeSql(e.importance as string)}, ${toTs(e.created_at as string)}, ${toTs(e.updated_at as string)}) ON CONFLICT DO NOTHING;`);
});

// 6. live_metrics_minute
const metrics = (data.liveMetricsMinute || []).slice(0, 50); // 限制前50条
metrics.forEach((m: Record<string, unknown>) => {
  sqls.push(`INSERT INTO live_metrics_minute (id, session_id, minute_index, online_count, comment_count, order_count, paid_count, paid_amount, new_fans_count, old_fans_count, created_at) VALUES (${m.id}, ${m.session_id}, ${m.minute_index || 0}, ${m.online_count || 0}, ${m.comment_count || 0}, ${m.order_count || 0}, ${m.paid_count || 0}, ${m.paid_amount || 0}, ${m.new_fans_count || 0}, ${m.old_fans_count || 0}, ${toTs(m.created_at as string)}) ON CONFLICT DO NOTHING;`);
});

// 7. live_alerts
(data.liveAlerts || []).forEach((a: Record<string, unknown>) => {
  sqls.push(`INSERT INTO live_alerts (id, session_id, alert_type, severity, title, message, triggered_at, is_resolved, created_at) VALUES (${a.id}, ${a.session_id}, ${escapeSql(a.alert_type as string)}, ${escapeSql(a.severity as string)}, ${escapeSql(a.title as string)}, ${escapeSql(a.message as string)}, ${toTs(a.triggered_at as string)}, ${a.is_resolved ? 'TRUE' : 'FALSE'}, ${toTs(a.created_at as string)}) ON CONFLICT DO NOTHING;`);
});

// 8. analysis_knowledge
(data.analysisKnowledge || []).forEach((k: Record<string, unknown>) => {
  sqls.push(`INSERT INTO analysis_knowledge (id, category, dimension, key, value, source, confidence, sample_count, last_validated_at, created_at, updated_at) VALUES (${k.id}, ${escapeSql(k.category as string)}, ${escapeSql(k.dimension as string)}, ${escapeSql(k.key as string)}, ${escapeSql(k.value as string)}, ${escapeSql(k.source as string)}, ${k.confidence || 0}, ${k.sample_count || 0}, ${toTs(k.last_validated_at as string)}, ${toTs(k.created_at as string)}, ${toTs(k.updated_at as string)}) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at;`);
});

// 9. live_scripts
(data.liveScripts || []).forEach((s: Record<string, unknown>) => {
  sqls.push(`INSERT INTO live_scripts (id, session_date, anchor_name, keywords, content_points, product_list, transaction_data, source, created_at, updated_at) VALUES (${s.id}, ${escapeSql(s.session_date as string)}, ${escapeSql(s.anchor_name as string)}, ${escapeSql(s.keywords as string)}, ${escapeSql(s.content_points as string)}, ${escapeSql(s.product_list as string)}, ${escapeSql(s.transaction_data as string)}, ${escapeSql(s.source as string)}, ${toTs(s.created_at as string)}, ${toTs(s.updated_at as string)}) ON CONFLICT DO NOTHING;`);
});

// 10. skill_versions
(data.skillVersions || []).forEach((s: Record<string, unknown>) => {
  sqls.push(`INSERT INTO skill_versions (id, skill_name, version, content, change_summary, is_active, created_at) VALUES (${s.id}, ${escapeSql(s.skill_name as string)}, ${escapeSql(s.version as string)}, ${escapeSql(s.content as string)}, ${escapeSql(s.change_summary as string)}, ${s.is_active ? 'TRUE' : 'FALSE'}, ${toTs(s.created_at as string)}) ON CONFLICT DO NOTHING;`);
});

// 输出SQL
const sql = sqls.join('\n');
const outPath = join(process.cwd(), 'scripts/migration.sql');
require('fs').writeFileSync(outPath, sql);
console.log(`生成 ${sqls.length} 条SQL语句，已写入 ${outPath}`);
