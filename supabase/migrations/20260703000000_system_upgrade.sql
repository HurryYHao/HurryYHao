-- 核心场次表扩展
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS session_type VARCHAR(50);
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS product_category VARCHAR(100);
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS traffic_level VARCHAR(50);
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS final_status VARCHAR(50);
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS total_duration_seconds INTEGER;
ALTER TABLE live_sessions ADD COLUMN IF NOT EXISTS data_quality_score INTEGER;

-- 原始数据层
CREATE TABLE IF NOT EXISTS raw_live_payloads (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  snapshot_seq INTEGER NOT NULL,
  api_name VARCHAR(100) NOT NULL,
  request_params JSONB,
  response_data JSONB,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 指标层
CREATE TABLE IF NOT EXISTS live_metrics_minute (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  minute_index INTEGER NOT NULL,
  online_count INTEGER,
  comment_count INTEGER,
  click_count INTEGER,
  order_count INTEGER,
  paid_count INTEGER,
  paid_amount NUMERIC(10, 2),
  viewer_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_goods_metrics (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  goods_id VARCHAR(100) NOT NULL,
  goods_name TEXT NOT NULL,
  click_count INTEGER DEFAULT 0,
  order_count INTEGER DEFAULT 0,
  paid_count INTEGER DEFAULT 0,
  unpaid_count INTEGER DEFAULT 0,
  pay_amount NUMERIC(10, 2) DEFAULT 0,
  click_to_order_rate NUMERIC(5, 2),
  order_to_pay_rate NUMERIC(5, 2),
  click_to_pay_rate NUMERIC(5, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 内容层
CREATE TABLE IF NOT EXISTS recording_segments (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  room_id VARCHAR(100) NOT NULL,
  segment_seq INTEGER NOT NULL,
  start_time TIMESTAMP WITH TIME ZONE,
  end_time TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  local_path TEXT,
  storage_url TEXT,
  file_size BIGINT,
  status VARCHAR(50) DEFAULT 'recording', -- recording / completed / failed / uploaded
  transcribe_status VARCHAR(50) DEFAULT 'pending', -- pending / running / success / failed
  retry_count INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS live_timeline_events (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  offset_seconds INTEGER,
  event_type VARCHAR(50) NOT NULL,
  content TEXT,
  metrics JSONB,
  source VARCHAR(50), -- chart / comment / order / asr / ai
  importance VARCHAR(20) DEFAULT 'medium', -- low / medium / high
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS comment_insights (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  comment_id VARCHAR(100),
  comment_text TEXT NOT NULL,
  category VARCHAR(50),
  sentiment VARCHAR(20),
  importance VARCHAR(20) DEFAULT 'medium',
  answered BOOLEAN DEFAULT FALSE,
  answer_time TIMESTAMP WITH TIME ZONE,
  related_sales_after JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 分析层扩展
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS analysis_json JSONB;
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS overall_score NUMERIC(5, 2);
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS dimension_scores JSONB;
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS risk_level VARCHAR(20);
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS key_findings JSONB;
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS action_items JSONB;
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS prompt_version VARCHAR(50);
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS model_name VARCHAR(100);
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS knowledge_snapshot_id BIGINT;

CREATE TABLE IF NOT EXISTS analysis_report_items (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES analysis_reports(id) ON DELETE CASCADE,
  dimension VARCHAR(50),
  severity VARCHAR(20),
  title TEXT NOT NULL,
  evidence TEXT,
  suggestion TEXT,
  related_metric JSONB,
  related_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 知识层扩展
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS source_session_ids BIGINT[];
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS source_report_ids BIGINT[];
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS first_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS positive_count INTEGER DEFAULT 0;
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS negative_count INTEGER DEFAULT 0;
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS conflict_count INTEGER DEFAULT 0;
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS scope_anchor VARCHAR(100);
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS scope_product VARCHAR(100);
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS scope_traffic VARCHAR(50);
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS scope_session_type VARCHAR(50);
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'; -- active / weakened / archived
ALTER TABLE analysis_knowledge ADD COLUMN IF NOT EXISTS decay_score NUMERIC(5, 2) DEFAULT 0;

CREATE TABLE IF NOT EXISTS knowledge_usage_logs (
  id BIGSERIAL PRIMARY KEY,
  report_id BIGINT REFERENCES analysis_reports(id) ON DELETE CASCADE,
  knowledge_id BIGINT REFERENCES analysis_knowledge(id) ON DELETE CASCADE,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  used_dimension VARCHAR(50),
  prompt_version VARCHAR(50),
  model_name VARCHAR(100),
  output_reference TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS knowledge_conflicts (
  id BIGSERIAL PRIMARY KEY,
  knowledge_id BIGINT REFERENCES analysis_knowledge(id) ON DELETE CASCADE,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  conflict_reason TEXT NOT NULL,
  metric_evidence JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 任务和预警层
CREATE TABLE IF NOT EXISTS background_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type VARCHAR(50) NOT NULL, -- monitor / snapshot / record / transcribe / analysis / final_analysis
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  segment_seq INTEGER,
  status VARCHAR(50) DEFAULT 'pending', -- pending / running / success / failed / cancelled
  payload JSONB,
  result JSONB,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  max_retry INTEGER DEFAULT 3,
  locked_by VARCHAR(100),
  locked_until TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  started_at TIMESTAMP WITH TIME ZONE,
  finished_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS live_alerts (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  level VARCHAR(20) DEFAULT 'medium', -- low / medium / high / critical
  title TEXT NOT NULL,
  description TEXT,
  evidence JSONB,
  suggestion TEXT,
  status VARCHAR(20) DEFAULT 'open', -- open / auto_resolved / manually_resolved
  triggered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  resolved_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS review_tasks (
  id BIGSERIAL PRIMARY KEY,
  source_report_id BIGINT REFERENCES analysis_reports(id) ON DELETE CASCADE,
  session_id BIGINT REFERENCES live_sessions(id) ON DELETE CASCADE,
  anchor_name VARCHAR(100),
  dimension VARCHAR(50),
  problem TEXT,
  suggestion TEXT,
  priority VARCHAR(20) DEFAULT 'medium', -- high / medium / low
  owner_role VARCHAR(50), -- 主播 / 场控 / 运营 / 助教
  status VARCHAR(50) DEFAULT 'pending', -- pending / in_progress / done / auto_verified / failed
  verify_metric VARCHAR(100),
  target_value VARCHAR(100),
  actual_value VARCHAR(100),
  verify_session_id BIGINT REFERENCES live_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  verified_at TIMESTAMP WITH TIME ZONE
);

-- 审计与日志
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(100),
  action VARCHAR(100) NOT NULL,
  resource_type VARCHAR(50),
  resource_id VARCHAR(100),
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS worker_heartbeats (
  worker_id VARCHAR(100) PRIMARY KEY,
  worker_type VARCHAR(50),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status VARCHAR(20) DEFAULT 'online', -- online / offline
  current_job_id BIGINT
);

CREATE TABLE IF NOT EXISTS api_call_logs (
  id BIGSERIAL PRIMARY KEY,
  api_name VARCHAR(100) NOT NULL,
  status_code INTEGER,
  duration_ms INTEGER,
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 主播画像与商品画像
CREATE TABLE IF NOT EXISTS anchor_profiles (
  anchor_name VARCHAR(100) PRIMARY KEY,
  avg_sales NUMERIC(10, 2),
  avg_viewers INTEGER,
  avg_online INTEGER,
  avg_conversion_rate NUMERIC(5, 2),
  avg_comment_rate NUMERIC(5, 2),
  avg_score NUMERIC(5, 2),
  dimension_scores JSONB,
  strengths TEXT[],
  weaknesses TEXT[],
  best_product_types TEXT[],
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prompt_versions (
  id BIGSERIAL PRIMARY KEY,
  version VARCHAR(50) NOT NULL,
  prompt_type VARCHAR(50) NOT NULL, -- segment / final / knowledge_extract / alert
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT FALSE,
  changelog TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(prompt_type, version)
);
