import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 知识库自动质量控制核心逻辑
 * - 自动计算置信度
 * - 自动降权和衰减
 * - 自动更新状态 (active / weakened / archived)
 */
export async function runKnowledgeQualityControl() {
  console.log('[KnowledgeQualityControl] 开始执行自动质量控制...');
  const client = getSupabaseClient();

  // 1. 获取所有非 archived 的知识
  const { data: knowledges, error } = await client
    .from('analysis_knowledge')
    .select('*')
    .neq('status', 'archived');

  if (error || !knowledges) {
    console.error('[KnowledgeQualityControl] 获取知识失败:', error);
    return;
  }

  const now = new Date();

  for (const knowledge of knowledges) {
    let newConfidence = knowledge.confidence || 0;
    let newStatus = knowledge.status || 'active';
    let newDecayScore = knowledge.decay_score || 0;

    const positiveCount = knowledge.positive_count || 0;
    const negativeCount = knowledge.negative_count || 0;
    const conflictCount = knowledge.conflict_count || 0;
    const sampleCount = knowledge.sample_count || 1;

    // 2. 根据正反例计算置信度增减
    // 基础置信度由样本数决定
    let calculatedConfidence = Math.min(5, 1 + Math.floor(sampleCount / 3));

    // 正向验证加分
    calculatedConfidence += Math.floor(positiveCount / 2);
    
    // 反向验证/冲突减分
    calculatedConfidence -= (negativeCount * 0.5 + conflictCount * 1);

    // 3. 计算时间衰减 (如果超过30天未被使用/命中)
    const lastUsed = knowledge.last_used_at ? new Date(knowledge.last_used_at) : new Date(knowledge.created_at);
    const daysSinceLastUsed = Math.floor((now.getTime() - lastUsed.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceLastUsed > 30) {
      newDecayScore += Math.floor(daysSinceLastUsed / 15); // 每半个月加1点衰减分
    } else {
      newDecayScore = Math.max(0, newDecayScore - 1); // 经常使用则减少衰减分
    }

    calculatedConfidence -= newDecayScore * 0.5;

    // 限制置信度范围 0-5
    newConfidence = Math.max(0, Math.min(5, calculatedConfidence));

    // 4. 状态流转判定
    if (newConfidence >= 3 && conflictCount < 3) {
      newStatus = 'active';
    } else if (newConfidence >= 1 || conflictCount >= 3) {
      newStatus = 'weakened';
    } else if (newConfidence < 1 || newDecayScore > 5) {
      newStatus = 'archived';
    }

    // 5. 更新数据库
    if (
      newConfidence !== knowledge.confidence || 
      newStatus !== knowledge.status || 
      newDecayScore !== knowledge.decay_score
    ) {
      await client
        .from('analysis_knowledge')
        .update({
          confidence: newConfidence,
          status: newStatus,
          decay_score: newDecayScore
        })
        .eq('id', knowledge.id);
      
      console.log(`[KnowledgeQualityControl] 知识[${knowledge.id}] ${knowledge.key} 状态更新: ${knowledge.status}->${newStatus}, 置信度: ${knowledge.confidence}->${newConfidence}`);
    }
  }

  console.log('[KnowledgeQualityControl] 自动质量控制执行完毕');
}