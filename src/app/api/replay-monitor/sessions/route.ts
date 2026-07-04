import { NextRequest, NextResponse } from 'next/server';
import { getReplaySessions } from '@/lib/server/replay-monitor';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');
    if (!roomId) {
      return NextResponse.json({ success: false, error: 'roomId 不能为空' }, { status: 400 });
    }

    const result = await getReplaySessions(roomId);
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    const message = err instanceof Error ? err.message : '获取录播场次失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
