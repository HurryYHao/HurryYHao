import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { runTestCases } from '@/lib/server/monitor-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const testCaseId = searchParams.get('testCaseId');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const client = getSupabaseClient();
    let query = client
      .from('monitor_test_runs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (testCaseId) query = query.eq('test_case_id', testCaseId);

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const { data, error, count } = await query.range(from, to);

    if (error) throw new Error(`Query failed: ${error.message}`);

    return NextResponse.json({
      success: true,
      data: {
        testRuns: data || [],
        total: count || 0,
        page,
        pageSize
      }
    });
  } catch (error) {
    console.error('Tests query error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(_request: NextRequest) {
  try {
    const results = await runTestCases();
    
    return NextResponse.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Run tests error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
