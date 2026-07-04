// GET /api/sessions - 获取所有会话列表
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '20', 10);

    const client = getSupabaseClient();

    let query = client
      .from('live_sessions')
      .select('id, room_id, room_name, start_time, end_time, status, last_snapshot_seq, created_at, anchor_name, template_name, room_type', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) throw new Error(`查询会话列表失败: ${error.message}`);

    return NextResponse.json({
      success: true,
      data: {
        sessions: data || [],
        total: count || 0,
        page,
        pageSize,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取会话列表失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
