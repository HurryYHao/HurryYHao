import { NextRequest, NextResponse } from 'next/server';
import { getReplayRooms } from '@/lib/server/replay-monitor';

export async function GET(request: NextRequest) {
  console.log('[API] rooms 路由被调用');
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const size = parseInt(searchParams.get('size') || '50');

    console.log('[API] 调用 getReplayRooms, page:', page, 'size:', size);
    const result = await getReplayRooms(page, size);
    console.log('[API] getReplayRooms 返回:', result);
    
    return NextResponse.json({ success: true, data: result });
  } catch (err) {
    console.error('[API] 获取录播房间失败:', err);
    const message = err instanceof Error ? err.message : '获取录播房间失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
