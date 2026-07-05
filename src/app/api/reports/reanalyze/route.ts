// POST /api/reports/reanalyze - 重新分析报告
// 接受单个 reportId 或 reportIds 数组，重新发送数据给AI生成新报告
import { NextRequest, NextResponse } from 'next/server';
import { runAnalysis } from '@/lib/server/analyzer';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const reportId = body.reportId as number | undefined;
    const reportIds = body.reportIds as number[] | undefined;
    const ids = reportIds || (reportId ? [reportId] : []);

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: '缺少 reportId 或 reportIds' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const results: { id: number; newReportId: number; status: string }[] = [];
    const errors: { id: number; error: string }[] = [];

    for (const id of ids) {
      try {
        // 从现有报告获取 sessionId、reportType、segmentSeq
        const { data: report, error: reportError } = await client
          .from('analysis_reports')
          .select('id, session_id, report_type, segment_seq')
          .eq('id', id)
          .maybeSingle();

        if (reportError || !report) {
          errors.push({ id, error: '报告不存在' });
          continue;
        }

        // DbQueryBuilder 自动转为 camelCase
        const sessionId = report.sessionId as number;
        const reportType = report.reportType as 'segment' | 'final';
        const segmentSeq = (report.segmentSeq as number) || 0;

        // 从 live_sessions 获取 roomId
        const { data: session, error: sessionError } = await client
          .from('live_sessions')
          .select('room_id')
          .eq('id', sessionId)
          .maybeSingle();

        if (sessionError || !session) {
          errors.push({ id, error: '会话不存在' });
          continue;
        }

        const roomId = session.roomId as string;

        // 删除旧报告
        await client
          .from('analysis_reports')
          .delete()
          .eq('id', id);

        // 重新分析
        const newReportId = await runAnalysis(sessionId, roomId, segmentSeq, reportType);
        results.push({ id, newReportId, status: 'success' });
      } catch (err) {
        const message = err instanceof Error ? err.message : '重新分析失败';
        errors.push({ id, error: message });
      }
    }

    return NextResponse.json({
      success: errors.length === 0,
      data: { results, errors },
      message: errors.length > 0
        ? `${results.length} 份重新分析成功，${errors.length} 份失败`
        : `${results.length} 份重新分析成功`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '重新分析失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
