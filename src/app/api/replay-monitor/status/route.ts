import { NextRequest, NextResponse } from 'next/server';
import { getReplaySessionStatus, getAllReplaySessions } from '@/lib/server/replay-monitor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (sessionId) {
      const result = await getReplaySessionStatus(parseInt(sessionId));
      return NextResponse.json({ success: true, data: result });
    } else {
      const result = await getAllReplaySessions();
      return NextResponse.json({ success: true, data: result });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取录播分析状态失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
