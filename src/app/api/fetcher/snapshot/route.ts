// POST /api/fetcher/snapshot - 手动触发数据抓取
import { NextRequest, NextResponse } from 'next/server';
import { fetchAllSnapshotData } from '@/lib/server/fetcher';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, roomId } = await request.json();

    if (!sessionId || !roomId) {
      return NextResponse.json({ success: false, error: '缺少 sessionId 或 roomId' }, { status: 400 });
    }

    // 获取当前片段序号
    const client = getSupabaseClient();
    const { data: session, error } = await client
      .from('live_sessions')
      .select('last_snapshot_seq')
      .eq('id', sessionId)
      .maybeSingle();

    if (error || !session) {
      return NextResponse.json({ success: false, error: '会话不存在' }, { status: 404 });
    }

    const nextSeq = ((session as Record<string, unknown>).last_snapshot_seq as number || 0) + 1;

    await fetchAllSnapshotData(sessionId, roomId, nextSeq);

    // 更新片段序号
    await client
      .from('live_sessions')
      .update({ last_snapshot_seq: nextSeq })
      .eq('id', sessionId);

    return NextResponse.json({ success: true, seq: nextSeq });
  } catch (err) {
    const message = err instanceof Error ? err.message : '数据抓取失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
