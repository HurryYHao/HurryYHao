import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';

/**
 * POST /api/knowledge/import
 * 支持两种格式:
 * 1. 新格式: { knowledge: [...], scripts: [...], overwrite?: boolean }  (从 /api/knowledge/export?format=json 导出)
 * 2. 旧格式: { data: { _meta, knowledge, scripts } }  (技能包格式)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    // 兼容两种格式
    let knowledgeItems: any[] = [];
    let scriptItems: any[] = [];
    let overwrite = false;

    if (body.data && body.data._meta) {
      // 旧格式: 技能包
      knowledgeItems = body.data.knowledge || [];
      scriptItems = body.data.scripts || [];
    } else if (body.knowledge || body.scripts) {
      // 新格式: 直接从导出导入
      knowledgeItems = body.knowledge || [];
      scriptItems = body.scripts || [];
      overwrite = body.overwrite || false;
    } else {
      return Response.json({ error: '无效的导入数据格式' }, { status: 400 });
    }

    const results = { knowledge: 0, scripts: 0, errors: [] as string[] };

    // 导入知识条目
    for (const item of knowledgeItems) {
      try {
        if (overwrite) {
          // 先删再插
          await supabase
            .from('analysis_knowledge')
            .delete()
            .eq('category', item.category)
            .eq('dimension', item.dimension)
            .eq('key', item.key);
        }

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
          results.errors.push(`knowledge:${item.key} - ${error.message || error}`);
        } else {
          results.knowledge++;
        }
      } catch (e) {
        results.errors.push(`knowledge:${item.key} - ${String(e)}`);
      }
    }

    // 导入话术
    for (const script of scriptItems) {
      try {
        if (overwrite) {
          await supabase
            .from('live_scripts')
            .delete()
            .eq('session_date', script.session_date)
            .eq('anchor_name', script.anchor_name);
        }

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
            script_content: script.script_content,
          }, { onConflict: 'session_date,anchor_name' });

        if (error) {
          results.errors.push(`script:${script.session_date} - ${error.message || error}`);
        } else {
          results.scripts++;
        }
      } catch (e) {
        results.errors.push(`script:${script.session_date} - ${String(e)}`);
      }
    }

    console.log(`[KnowledgeImport] 导入完成: knowledge=${results.knowledge}, scripts=${results.scripts}, errors=${results.errors.length}`);

    return Response.json({
      success: true,
      imported: results,
    });
  } catch (err) {
    console.error('[KnowledgeImport] 导入失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
