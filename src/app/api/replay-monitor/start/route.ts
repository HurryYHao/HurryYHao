import { NextRequest, NextResponse } from 'next/server';
import { startReplaySession } from '@/lib/server/replay-monitor';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { roomId, roomName, liveSpaceId, sessionName, startTime, endTime } = body;

    if (!roomId || !roomName || !liveSpaceId) {
      return NextResponse.json(
        { success: false, error: 'roomId, roomName, liveSpaceId 为必填项' },
        { status: 400 }
      );
    }

    const sessionId = await startReplaySession(
      roomId,
      roomName,
      liveSpaceId,
      sessionName || `${roomName} - 录播分析`,
      startTime || new Date().toISOString(),
      endTime || new Date().toISOString()
    );

    return NextResponse.json({ success: true, data: { sessionId } });
  } catch (err) {
    const message = err instanceof Error ? err.message : '启动录播分析失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
