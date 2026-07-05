import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';

/**
 * POST /api/reports/import
 * Body: { reports: Array<ReportData>, overwrite?: boolean }
 * 导入报告数据（从之前导出的JSON）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reports, overwrite } = body as {
      reports: Array<Record<string, unknown>>;
      overwrite?: boolean;
    };

    if (!reports || !Array.isArray(reports) || reports.length === 0) {
      return Response.json({ error: '无有效的报告数据' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    let imported = 0;
    let skipped = 0;
    let updated = 0;

    for (const report of reports) {
      // 检查是否已存在 (用 session_id + report_type + segment_seq 判断)
      const existing = await supabase
        .from('analysis_reports')
        .select('id')
        .eq('session_id', report.session_id)
        .eq('report_type', report.report_type)
        .eq('segment_seq', report.segment_seq || 0)
        .maybeSingle();

      if (existing.data) {
        if (overwrite) {
          // 覆盖更新
          const { error } = await supabase
            .from('analysis_reports')
            .update({
              anchor_analysis: report.anchor_analysis,
              interaction_analysis: report.interaction_analysis,
              conversion_analysis: report.conversion_analysis,
              sentiment_analysis: report.sentiment_analysis,
              rhythm_analysis: report.rhythm_analysis,
              action_items: report.action_items,
              alerts: report.alerts,
              markdown_content: report.markdown_content,
            })
            .eq('id', (existing.data as any).id);
          if (error) {
            console.error('[ReportsImport] 更新失败:', error);
            skipped++;
          } else {
            updated++;
          }
        } else {
          skipped++;
        }
      } else {
        // 插入新记录
        const { error } = await supabase
          .from('analysis_reports')
          .insert({
            session_id: report.session_id,
            report_type: report.report_type,
            segment_seq: report.segment_seq || 0,
            anchor_analysis: report.anchor_analysis,
            interaction_analysis: report.interaction_analysis,
            conversion_analysis: report.conversion_analysis,
            sentiment_analysis: report.sentiment_analysis,
            rhythm_analysis: report.rhythm_analysis,
            action_items: report.action_items,
            alerts: report.alerts,
            markdown_content: report.markdown_content,
          });
        if (error) {
          console.error('[ReportsImport] 插入失败:', error);
          skipped++;
        } else {
          imported++;
        }
      }
    }

    return Response.json({
      success: true,
      imported,
      updated,
      skipped,
      total: reports.length,
    });
  } catch (err) {
    console.error('[ReportsImport] 导入失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
