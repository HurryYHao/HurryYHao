import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';

/**
 * POST /api/knowledge/delete
 * Body: { ids?: number[], category?: string, deleteAll?: boolean, type?: 'knowledge' | 'scripts' | 'all' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, category, deleteAll, type = 'knowledge' } = body as {
      ids?: number[];
      category?: string;
      deleteAll?: boolean;
      type?: 'knowledge' | 'scripts' | 'all';
    };

    const supabase = getSupabaseClient();
    let deletedKnowledge = 0;
    let deletedScripts = 0;

    // 删除知识库
    if (type === 'knowledge' || type === 'all') {
      if (deleteAll) {
        const { error, count } = await supabase.from('analysis_knowledge').delete().neq('id', 0);
        if (error) throw error;
        deletedKnowledge = count || 0;
      } else if (ids && ids.length > 0) {
        const { error, count } = await supabase.from('analysis_knowledge').delete().in('id', ids);
        if (error) throw error;
        deletedKnowledge = count || ids.length;
      } else if (category) {
        const { error, count } = await supabase.from('analysis_knowledge').delete().eq('category', category);
        if (error) throw error;
        deletedKnowledge = count || 0;
      }
    }

    // 删除话术
    if (type === 'scripts' || type === 'all') {
      if (deleteAll) {
        const { error, count } = await supabase.from('live_scripts').delete().neq('id', 0);
        if (error) throw error;
        deletedScripts = count || 0;
      } else if (ids && ids.length > 0) {
        const { error, count } = await supabase.from('live_scripts').delete().in('id', ids);
        if (error) throw error;
        deletedScripts = count || ids.length;
      }
    }

    if (deletedKnowledge === 0 && deletedScripts === 0) {
      return Response.json({ error: '未指定要删除的内容' }, { status: 400 });
    }

    return Response.json({
      success: true,
      deletedKnowledge,
      deletedScripts,
    });
  } catch (err) {
    console.error('[KnowledgeDelete] 删除失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
