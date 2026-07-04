import { NextRequest, NextResponse } from 'next/server';
import { fetchReplayAnalysis, fetchReplayChartData, fetchReplayNewoldData } from '@/lib/server/fetcher';

export async function POST(request: NextRequest) {
  try {
    const { roomId, liveSpaceId } = await request.json();

    if (!roomId || !liveSpaceId) {
      return NextResponse.json(
        { error: '缺少必要参数: roomId 和 liveSpaceId' },
        { status: 400 }
      );
    }

    // 并行获取所有录播统计数据
    const [analysis, chartData, newoldData] = await Promise.all([
      fetchReplayAnalysis(roomId, liveSpaceId),
      fetchReplayChartData(roomId, liveSpaceId),
      fetchReplayNewoldData(roomId, liveSpaceId),
    ]);

    return NextResponse.json({
      analysis,
      chartData,
      newoldData,
      success: true,
    });
  } catch (error) {
    console.error('获取录播统计数据失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取数据失败', success: false },
      { status: 500 }
    );
  }
}
