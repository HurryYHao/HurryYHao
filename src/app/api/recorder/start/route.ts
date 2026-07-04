/**
 * POST /api/recorder/start
 * 启动服务端 ffmpeg 音频录制
 * FLV 流无需认证，可直接拉流
 */
import { NextRequest, NextResponse } from 'next/server';
import { startAudioRecording, isRecording, webrtcToFlvUrl, resolveStreamUrl } from '@/lib/server/recorder';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { roomId?: string; sessionId?: number; roomName?: string };
    const { roomId, sessionId, roomName } = body;

    if (!roomId) {
      return NextResponse.json({ success: false, error: '缺少 roomId' }, { status: 400 });
    }

    // 检查是否已在录制
    if (isRecording(roomId)) {
      return NextResponse.json({ success: false, error: '该房间已在录制中' }, { status: 409 });
    }

    // 获取流地址
    const { mainUrl, source } = await resolveStreamUrl(roomId);
    const flvUrl = webrtcToFlvUrl(mainUrl);

    console.log(`[Recorder] 流地址来源: ${source}, webrtc: ${mainUrl}, flv: ${flvUrl}`);

    // 将 mainUrl 存到数据库以便后续使用
    if (sessionId) {
      try {
        const client = getSupabaseClient();
        await client
          .from('live_sessions')
          .update({ trtc_info: { mainUrl } } as Record<string, unknown>)
          .eq('id', sessionId);
      } catch {
        // 存储失败不影响录制
      }
    }

    // 启动录制
    const effectiveSessionId = sessionId || 0;
    const effectiveRoomName = roomName || '';
    const result = startAudioRecording(roomId, effectiveSessionId, mainUrl, 1, effectiveRoomName);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: {
        roomId,
        sessionId: effectiveSessionId,
        outputPath: result.outputPath,
        flvUrl,
        streamSource: source,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Recorder] 启动录制失败:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
