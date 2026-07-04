import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/action-items - 查询行动项列表
 * 支持按 status / anchor_name / session_id 筛选
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  const anchorName = searchParams.get('anchor_name');
  const sessionId = searchParams.get('session_id');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);

  const client = getSupabaseClient();
  let query = client
    .from('action_items')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status) query = query.eq('status', status);
  if (anchorName) query = query.eq('anchor_name', anchorName);
  if (sessionId) query = query.eq('session_id', sessionId);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    data: { items: data, total: count, page, pageSize },
  });
}

/**
 * PUT /api/action-items - 更新行动项状态
 * Body: { id, status, assignee, due_date, verified_in_session_id, verified_result }
 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, assignee, due_date, verified_in_session_id, verified_result } = body;

    if (!id) {
      return NextResponse.json({ success: false, error: 'id is required' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (status) updates.status = status;
    if (assignee !== undefined) updates.assignee = assignee;
    if (due_date !== undefined) updates.due_date = due_date;
    if (verified_in_session_id !== undefined) updates.verified_in_session_id = verified_in_session_id;
    if (verified_result !== undefined) updates.verified_result = verified_result;

    const { data, error } = await client
      .from('action_items')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/**
 * POST /api/action-items - 手动创建行动项
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, report_id, anchor_name, dimension, title, description, priority, assignee, due_date } = body;

    if (!session_id || !title) {
      return NextResponse.json({ success: false, error: 'session_id and title are required' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('action_items')
      .insert({
        session_id,
        report_id,
        anchor_name,
        dimension: dimension || 'general',
        title,
        description,
        priority: priority || 'medium',
        assignee,
        due_date,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
