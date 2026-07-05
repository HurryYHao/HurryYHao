// POST /api/reports/reanalyze - 重新分析报告
// 从数据库读取已有的快照数据，重新构建prompt发给AI生成新报告
// 不重新调用鑫云API抓数据，只是把第一次分析用的数据重新发给AI
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
        // 1. 从现有报告获取 sessionId、reportType、segmentSeq
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

        // 2. 重新调用分析（runAnalysis 内部从DB读取快照数据，不调鑫云API）
        //    roomId 仅用于日志，传空字符串即可
        const newReportId = await runAnalysis(sessionId, '', segmentSeq, reportType);

        // 3. 新报告生成成功后，删除旧报告
        await client
          .from('analysis_reports')
          .delete()
          .eq('id', id);

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
