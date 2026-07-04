/**
 * POST /api/recorder/stop
 * 停止服务端 ffmpeg 音频录制
 */
import { NextRequest, NextResponse } from 'next/server';
import { stopAudioRecording, isRecording } from '@/lib/server/recorder';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { roomId?: string };
    const { roomId } = body;

    if (!roomId) {
      return NextResponse.json({ success: false, error: '缺少 roomId' }, { status: 400 });
    }

    if (!isRecording(roomId)) {
      return NextResponse.json({ success: false, error: '该房间未在录制' }, { status: 404 });
    }

    const result = stopAudioRecording(roomId);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: { roomId } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
