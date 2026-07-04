-- ================================================
-- 持久化记忆存储系统数据库迁移
-- 版本: 1.0.0
-- 描述: 添加标准化记忆存储结构，支持跨AI模型数据共享
-- ================================================

-- 记忆版本管理表
CREATE TABLE IF NOT EXISTS public.memory_versions (
    id BIGSERIAL PRIMARY KEY,
    version VARCHAR(50) NOT NULL UNIQUE,
    schema_definition JSONB NOT NULL,
    change_log TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    migrated_at TIMESTAMP WITH TIME ZONE
);

-- AI模型元数据表
CREATE TABLE IF NOT EXISTS public.ai_model_metadata (
    id BIGSERIAL PRIMARY KEY,
    provider VARCHAR(50) NOT NULL,
    model_name VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),
    capabilities JSONB,
    memory_schema_version VARCHAR(50) NOT NULL,
    config JSONB,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 主播记忆档案表
CREATE TABLE IF NOT EXISTS public.anchor_memories (
    id BIGSERIAL PRIMARY KEY,
    anchor_name VARCHAR(100) NOT NULL,
    schema_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    personality_traits JSONB,
    speaking_style JSONB,
    strengths JSONB,
    improvement_areas JSONB,
    historical_summary TEXT,
    key_observations JSONB,
    best_practices JSONB,
    common_mistakes JSONB,
    product_specialties JSONB,
    performance_trends JSONB,
    created_by_model VARCHAR(100),
    last_updated_by_model VARCHAR(100),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE
);

-- 商品记忆档案表
CREATE TABLE IF NOT EXISTS public.product_memories (
    id BIGSERIAL PRIMARY KEY,
    goods_name VARCHAR(255) NOT NULL,
    schema_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    product_category VARCHAR(100),
    product_tags JSONB,
    performance_summary TEXT,
    best_performance JSONB,
    worst_performance JSONB,
    conversion_insights JSONB,
    optimal_pitches JSONB,
    pricing_strategies JSONB,
    display_tips JSONB,
    performance_trends JSONB,
    success_factors JSONB,
    created_by_model VARCHAR(100),
    last_updated_by_model VARCHAR(100),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    archived_at TIMESTAMP WITH TIME ZONE
);

-- 直播场景记忆表
CREATE TABLE IF NOT EXISTS public.session_memories (
    id BIGSERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES public.live_sessions(id) ON DELETE CASCADE,
    schema_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    room_name VARCHAR(255),
    anchor_name VARCHAR(100),
    session_date TIMESTAMP WITH TIME ZONE,
    key_insights JSONB,
    what_worked JSONB,
    what_failed JSONB,
    action_outcomes JSONB,
    learnings_applied JSONB,
    new_learnings JSONB,
    analyzed_by_model VARCHAR(100),
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 通用分析知识库表
CREATE TABLE IF NOT EXISTS public.general_knowledge_memories (
    id BIGSERIAL PRIMARY KEY,
    knowledge_type VARCHAR(50) NOT NULL,
    category VARCHAR(50) NOT NULL,
    schema_version VARCHAR(50) NOT NULL DEFAULT '1.0.0',
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    tags JSONB,
    validation_count INTEGER DEFAULT 0,
    success_rate NUMERIC(5, 2),
    source_sessions JSONB,
    created_by_model VARCHAR(100),
    last_validated_by_model VARCHAR(100),
    confidence INTEGER DEFAULT 3,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

-- 模型切换记录表
CREATE TABLE IF NOT EXISTS public.model_switch_logs (
    id BIGSERIAL PRIMARY KEY,
    old_provider VARCHAR(50),
    old_model VARCHAR(100),
    new_provider VARCHAR(50),
    new_model VARCHAR(100),
    old_schema_version VARCHAR(50),
    new_schema_version VARCHAR(50),
    migration_status VARCHAR(20) DEFAULT 'pending',
    migration_details JSONB,
    error_message TEXT,
    triggered_by VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- ================================================
-- 创建索引
-- ================================================

-- memory_versions 索引
CREATE INDEX IF NOT EXISTS idx_memory_versions_is_active ON public.memory_versions(is_active);
CREATE INDEX IF NOT EXISTS idx_memory_versions_version ON public.memory_versions(version);

-- ai_model_metadata 索引
CREATE INDEX IF NOT EXISTS idx_ai_model_provider ON public.ai_model_metadata(provider);
CREATE INDEX IF NOT EXISTS idx_ai_model_is_active ON public.ai_model_metadata(is_active);
CREATE INDEX IF NOT EXISTS idx_ai_model_memory_version ON public.ai_model_metadata(memory_schema_version);

-- anchor_memories 索引
CREATE INDEX IF NOT EXISTS idx_anchor_memories_name ON public.anchor_memories(anchor_name);
CREATE INDEX IF NOT EXISTS idx_anchor_memories_schema_version ON public.anchor_memories(schema_version);
CREATE INDEX IF NOT EXISTS idx_anchor_memories_is_archived ON public.anchor_memories(is_archived);

-- product_memories 索引
CREATE INDEX IF NOT EXISTS idx_product_memories_name ON public.product_memories(goods_name);
CREATE INDEX IF NOT EXISTS idx_product_memories_schema_version ON public.product_memories(schema_version);
CREATE INDEX IF NOT EXISTS idx_product_memories_is_archived ON public.product_memories(is_archived);

-- session_memories 索引
CREATE INDEX IF NOT EXISTS idx_session_memories_session_id ON public.session_memories(session_id);
CREATE INDEX IF NOT EXISTS idx_session_memories_anchor_name ON public.session_memories(anchor_name);
CREATE INDEX IF NOT EXISTS idx_session_memories_schema_version ON public.session_memories(schema_version);

-- general_knowledge_memories 索引
CREATE INDEX IF NOT EXISTS idx_general_knowledge_type ON public.general_knowledge_memories(knowledge_type);
CREATE INDEX IF NOT EXISTS idx_general_knowledge_category ON public.general_knowledge_memories(category);
CREATE INDEX IF NOT EXISTS idx_general_knowledge_schema_version ON public.general_knowledge_memories(schema_version);
CREATE INDEX IF NOT EXISTS idx_general_knowledge_is_archived ON public.general_knowledge_memories(is_archived);

-- model_switch_logs 索引
CREATE INDEX IF NOT EXISTS idx_model_switch_created_at ON public.model_switch_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_model_switch_status ON public.model_switch_logs(migration_status);

-- ================================================
-- 初始化数据
-- ================================================

-- 插入初始记忆版本
INSERT INTO public.memory_versions (version, schema_definition, change_log, is_active)
VALUES (
    '1.0.0',
    '{
        "description": "初始版本的记忆存储结构",
        "tables": ["anchor_memories", "product_memories", "session_memories", "general_knowledge_memories"],
        "compatibility": ["zhenjing", "coze", "openai"]
    }'::jsonb,
    '初始版本，支持主播记忆、商品记忆、场景记忆和通用知识库',
    1
) ON CONFLICT (version) DO NOTHING;

-- ================================================
-- RLS 策略配置
-- ================================================

ALTER TABLE public.memory_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anchor_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.general_knowledge_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.model_switch_logs ENABLE ROW LEVEL SECURITY;

-- 为所有记忆表创建允许认证用户读写的策略
CREATE POLICY "Enable read access for authenticated users on memory tables" ON public.memory_versions FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable write access for authenticated users on memory tables" ON public.memory_versions FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for authenticated users on model metadata" ON public.ai_model_metadata FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable write access for authenticated users on model metadata" ON public.ai_model_metadata FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for authenticated users on anchor memories" ON public.anchor_memories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable write access for authenticated users on anchor memories" ON public.anchor_memories FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for authenticated users on product memories" ON public.product_memories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable write access for authenticated users on product memories" ON public.product_memories FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for authenticated users on session memories" ON public.session_memories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable write access for authenticated users on session memories" ON public.session_memories FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for authenticated users on general knowledge" ON public.general_knowledge_memories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable write access for authenticated users on general knowledge" ON public.general_knowledge_memories FOR ALL USING (auth.uid() IS NOT NULL);

CREATE POLICY "Enable read access for authenticated users on model switch logs" ON public.model_switch_logs FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Enable write access for authenticated users on model switch logs" ON public.model_switch_logs FOR ALL USING (auth.uid() IS NOT NULL);
