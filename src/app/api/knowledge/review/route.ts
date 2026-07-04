import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * GET /api/knowledge/review - 查询待审核知识
 * PUT /api/knowledge/review - 审核知识（通过/拒绝/修改）
 * POST /api/knowledge/review - 批量审核
 */

// 查询待审核知识
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'auto'; // auto/pending/approved/rejected
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '20'), 100);

  const client = getSupabaseClient();
  let query = client
    .from('analysis_knowledge')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status) query = query.eq('review_status', status);

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  // 获取各状态统计
  const { data: stats } = await client
    .from('analysis_knowledge')
    .select('review_status');

  const statusCounts: Record<string, number> = {};
  if (stats) {
    for (const s of stats) {
      statusCounts[s.review_status || 'auto'] = (statusCounts[s.review_status || 'auto'] || 0) + 1;
    }
  }

  return NextResponse.json({
    success: true,
    data: { items: data, total: count, page, pageSize, statusCounts },
  });
}

// 审核单条知识
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, review_status, value_override, confidence_override } = body;

    if (!id || !review_status) {
      return NextResponse.json({ success: false, error: 'id and review_status are required' }, { status: 400 });
    }

    if (!['approved', 'rejected', 'pending'].includes(review_status)) {
      return NextResponse.json({ success: false, error: 'review_status must be approved/rejected/pending' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const updates: Record<string, unknown> = {
      review_status,
      reviewed_at: new Date().toISOString(),
    };

    if (value_override !== undefined) updates.value = value_override;
    if (confidence_override !== undefined) updates.confidence = confidence_override;

    const { data, error } = await client
      .from('analysis_knowledge')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 如果拒绝，降低置信度到1
    if (review_status === 'rejected') {
      await client
        .from('analysis_knowledge')
        .update({ confidence: 1, decay_factor: 0.5 })
        .eq('id', id);
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// 批量审核
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, review_status } = body;

    if (!ids || !Array.isArray(ids) || !review_status) {
      return NextResponse.json({ success: false, error: 'ids (array) and review_status are required' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const updates: Record<string, unknown> = {
      review_status,
      reviewed_at: new Date().toISOString(),
    };

    if (review_status === 'rejected') {
      updates.confidence = 1;
      updates.decay_factor = 0.5;
    }

    const { error } = await client
      .from('analysis_knowledge')
      .update(updates)
      .in('id', ids);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `${ids.length} items updated to ${review_status}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
