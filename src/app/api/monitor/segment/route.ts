// POST /api/monitor/segment - 手动触发片段分析
import { NextRequest, NextResponse } from 'next/server';
import { runSegmentAnalysis } from '@/lib/server/monitor';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, roomId } = await request.json();

    if (!sessionId || !roomId) {
      return NextResponse.json(
        { success: false, error: '缺少 sessionId 或 roomId' },
        { status: 400 }
      );
    }

    await runSegmentAnalysis(sessionId, roomId);

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : '片段分析失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
