import { NextRequest, NextResponse } from 'next/server';
import { runHealthCheck } from '@/lib/server/monitor-manager';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const checkType = searchParams.get('type') || 'all';
    
    // 获取最近的健康检查记录
    const client = getSupabaseClient();
    const { data: recentChecks } = await client
      .from('health_checks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);

    return NextResponse.json({
      success: true,
      data: {
        recent: recentChecks || []
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const checkType = searchParams.get('type') || 'all';
    
    const checks = await runHealthCheck(checkType);
    
    return NextResponse.json({
      success: true,
      data: checks
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
