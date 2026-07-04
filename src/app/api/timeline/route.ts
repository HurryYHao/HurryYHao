import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    if (!sessionId) {
      return NextResponse.json({ error: 'Missing session_id' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // Get timeline events
    const { data: events, error: eventsError } = await client
      .from('live_timeline_events')
      .select('*')
      .eq('session_id', parseInt(sessionId, 10))
      .order('timestamp', { ascending: true });

    if (eventsError) {
      return NextResponse.json({ error: eventsError.message }, { status: 500 });
    }

    // Get minute-level metrics to overlay on timeline
    const { data: metrics, error: metricsError } = await client
      .from('live_metrics_minute')
      .select('minute_index, online_count, comment_count, order_count, paid_amount')
      .eq('session_id', parseInt(sessionId, 10))
      .order('minute_index', { ascending: true });

    if (metricsError) {
      return NextResponse.json({ error: metricsError.message }, { status: 500 });
    }

    return NextResponse.json({ 
      data: {
        events: events || [],
        metrics: metrics || []
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
