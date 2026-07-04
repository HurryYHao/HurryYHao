import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const status = searchParams.get('status');
    const anchorName = searchParams.get('anchor_name');

    const client = getSupabaseClient();
    let query = client
      .from('action_items')
      .select(`
        id,
        session_id,
        report_id,
        anchor_name,
        dimension,
        title,
        description,
        priority,
        assignee,
        status,
        due_date,
        verified_in_session_id,
        verified_result,
        source_quote,
        created_at,
        updated_at,
        live_sessions (
          room_name
        )
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    if (sessionId) {
      query = query.eq('session_id', parseInt(sessionId, 10));
    }
    if (status) {
      query = query.eq('status', status);
    }
    if (anchorName) {
      query = query.eq('anchor_name', anchorName);
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
    const { id, status, assignee, verified_result } = body;

    if (!id) {
      return NextResponse.json({ error: 'Missing task id' }, { status: 400 });
    }

    const updates: any = { updated_at: new Date().toISOString() };
    if (status) updates.status = status;
    if (assignee !== undefined) updates.assignee = assignee;
    if (verified_result !== undefined) updates.verified_result = verified_result;

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('action_items')
      .update(updates)
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