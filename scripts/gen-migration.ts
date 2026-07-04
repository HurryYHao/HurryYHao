import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('data/storage.json', 'utf-8'));

function esc(str: string | null | undefined): string {
  if (str === null || str === undefined) return 'NULL';
  const s = String(str).replace(/'/g, "''").replace(/\\/g, '\\\\');
  return `'${s}'`;
}

function ts(val: string | null | undefined): string {
  if (!val) return 'NULL';
  return `'${val}'`;
}

const sqls: string[] = [];

// analysis_reports
const reports = data.analysisReports || [];
reports.forEach((r: any) => {
  sqls.push(`INSERT INTO analysis_reports (id, session_id, report_type, segment_seq, analysis_text, anchor_name, template_name, overall_score, anchor_score, interaction_score, conversion_score, sentiment_score, rhythm_score, created_at, updated_at) VALUES (${r.id}, ${r.session_id}, ${esc(r.report_type)}, ${r.segment_seq || 0}, ${esc(r.analysis_text)}, ${esc(r.anchor_name)}, ${esc(r.template_name)}, ${r.overall_score || 0}, ${r.anchor_score || 0}, ${r.interaction_score || 0}, ${r.conversion_score || 0}, ${r.sentiment_score || 0}, ${r.rhythm_score || 0}, ${ts(r.created_at)}, ${ts(r.updated_at)}) ON CONFLICT DO NOTHING;`);
});

// snapshot_data
const snapshots = data.snapshotData || [];
snapshots.forEach((s: any) => {
  sqls.push(`INSERT INTO snapshot_data (id, session_id, snapshot_seq, snapshot_time, raw_json, created_at, updated_at) VALUES (${s.id}, ${s.session_id}, ${s.snapshot_seq || 0}, ${ts(s.snapshot_time)}, ${esc(JSON.stringify(s.raw_json))}, ${ts(s.created_at)}, ${ts(s.updated_at)}) ON CONFLICT DO NOTHING;`);
});

// anchor_profiles
const profiles = data.anchorProfiles || [];
profiles.forEach((p: any) => {
  sqls.push(`INSERT INTO anchor_profiles (id, anchor_name, profile_data, created_at, updated_at) VALUES (${p.id}, ${esc(p.anchor_name)}, ${esc(JSON.stringify(p.profile_data))}, ${ts(p.created_at)}, ${ts(p.updated_at)}) ON CONFLICT DO NOTHING;`);
});

// live_timeline_events
const events = data.liveTimelineEvents || [];
events.forEach((e: any) => {
  sqls.push(`INSERT INTO live_timeline_events (id, session_id, timestamp, offset_seconds, event_type, content, metrics, source, importance, created_at, updated_at) VALUES (${e.id}, ${e.session_id}, ${ts(e.timestamp)}, ${e.offset_seconds || 0}, ${esc(e.event_type)}, ${esc(e.content)}, ${e.metrics ? esc(JSON.stringify(e.metrics)) : 'NULL'}, ${esc(e.source)}, ${esc(e.importance)}, ${ts(e.created_at)}, ${ts(e.updated_at)}) ON CONFLICT DO NOTHING;`);
});

// live_metrics_minute
const metrics = data.liveMetricsMinute || [];
metrics.forEach((m: any) => {
  sqls.push(`INSERT INTO live_metrics_minute (id, session_id, minute_index, online_count, comment_count, order_count, paid_count, paid_amount, new_fans_count, created_at) VALUES (${m.id}, ${m.session_id}, ${m.minute_index || 0}, ${m.online_count || 0}, ${m.comment_count || 0}, ${m.order_count || 0}, ${m.paid_count || 0}, ${m.paid_amount || 0}, ${m.new_fans_count || 0}, ${ts(m.created_at)}) ON CONFLICT DO NOTHING;`);
});

// live_alerts
const alerts = data.liveAlerts || [];
alerts.forEach((a: any) => {
  sqls.push(`INSERT INTO live_alerts (id, session_id, alert_type, severity, title, description, offset_minutes, triggered_at, is_read, created_at, updated_at) VALUES (${a.id}, ${a.session_id}, ${esc(a.alert_type)}, ${esc(a.severity)}, ${esc(a.title)}, ${esc(a.description)}, ${a.offset_minutes || 0}, ${ts(a.triggered_at)}, ${a.is_read ? 'true' : 'false'}, ${ts(a.created_at)}, ${ts(a.updated_at)}) ON CONFLICT DO NOTHING;`);
});

// analysis_knowledge
const knowledge = data.analysisKnowledge || [];
knowledge.forEach((k: any) => {
  sqls.push(`INSERT INTO analysis_knowledge (id, category, dimension, key, value, source, confidence, sample_count, last_validated_at, created_at, updated_at) VALUES (${k.id}, ${esc(k.category)}, ${esc(k.dimension)}, ${esc(k.key)}, ${esc(k.value)}, ${esc(k.source)}, ${k.confidence || 0}, ${k.sample_count || 0}, ${ts(k.last_validated_at)}, ${ts(k.created_at)}, ${ts(k.updated_at)}) ON CONFLICT DO NOTHING;`);
});

// live_scripts
const scripts = data.liveScripts || [];
scripts.forEach((s: any) => {
  sqls.push(`INSERT INTO live_scripts (id, session_date, anchor_name, keywords, content_points, product_list, transaction_data, source, created_at, updated_at) VALUES (${s.id}, ${esc(s.session_date)}, ${esc(s.anchor_name)}, ${esc(s.keywords)}, ${esc(s.content_points)}, ${esc(s.product_list)}, ${esc(s.transaction_data)}, ${esc(s.source)}, ${ts(s.created_at)}, ${ts(s.updated_at)}) ON CONFLICT DO NOTHING;`);
});

writeFileSync('/tmp/migration.sql', sqls.join('\n'));
console.log(`Generated ${sqls.length} SQL statements`);
console.log('Written to /tmp/migration.sql');
