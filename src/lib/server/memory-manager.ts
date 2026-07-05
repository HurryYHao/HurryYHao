// 持久化记忆管理服务
// 功能：
// - 标准化记忆数据结构管理
// - 记忆的全生命周期管理（CRUD + 归档）
// - 版本兼容校验和自动迁移
// - 跨AI模型记忆数据共享

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { AI_PROVIDERS } from './config';

// ============================================
// 类型定义
// ============================================

export interface MemoryVersion {
  id?: number;
  version: string;
  schema_definition: Record<string, any>;
  change_log?: string;
  is_active: number;
  created_at: string;
  migrated_at?: string;
}

export interface AIModelMetadata {
  id?: number;
  provider: string;
  model_name: string;
  model_version?: string;
  capabilities?: string[];
  memory_schema_version: string;
  config?: Record<string, any>;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface AnchorMemory {
  id?: number;
  anchor_name: string;
  schema_version: string;
  personality_traits?: string[];
  speaking_style?: Record<string, any>;
  strengths?: string[];
  improvement_areas?: string[];
  historical_summary?: string;
  key_observations?: string[];
  best_practices?: string[];
  common_mistakes?: string[];
  product_specialties?: string[];
  performance_trends?: Record<string, any>;
  created_by_model?: string;
  last_updated_by_model?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  archived_at?: string;
}

export interface ProductMemory {
  id?: number;
  goods_name: string;
  schema_version: string;
  product_category?: string;
  product_tags?: string[];
  performance_summary?: string;
  best_performance?: Record<string, any>;
  worst_performance?: Record<string, any>;
  conversion_insights?: string[];
  optimal_pitches?: string[];
  pricing_strategies?: string[];
  display_tips?: string[];
  performance_trends?: Record<string, any>;
  success_factors?: string[];
  created_by_model?: string;
  last_updated_by_model?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  archived_at?: string;
}

export interface SessionMemory {
  id?: number;
  session_id: number;
  schema_version: string;
  room_name?: string;
  anchor_name?: string;
  session_date?: string;
  key_insights?: string[];
  what_worked?: string[];
  what_failed?: string[];
  action_outcomes?: Record<string, any>[];
  learnings_applied?: string[];
  new_learnings?: string[];
  analyzed_by_model?: string;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface GeneralKnowledgeMemory {
  id?: number;
  knowledge_type: string;
  category: string;
  schema_version: string;
  title: string;
  content: string;
  tags?: string[];
  validation_count?: number;
  success_rate?: number;
  source_sessions?: number[];
  created_by_model?: string;
  last_validated_by_model?: string;
  confidence?: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ModelSwitchLog {
  id?: number;
  old_provider?: string;
  old_model?: string;
  new_provider?: string;
  new_model?: string;
  old_schema_version?: string;
  new_schema_version?: string;
  migration_status?: string;
  migration_details?: Record<string, any>;
  error_message?: string;
  triggered_by?: string;
  created_at: string;
  completed_at?: string;
}

// ============================================
// 版本兼容性管理
// ============================================

const CURRENT_SCHEMA_VERSION = '1.0.0';

const SCHEMA_COMPATIBILITY: Record<string, string[]> = {
  '1.0.0': ['1.0.0'],
};

const SCHEMA_MIGRATORS: Record<string, (data: any, fromVersion: string, toVersion: string) => any> = {
  // 预留未来版本迁移函数
};

// ============================================
// 记忆管理类
// ============================================

export class MemoryManager {
  private client: ReturnType<typeof getSupabaseClient>;
  
  constructor() {
    this.client = getSupabaseClient();
  }

  // ==========================================
  // 版本管理
  // ==========================================

  async getActiveSchemaVersion(): Promise<string> {
    const { data, error } = await this.client
      .from('memory_versions')
      .select('version')
      .eq('is_active', 1)
      .single();
    
    if (error || !data) {
      return CURRENT_SCHEMA_VERSION;
    }
    return data.version;
  }

  async getAllSchemaVersions(): Promise<MemoryVersion[]> {
    const { data, error } = await this.client
      .from('memory_versions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      throw new Error(`Failed to get schema versions: ${error.message}`);
    }
    return data || [];
  }

  // ==========================================
  // AI模型元数据管理
  // ==========================================

  async registerModelMetadata(metadata: Omit<AIModelMetadata, 'id' | 'created_at' | 'updated_at'>): Promise<AIModelMetadata> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('ai_model_metadata')
      .insert({
        ...metadata,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to register model metadata: ${error.message}`);
    }
    return data;
  }

  async getActiveModelMetadata(): Promise<AIModelMetadata | null> {
    const { data, error } = await this.client
      .from('ai_model_metadata')
      .select('*')
      .eq('is_active', 1)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && (error as Error & { code?: string }).code !== 'PGRST116') {
      throw new Error(`Failed to get active model: ${error.message}`);
    }
    return data || null;
  }

  // ==========================================
  // 版本兼容检查与数据迁移
  // ==========================================

  /**
   * 检查数据版本兼容性，必要时自动迁移
   */
  async ensureVersionCompatibility<T>(
    data: T, 
    dataSchemaVersion: string,
    targetSchemaVersion?: string
  ): Promise<T> {
    const targetVersion = targetSchemaVersion || await this.getActiveSchemaVersion();
    
    if (dataSchemaVersion === targetVersion) {
      return data;
    }
    
    const compatibleVersions = SCHEMA_COMPATIBILITY[targetVersion] || [targetVersion];
    if (compatibleVersions.includes(dataSchemaVersion)) {
      return data;
    }
    
    return this.migrateData(data, dataSchemaVersion, targetVersion);
  }

  private migrateData<T>(data: T, fromVersion: string, toVersion: string): T {
    console.log(`Migrating memory data from ${fromVersion} to ${toVersion}`);
    
    const migratorKey = `${fromVersion}-${toVersion}`;
    if (SCHEMA_MIGRATORS[migratorKey]) {
      return SCHEMA_MIGRATORS[migratorKey](data, fromVersion, toVersion);
    }
    
    const backwardMigratorKey = `${toVersion}-${fromVersion}`;
    if (SCHEMA_MIGRATORS[backwardMigratorKey]) {
      return SCHEMA_MIGRATORS[backwardMigratorKey](data, fromVersion, toVersion);
    }
    
    console.warn(`No migrator found for ${fromVersion} -> ${toVersion}, returning data as-is`);
    return data;
  }

  // ==========================================
  // 主播记忆管理
  // ==========================================

  async getAnchorMemory(anchorName: string): Promise<AnchorMemory | null> {
    const { data, error } = await this.client
      .from('anchor_memories')
      .select('*')
      .eq('anchor_name', anchorName)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && (error as Error & { code?: string }).code !== 'PGRST116') {
      throw new Error(`Failed to get anchor memory: ${error.message}`);
    }
    
    if (data) {
      return await this.ensureVersionCompatibility(data, data.schema_version);
    }
    return null;
  }

  async createOrUpdateAnchorMemory(
    anchorName: string, 
    updates: Partial<Omit<AnchorMemory, 'id' | 'anchor_name' | 'created_at' | 'updated_at'>>,
    modelIdentifier: string
  ): Promise<AnchorMemory> {
    const existing = await this.getAnchorMemory(anchorName);
    const now = new Date().toISOString();
    const currentVersion = await this.getActiveSchemaVersion();
    
    if (existing) {
      const { data, error } = await this.client
        .from('anchor_memories')
        .update({
          ...updates,
          last_updated_by_model: modelIdentifier,
          updated_at: now,
          schema_version: currentVersion,
        })
        .eq('id', existing.id!)
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to update anchor memory: ${error.message}`);
      }
      return data;
    } else {
      const { data, error } = await this.client
        .from('anchor_memories')
        .insert({
          anchor_name: anchorName,
          schema_version: currentVersion,
          created_by_model: modelIdentifier,
          last_updated_by_model: modelIdentifier,
          is_archived: false,
          created_at: now,
          updated_at: now,
          ...updates,
        })
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to create anchor memory: ${error.message}`);
      }
      return data;
    }
  }

  async archiveAnchorMemory(anchorName: string): Promise<void> {
    const now = new Date().toISOString();
    const { error } = await this.client
      .from('anchor_memories')
      .update({
        is_archived: true,
        archived_at: now,
        updated_at: now,
      })
      .eq('anchor_name', anchorName)
      .eq('is_archived', false);
    
    if (error) {
      throw new Error(`Failed to archive anchor memory: ${error.message}`);
    }
  }

  // ==========================================
  // 商品记忆管理
  // ==========================================

  async getProductMemory(goodsName: string): Promise<ProductMemory | null> {
    const { data, error } = await this.client
      .from('product_memories')
      .select('*')
      .eq('goods_name', goodsName)
      .eq('is_archived', false)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && (error as Error & { code?: string }).code !== 'PGRST116') {
      throw new Error(`Failed to get product memory: ${error.message}`);
    }
    
    if (data) {
      return await this.ensureVersionCompatibility(data, data.schema_version);
    }
    return null;
  }

  async createOrUpdateProductMemory(
    goodsName: string,
    updates: Partial<Omit<ProductMemory, 'id' | 'goods_name' | 'created_at' | 'updated_at'>>,
    modelIdentifier: string
  ): Promise<ProductMemory> {
    const existing = await this.getProductMemory(goodsName);
    const now = new Date().toISOString();
    const currentVersion = await this.getActiveSchemaVersion();
    
    if (existing) {
      const { data, error } = await this.client
        .from('product_memories')
        .update({
          ...updates,
          last_updated_by_model: modelIdentifier,
          updated_at: now,
          schema_version: currentVersion,
        })
        .eq('id', existing.id!)
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to update product memory: ${error.message}`);
      }
      return data;
    } else {
      const { data, error } = await this.client
        .from('product_memories')
        .insert({
          goods_name: goodsName,
          schema_version: currentVersion,
          created_by_model: modelIdentifier,
          last_updated_by_model: modelIdentifier,
          is_archived: false,
          created_at: now,
          updated_at: now,
          ...updates,
        })
        .select()
        .single();
      
      if (error) {
        throw new Error(`Failed to create product memory: ${error.message}`);
      }
      return data;
    }
  }

  // ==========================================
  // 直播场景记忆管理
  // ==========================================

  async getSessionMemory(sessionId: number): Promise<SessionMemory | null> {
    const { data, error } = await this.client
      .from('session_memories')
      .select('*')
      .eq('session_id', sessionId)
      .eq('is_archived', false)
      .single();
    
    if (error && (error as Error & { code?: string }).code !== 'PGRST116') {
      throw new Error(`Failed to get session memory: ${error.message}`);
    }
    
    if (data) {
      return await this.ensureVersionCompatibility(data, data.schema_version);
    }
    return null;
  }

  async createSessionMemory(
    sessionId: number,
    data: Partial<Omit<SessionMemory, 'id' | 'session_id' | 'created_at' | 'updated_at'>>,
    modelIdentifier: string
  ): Promise<SessionMemory> {
    const now = new Date().toISOString();
    const currentVersion = await this.getActiveSchemaVersion();
    
    const { data: result, error } = await this.client
      .from('session_memories')
      .insert({
        session_id: sessionId,
        schema_version: currentVersion,
        analyzed_by_model: modelIdentifier,
        is_archived: false,
        created_at: now,
        updated_at: now,
        ...data,
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create session memory: ${error.message}`);
    }
    return result;
  }

  // ==========================================
  // 通用知识库管理
  // ==========================================

  async getGeneralKnowledge(category?: string, limit: number = 20): Promise<GeneralKnowledgeMemory[]> {
    let query = this.client
      .from('general_knowledge_memories')
      .select('*')
      .eq('is_archived', false)
      .order('confidence', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(limit);
    
    if (category) {
      query = query.eq('category', category);
    }
    
    const { data, error } = await query;
    
    if (error) {
      throw new Error(`Failed to get general knowledge: ${error.message}`);
    }
    
    const results: GeneralKnowledgeMemory[] = [];
    for (const item of data || []) {
      results.push(await this.ensureVersionCompatibility(item, item.schema_version));
    }
    return results;
  }

  async createGeneralKnowledge(
    knowledge: Omit<GeneralKnowledgeMemory, 'id' | 'created_at' | 'updated_at'>,
    modelIdentifier: string
  ): Promise<GeneralKnowledgeMemory> {
    const now = new Date().toISOString();
    const currentVersion = await this.getActiveSchemaVersion();
    
    const { data, error } = await this.client
      .from('general_knowledge_memories')
      .insert({
        ...knowledge,
        schema_version: currentVersion,
        created_by_model: modelIdentifier,
        is_archived: false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to create general knowledge: ${error.message}`);
    }
    return data;
  }

  async validateKnowledge(knowledgeId: number, success: boolean, modelIdentifier: string): Promise<void> {
    const { data: existing } = await this.client
      .from('general_knowledge_memories')
      .select('*')
      .eq('id', knowledgeId)
      .single();
    
    if (!existing) return;
    
    const newValidationCount = (existing.validation_count || 0) + 1;
    const currentSuccessCount = Math.round((existing.success_rate || 0) * (existing.validation_count || 0));
    const newSuccessCount = success ? currentSuccessCount + 1 : currentSuccessCount;
    const newSuccessRate = newSuccessCount / newValidationCount;
    
    await this.client
      .from('general_knowledge_memories')
      .update({
        validation_count: newValidationCount,
        success_rate: newSuccessRate,
        last_validated_by_model: modelIdentifier,
        updated_at: new Date().toISOString(),
      })
      .eq('id', knowledgeId);
  }

  // ==========================================
  // 模型切换管理
  // ==========================================

  async logModelSwitch(
    oldProvider: string | undefined,
    oldModel: string | undefined,
    newProvider: string,
    newModel: string,
    triggeredBy: string = 'system'
  ): Promise<ModelSwitchLog> {
    const now = new Date().toISOString();
    const currentVersion = await this.getActiveSchemaVersion();
    
    const { data, error } = await this.client
      .from('model_switch_logs')
      .insert({
        old_provider: oldProvider,
        old_model: oldModel,
        new_provider: newProvider,
        new_model: newModel,
        old_schema_version: oldProvider ? currentVersion : undefined,
        new_schema_version: currentVersion,
        migration_status: 'pending',
        triggered_by: triggeredBy,
        created_at: now,
      })
      .select()
      .single();
    
    if (error) {
      throw new Error(`Failed to log model switch: ${error.message}`);
    }
    return data;
  }

  async completeModelSwitch(logId: number, success: boolean, details?: Record<string, any>, errorMessage?: string): Promise<void> {
    const now = new Date().toISOString();
    await this.client
      .from('model_switch_logs')
      .update({
        migration_status: success ? 'completed' : 'failed',
        migration_details: details,
        error_message: errorMessage,
        completed_at: now,
      })
      .eq('id', logId);
  }

  // ==========================================
  // 上下文获取 - 为AI分析提供历史记忆
  // ==========================================

  async getContextForAnalysis(
    anchorName: string,
    goodsNames?: string[],
    limitRecentSessions: number = 3
  ): Promise<{
    anchorMemory: AnchorMemory | null;
    productMemories: ProductMemory[];
    recentSessionMemories: SessionMemory[];
    generalKnowledge: GeneralKnowledgeMemory[];
  }> {
    const [
      anchorMemory,
      generalKnowledge
    ] = await Promise.all([
      this.getAnchorMemory(anchorName),
      this.getGeneralKnowledge(undefined, 10)
    ]);
    
    const productMemories: ProductMemory[] = [];
    if (goodsNames && goodsNames.length > 0) {
      for (const goodsName of goodsNames) {
        const productMemory = await this.getProductMemory(goodsName);
        if (productMemory) {
          productMemories.push(productMemory);
        }
      }
    }
    
    const { data: sessions } = await this.client
      .from('live_sessions')
      .select('id')
      .eq('anchor_name', anchorName)
      .eq('status', 'ended')
      .order('end_time', { ascending: false })
      .limit(limitRecentSessions);
    
    const recentSessionMemories: SessionMemory[] = [];
    if (sessions && sessions.length > 0) {
      for (const session of sessions) {
        const sessionMemory = await this.getSessionMemory(session.id);
        if (sessionMemory) {
          recentSessionMemories.push(sessionMemory);
        }
      }
    }
    
    return {
      anchorMemory,
      productMemories,
      recentSessionMemories,
      generalKnowledge,
    };
  }

  // ==========================================
  // 辅助方法
  // ==========================================

  getModelIdentifier(provider: string, modelName: string): string {
    return `${provider}:${modelName}`;
  }

  // 安全解析 text 字段为数组：text 字段可能是 JSON 字符串（数组/对象）或 null
  private safeParseArray(value: unknown): string[] {
    if (Array.isArray(value)) return value;
    if (value == null || value === '') return [];
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed;
        // 如果解析结果是对象（如 {}），返回空数组
        return [];
      } catch {
        // 如果不是有效 JSON，按单个字符串返回
        return [value];
      }
    }
    return [];
  }

  formatMemoryForPrompt(context: Awaited<ReturnType<MemoryManager['getContextForAnalysis']>>): string {
    let prompt = '';
    
    if (context.anchorMemory) {
      const strengths = this.safeParseArray(context.anchorMemory.strengths);
      const improvementAreas = this.safeParseArray(context.anchorMemory.improvement_areas);
      const productSpecialties = this.safeParseArray(context.anchorMemory.product_specialties);
      
      prompt += `## 主播历史画像\n`;
      prompt += `- 主播: ${context.anchorMemory.anchor_name}\n`;
      if (context.anchorMemory.historical_summary) {
        prompt += `- 历史总结: ${context.anchorMemory.historical_summary}\n`;
      }
      if (strengths.length > 0) {
        prompt += `- 优势: ${strengths.join(', ')}\n`;
      }
      if (improvementAreas.length > 0) {
        prompt += `- 待改进: ${improvementAreas.join(', ')}\n`;
      }
      if (productSpecialties.length > 0) {
        prompt += `- 商品专长: ${productSpecialties.join(', ')}\n`;
      }
      prompt += '\n';
    }
    
    if (context.productMemories.length > 0) {
      prompt += `## 相关商品历史表现\n`;
      for (const product of context.productMemories) {
        const optimalPitches = this.safeParseArray(product.optimal_pitches);
        prompt += `### ${product.goods_name}\n`;
        if (product.performance_summary) {
          prompt += `- 表现总结: ${product.performance_summary}\n`;
        }
        if (optimalPitches.length > 0) {
          prompt += `- 有效话术: ${optimalPitches.slice(0, 3).join('; ')}\n`;
        }
        prompt += '\n';
      }
    }
    
    if (context.recentSessionMemories.length > 0) {
      prompt += `## 近期直播经验\n`;
      for (const session of context.recentSessionMemories) {
        const keyInsights = this.safeParseArray(session.key_insights);
        const whatWorked = this.safeParseArray(session.what_worked);
        const newLearnings = this.safeParseArray(session.new_learnings);
        if (keyInsights.length > 0) {
          prompt += `- 关键洞察: ${keyInsights.slice(0, 2).join('; ')}\n`;
        }
        if (whatWorked.length > 0) {
          prompt += `- 有效做法: ${whatWorked.slice(0, 2).join('; ')}\n`;
        }
        if (newLearnings.length > 0) {
          prompt += `- 新经验: ${newLearnings.slice(0, 2).join('; ')}\n`;
        }
      }
      prompt += '\n';
    }
    
    if (context.generalKnowledge.length > 0) {
      prompt += `## 通用知识库\n`;
      for (const knowledge of context.generalKnowledge.slice(0, 5)) {
        prompt += `- [${knowledge.knowledge_type}] ${knowledge.title}: ${knowledge.content.substring(0, 100)}...\n`;
      }
      prompt += '\n';
    }
    
    return prompt;
  }
}

export const memoryManager = new MemoryManager();
