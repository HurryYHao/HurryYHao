import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const status = searchParams.get('status');

    const client = getSupabaseClient();
    let query = client
      .from('live_alerts')
      .select(`
        id,
        session_id,
        alert_type,
        severity,
        title,
        description,
        evidence,
        suggestion,
        status,
        triggered_at,
        resolved_at,
        live_sessions (
          room_name,
          anchor_name
        )
      `)
      .order('triggered_at', { ascending: false })
      .limit(100);

    if (sessionId) {
      query = query.eq('session_id', parseInt(sessionId, 10));
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('live_alerts')
      .update({
        status,
        resolved_at: status === 'resolved' || status === 'auto_resolved' ? new Date().toISOString() : null
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}