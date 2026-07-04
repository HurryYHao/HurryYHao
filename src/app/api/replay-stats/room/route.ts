import { NextRequest, NextResponse } from 'next/server';
import { fetchRoomDetail, fetchLiveSpaceOptions, fetchChannelOptions } from '@/lib/server/fetcher';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const roomId = searchParams.get('roomId');
    const type = searchParams.get('type');

    if (!roomId) {
      return NextResponse.json(
        { error: '缺少必要参数: roomId' },
        { status: 400 }
      );
    }

    let data;
    switch (type) {
      case 'detail':
        data = await fetchRoomDetail(roomId);
        break;
      case 'liveSpaces':
        data = await fetchLiveSpaceOptions(roomId);
        break;
      case 'channels':
        data = await fetchChannelOptions(roomId);
        break;
      default:
        // 默认获取所有信息
        const [detail, liveSpaces, channels] = await Promise.all([
          fetchRoomDetail(roomId),
          fetchLiveSpaceOptions(roomId),
          fetchChannelOptions(roomId),
        ]);
        data = { detail, liveSpaces, channels };
    }

    return NextResponse.json({
      data,
      success: true,
    });
  } catch (error) {
    console.error('获取房间信息失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取数据失败', success: false },
      { status: 500 }
    );
  }
}
