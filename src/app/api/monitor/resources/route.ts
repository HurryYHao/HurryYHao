import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getResourceUsage } from '@/lib/server/monitor-manager';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '100', 10);

    const client = getSupabaseClient();
    const { data } = await client
      .from('resource_usage')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    return NextResponse.json({
      success: true,
      data: data || []
    });
  } catch (error) {
    console.error('Resources query error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(_request: NextRequest) {
  try {
    const client = getSupabaseClient();
    const usage = getResourceUsage();
    
    await client.from('resource_usage').insert(usage);

    return NextResponse.json({
      success: true,
      data: usage
    });
  } catch (error) {
    console.error('Record resource error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
