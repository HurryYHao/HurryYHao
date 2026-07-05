import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids, id } = body;

    if (id) {
      // Single delete
      const supabase = getSupabaseClient();
      await supabase.from('live_scripts').delete().eq('id', id);
      return NextResponse.json({ success: true, message: '话术模板已删除' });
    }

    if (ids && Array.isArray(ids) && ids.length > 0) {
      // Batch delete
      const supabase = getSupabaseClient();
      await supabase.from('live_scripts').delete().in('id', ids);
      return NextResponse.json({ success: true, message: `已删除${ids.length}条话术模板` });
    }

    return NextResponse.json({ success: false, error: '缺少id或ids参数' }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[Knowledge Scripts Delete] error:', msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
