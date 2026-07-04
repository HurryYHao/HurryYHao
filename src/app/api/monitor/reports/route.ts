import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { generateReport } from '@/lib/server/monitor-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    const client = getSupabaseClient();
    let query = client
      .from('monitor_reports')
      .select('*')
      .order('created_at', { ascending: false });

    if (reportType) query = query.eq('report_type', reportType);

    const { data } = await query.limit(limit);

    return NextResponse.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Reports query error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reportType = searchParams.get('type') || 'daily';
    const body = await request.json();

    const startTime = body.startTime ? new Date(body.startTime) : undefined;
    const endTime = body.endTime ? new Date(body.endTime) : undefined;

    const report = await generateReport(reportType, startTime, endTime);

    return NextResponse.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Generate report error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
