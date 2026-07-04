// POST /api/analysis/run - 执行分析
// GET /api/analysis/run - 流式分析 (SSE)
import { NextRequest, NextResponse } from 'next/server';
import { runAnalysis, streamAnalysis } from '@/lib/server/analyzer';

export async function POST(request: NextRequest) {
  try {
    const { sessionId, roomId, segmentSeq, reportType } = await request.json();

    if (!sessionId || !roomId) {
      return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });
    }

    const reportId = await runAnalysis(
      sessionId,
      roomId,
      segmentSeq || 0,
      reportType || 'segment'
    );

    return NextResponse.json({ success: true, reportId });
  } catch (err) {
    const message = err instanceof Error ? err.message : '分析失败';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// SSE 流式分析
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = parseInt(searchParams.get('sessionId') || '0', 10);
  const roomId = searchParams.get('roomId') || '';
  const segmentSeq = parseInt(searchParams.get('segmentSeq') || '0', 10);
  const reportType = (searchParams.get('reportType') || 'segment') as 'segment' | 'final';

  if (!sessionId || !roomId) {
    return NextResponse.json({ error: '缺少参数' }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamAnalysis(sessionId, roomId, segmentSeq, reportType)) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      } catch (err) {
        const message = err instanceof Error ? err.message : '流式分析失败';
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: message })}\n\n`));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
