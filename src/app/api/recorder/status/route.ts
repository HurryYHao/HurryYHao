/**
 * GET /api/recorder/status
 * 获取所有活跃录制状态
 */
import { NextResponse } from 'next/server';
import { getActiveRecordings } from '@/lib/server/recorder';

export async function GET() {
  try {
    const recordings = getActiveRecordings();
    return NextResponse.json({ success: true, data: recordings });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
