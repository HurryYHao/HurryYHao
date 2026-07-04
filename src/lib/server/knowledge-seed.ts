/**
 * 知识库数据种子 - 生产环境初始化
 * 
 * 当数据库中 analysis_knowledge 为空时自动注入预置知识
 * 确保部署后新模型也能理解分析路径和标准
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

// 预置的行业基准知识 - 从历史数据提炼
const SEED_KNOWLEDGE = [
  // === 阈值类 (threshold) ===
  { category: 'threshold', dimension: 'interaction', key: '互动率_优秀', value: '≥5%，即(评论+点赞)/观看人数≥5%', confidence: 3, sample_count: 15 },
  { category: 'threshold', dimension: 'interaction', key: '互动率_良好', value: '3%-5%', confidence: 3, sample_count: 15 },
  { category: 'threshold', dimension: 'interaction', key: '互动率_需提升', value: '<3%，需优化互动话术', confidence: 3, sample_count: 15 },
  { category: 'threshold', dimension: 'conversion', key: '商品转化率_优秀', value: '≥3%，即支付人数/点击人数≥3%', confidence: 3, sample_count: 15 },
  { category: 'threshold', dimension: 'conversion', key: '商品转化率_良好', value: '1.5%-3%', confidence: 3, sample_count: 15 },
  { category: 'threshold', dimension: 'conversion', key: '未支付率_警告', value: '下单未支付率>30%需加逼单话术', confidence: 2, sample_count: 8 },
  { category: 'threshold', dimension: 'sentiment', key: '负面评论率_警告', value: '负面评论占比>10%需预警', confidence: 2, sample_count: 8 },
  { category: 'threshold', dimension: 'rhythm', key: '平均观看时长_优秀', value: '≥15分钟', confidence: 3, sample_count: 15 },
  { category: 'threshold', dimension: 'rhythm', key: '平均观看时长_良好', value: '8-15分钟', confidence: 3, sample_count: 15 },
  { category: 'threshold', dimension: 'anchor', key: '话术密度_优秀', value: '每分钟有效话术≥120字', confidence: 2, sample_count: 8 },
  
  // === 基准类 (benchmark) ===
  { category: 'benchmark', dimension: 'conversion', key: '行业平均转化率', value: '1.8%-2.5%（美妆个护类目）', confidence: 2, sample_count: 10 },
  { category: 'benchmark', dimension: 'conversion', key: '行业平均客单价', value: '150-300元（闺蜜直播间品类）', confidence: 2, sample_count: 10 },
  { category: 'benchmark', dimension: 'interaction', key: '行业平均互动率', value: '3%-4%（美妆个护直播间）', confidence: 2, sample_count: 10 },
  { category: 'benchmark', dimension: 'rhythm', key: '行业平均观看时长', value: '8-12分钟', confidence: 2, sample_count: 10 },
  { category: 'benchmark', dimension: 'sentiment', key: '行业平均好评率', value: '≥85%为正常', confidence: 2, sample_count: 10 },
  
  // === 模式类 (pattern) ===
  { category: 'pattern', dimension: 'rhythm', key: '流量高峰时段', value: '开播后5-15分钟、整点抽奖、憋单释放后3分钟', confidence: 3, sample_count: 20 },
  { category: 'pattern', dimension: 'rhythm', key: '流量低谷时段', value: '连续讲解同一商品超过5分钟时', confidence: 2, sample_count: 10 },
  { category: 'pattern', dimension: 'anchor', key: '高效话术结构', value: '痛点引入(30秒)→产品展示(60秒)→价格锚点(15秒)→逼单(15秒)', confidence: 3, sample_count: 15 },
  { category: 'pattern', dimension: 'anchor', key: '逼单话术模式', value: '库存有限+限时+从众效应："最后X单""XX人已拍""10分钟后关闭"', confidence: 3, sample_count: 15 },
  { category: 'pattern', dimension: 'interaction', key: '互动提升话术', value: '提问式互动："想要的扣1""用过的好评区说说效果"', confidence: 3, sample_count: 15 },
  { category: 'pattern', dimension: 'conversion', key: '高转化商品特征', value: '痛点明确+价格优势(低于日常)+限时限量+使用效果可演示', confidence: 2, sample_count: 8 },
  { category: 'pattern', dimension: 'sentiment', key: '负面评论高发场景', value: '发货慢、效果不如预期、价格偏高、客服响应慢', confidence: 2, sample_count: 8 },
  
  // === 规则类 (rule) ===
  { category: 'rule', dimension: 'conversion', key: '漏斗优化策略_点击低', value: '优化商品弹窗视觉设计，增加卖点关键词露出', confidence: 3, sample_count: 10 },
  { category: 'rule', dimension: 'conversion', key: '漏斗优化策略_下单未支付高', value: '增加逼单话术："未支付的订单10分钟后自动关闭，库存有限"', confidence: 3, sample_count: 10 },
  { category: 'rule', dimension: 'anchor', key: '新品讲解时长', value: '新品首次讲解≥3分钟，复讲可缩至90秒但需强调差异化卖点', confidence: 2, sample_count: 8 },
  { category: 'rule', dimension: 'rhythm', key: '话术节奏', value: '每5-8分钟切一个商品或互动环节，避免连续讲解超过8分钟', confidence: 2, sample_count: 8 },
  { category: 'rule', dimension: 'sentiment', key: '负面预警处理', value: '负面评论连续3条以上同主题→立即调整话术方向回应', confidence: 2, sample_count: 5 },
  { category: 'rule', dimension: 'general', key: '分析报告输出格式', value: '每维度：现状数据→对比基准→诊断结论→具体建议，建议需可执行', confidence: 4, sample_count: 30 },
  { category: 'rule', dimension: 'general', key: '片段分析vs整场分析', value: '片段分析聚焦本时段数据和话术-数据交叉；整场分析汇总全量数据+完整脚本+全场趋势', confidence: 3, sample_count: 15 },
];

let seedInitialized = false;

export async function ensureKnowledgeSeeded(): Promise<void> {
  if (seedInitialized) return;
  
  const supabase = getSupabaseClient();
  
  try {
    // 检查知识库是否为空
    const { count, error } = await supabase
      .from('analysis_knowledge')
      .select('*', { count: 'exact' });
    
    if (error) {
      console.error('[Seed] 检查知识库失败:', error);
      return;
    }
    
    if (count && count > 0) {
      console.log(`[Seed] 知识库已有 ${count} 条数据，跳过初始化`);
      seedInitialized = true;
      return;
    }
    
    // 知识库为空，注入预置知识
    console.log(`[Seed] 知识库为空，开始注入 ${SEED_KNOWLEDGE.length} 条预置知识...`);
    
    for (const knowledge of SEED_KNOWLEDGE) {
      const { error: insertError } = await supabase
        .from('analysis_knowledge')
        .upsert(knowledge, { onConflict: 'category,dimension,key' });
      
      if (insertError) {
        console.error(`[Seed] 插入失败: ${knowledge.key}`, insertError);
      }
    }
    
    console.log(`[Seed] 预置知识注入完成`);
    seedInitialized = true;
  } catch (err) {
    console.error('[Seed] 知识库初始化异常:', err);
  }
}
