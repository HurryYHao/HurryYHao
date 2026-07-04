import { getSupabaseClient } from '@/storage/database/supabase-client';

/** 导入技能包（从导出文件恢复到新环境） */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();
    const { data: skillPackage } = body;

    if (!skillPackage || !skillPackage._meta) {
      return Response.json({ error: '无效的技能包格式' }, { status: 400 });
    }

    const results = { knowledge: 0, scripts: 0, errors: [] as string[] };

    // 1. 导入知识条目
    if (skillPackage.knowledge && Array.isArray(skillPackage.knowledge)) {
      for (const item of skillPackage.knowledge) {
        const { error } = await supabase
          .from('analysis_knowledge')
          .upsert({
            category: item.category,
            dimension: item.dimension,
            key: item.key,
            value: item.value,
            source: item.source,
            confidence: item.confidence || 1,
            sample_count: item.sample_count || 1,
            last_validated_at: item.last_validated_at,
          }, { onConflict: 'category,dimension,key' });

        if (error) {
          results.errors.push(`knowledge:${item.key} - ${(error as any)?.message || error}`);
        } else {
          results.knowledge++;
        }
      }
    }

    // 2. 导入脚本
    if (skillPackage.scripts && Array.isArray(skillPackage.scripts)) {
      for (const script of skillPackage.scripts) {
        const { error } = await supabase
          .from('live_scripts')
          .upsert({
            session_date: script.session_date,
            anchor_name: script.anchor_name,
            keywords: script.keywords,
            content_points: script.content_points,
            product_list: script.product_list,
            transaction_data: script.transaction_data,
            replay_transaction: script.replay_transaction,
            source: script.source,
          }, { onConflict: 'session_date,anchor_name' });

        if (error) {
          results.errors.push(`script:${script.session_date} - ${(error as any)?.message || error}`);
        } else {
          results.scripts++;
        }
      }
    }

    console.log(`[KnowledgeImport] 导入完成: knowledge=${results.knowledge}, scripts=${results.scripts}, errors=${results.errors.length}`);

    return Response.json({
      success: true,
      imported: results,
      source: skillPackage._meta,
    });
  } catch (err) {
    console.error('[KnowledgeImport] 导入失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
