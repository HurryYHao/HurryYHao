import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';

/**
 * DELETE /api/reports/delete
 * Body: { sessionIds?: number[], reportIds?: number[], deleteAll?: boolean }
 * 删除报告：支持按会话ID、报告ID、或全部删除
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionIds, reportIds, deleteAll } = body as {
      sessionIds?: number[];
      reportIds?: number[];
      deleteAll?: boolean;
    };

    const supabase = getSupabaseClient();

    if (deleteAll) {
      // 删除所有报告
      const { error } = await supabase.from('analysis_reports').delete().neq('id', 0);
      if (error) throw error;
      return Response.json({ success: true, message: '已删除所有报告' });
    }

    let deletedCount = 0;

    // 按报告ID删除
    if (reportIds && reportIds.length > 0) {
      const { error, count } = await supabase
        .from('analysis_reports')
        .delete()
        .in('id', reportIds);
      if (error) throw error;
      deletedCount += count || reportIds.length;
    }

    // 按会话ID删除（删除该会话下的所有报告）
    if (sessionIds && sessionIds.length > 0) {
      const { error, count } = await supabase
        .from('analysis_reports')
        .delete()
        .in('session_id', sessionIds);
      if (error) throw error;
      deletedCount += count || 0;
    }

    if (deletedCount === 0) {
      return Response.json({ error: '未指定要删除的报告' }, { status: 400 });
    }

    return Response.json({ success: true, deletedCount });
  } catch (err) {
    console.error('[ReportsDelete] 删除失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
