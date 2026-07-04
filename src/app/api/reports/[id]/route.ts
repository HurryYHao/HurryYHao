// GET /api/reports/[id] - 获取分析报告
import { NextRequest, NextResponse } from 'next/server';
import { generateMarkdownReport } from '@/lib/server/report';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const sessionId = parseInt(id, 10);

    if (isNaN(sessionId)) {
      return NextResponse.json({ success: false, error: '无效的会话ID' }, { status: 400 });
    }

    const format = new URL(request.url).searchParams.get('format') || 'json';

    if (format === 'markdown') {
      const md = await generateMarkdownReport(sessionId);
      return new Response(md, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }

    // JSON 格式：返回会话详情 + 快照 + 报告
    const client = getSupabaseClient();

    const { data: session, error: sessionError } = await client
      .from('live_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      return NextResponse.json({ success: false, error: '会话不存在' }, { status: 404 });
    }

    const { data: snapshots, error: snapError } = await client
      .from('snapshot_data')
      .select('id, snapshot_seq, snapshot_time, watcher_cnt, comment_cnt, online_user_cnt, order_total, order_count, new_fan_conversion_rate, old_fan_conversion_rate, new_fan_pay_count, old_fan_pay_count')
      .eq('session_id', sessionId)
      .order('snapshot_seq', { ascending: true });

    if (snapError) throw new Error(`查询快照失败: ${snapError.message}`);

    const { data: reports, error: reportError } = await client
      .from('analysis_reports')
      .select('*')
      .eq('session_id', sessionId)
      .order('segment_seq', { ascending: true });

    if (reportError) throw new Error(`查询报告失败: ${reportError.message}`);

    return NextResponse.json({
      success: true,
      data: {
        session,
        snapshots: snapshots || [],
        reports: reports || [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取报告失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
