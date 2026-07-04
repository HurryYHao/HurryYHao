/**
 * GET /api/recorder/segments
 * 获取指定房间已录制的音频片段列表
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSegments } from '@/lib/server/recorder';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');
    const roomName = searchParams.get('roomName') || undefined;

    if (!roomId) {
      return NextResponse.json({ success: false, error: '缺少 roomId' }, { status: 400 });
    }

    const segments = await getSegments(roomId, roomName);
    return NextResponse.json({ success: true, data: segments });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
