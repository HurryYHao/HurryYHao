import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');

    const client = getSupabaseClient();

    // 获取alerts
    let query = client
      .from('live_alerts')
      .select('*')
      .order('triggered_at', { ascending: false })
      .limit(100);

    if (sessionId) {
      query = query.eq('session_id', parseInt(sessionId, 10));
    }

    const { data: alerts, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 获取相关session信息
    const sessionIds = [...new Set((alerts || []).map((a: any) => a.sessionId))];
    const sessionMap: Record<number, any> = {};

    if (sessionIds.length > 0) {
      const { data: sessions } = await client
        .from('live_sessions')
        .select('*')
        .in('id', sessionIds);

      (sessions || []).forEach((s: any) => {
        sessionMap[s.id] = s;
      });
    }

    // 计算每条预警相对于直播开始时间的偏移
    const enrichedData = (alerts || []).map((alert: any) => {
      const session = sessionMap[alert.sessionId];
      let offsetMinutes: number | null = null;
      if (session?.startTime && alert.triggeredAt) {
        const start = new Date(session.startTime).getTime();
        const triggered = new Date(alert.triggeredAt).getTime();
        offsetMinutes = Math.max(0, Math.round((triggered - start) / 60000));
      }
      return {
        ...alert,
        session: session ? {
          room_name: session.roomName,
          anchor_name: session.anchorName,
          start_time: session.startTime,
        } : null,
        offset_minutes: offsetMinutes,
      };
    });

    return NextResponse.json({ data: enrichedData });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, status: newStatus } = body;

    if (!id || !newStatus) {
      return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { data, error } = await client
      .from('live_alerts')
      .update({
        is_read: newStatus === 'read',
        updated_at: new Date().toISOString()
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
