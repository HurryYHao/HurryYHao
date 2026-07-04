import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const anchorName = searchParams.get('name');

    const client = getSupabaseClient();
    
    if (anchorName) {
      // Get single anchor profile
      const { data, error } = await client
        .from('anchor_profiles')
        .select('*')
        .eq('anchor_name', anchorName)
        .single();

      if (error && error.code !== 'PGRST116') {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      // Also get recent sessions for this anchor
      const { data: recentSessions } = await client
        .from('live_sessions')
        .select('id, room_name, start_time, end_time')
        .eq('anchor_name', anchorName)
        .order('start_time', { ascending: false })
        .limit(5);

      return NextResponse.json({ 
        data: data || null,
        recent_sessions: recentSessions || []
      });
    }

    // Get all anchor profiles
    const { data, error } = await client
      .from('anchor_profiles')
      .select('*')
      .order('avg_score', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
