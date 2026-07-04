import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { analyzeProduct } from '@/lib/server/analyzer';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const { goodsName } = await request.json();
    
    if (!goodsName) {
      return NextResponse.json({ error: '商品名称不能为空' }, { status: 400 });
    }

    const client = getSupabaseClient();
    
    // Get product history data
    const { data: snapshotData, error: snapshotError } = await client
      .from('snapshot_data')
      .select(`
        id,
        session_id,
        snapshot_seq,
        snapshot_time,
        raw_json,
        live_sessions (
          id,
          room_id,
          room_name,
          anchor_name,
          start_time,
          room_type,
          template_name
        )
      `)
      .not('raw_json', 'is', null)
      .order('snapshot_time', { ascending: false });

    if (snapshotError) {
      return NextResponse.json({ error: snapshotError.message }, { status: 500 });
    }

    // Parse and filter snapshots that contain the product
    const productHistory = [];
    const productStats = {
      totalSessions: new Set(),
      totalClicks: 0,
      totalOrders: 0,
      totalPaid: 0,
      totalAmount: 0,
      sessions: []
    };

    for (const snapshot of (snapshotData || [])) {
      try {
        const rawJson = snapshot.raw_json as any;
        const orderDetails = rawJson?.orderDetails || [];
        
        for (const orderItem of (orderDetails as any[])) {
          // Check if this order item matches the goodsName
          const itemName = orderItem.goodsName || orderItem.goods_name || '';
          if (itemName.includes(goodsName) || goodsName.includes(itemName)) {
            // This snapshot contains the product
            productStats.totalSessions.add(snapshot.session_id);
            
            // Extract product data
            const clickCount = Number(orderItem.clickCount || orderItem.click_count || 0);
            const orderCount = Number(orderItem.orderCount || orderItem.order_count || 0);
            const paidCount = Number(orderItem.paidCount || orderItem.paid_count || 0);
            const payAmount = Number(orderItem.payAmount || orderItem.pay_amount || 0);
            
            productStats.totalClicks += clickCount;
            productStats.totalOrders += orderCount;
            productStats.totalPaid += paidCount;
            productStats.totalAmount += payAmount;
            
            productHistory.push({
              id: snapshot.id,
              session_id: snapshot.session_id,
              snapshot_seq: snapshot.snapshot_seq,
              snapshot_time: snapshot.snapshot_time,
              goods_name: itemName,
              click_count: clickCount,
              order_count: orderCount,
              paid_count: paidCount,
              pay_amount: payAmount,
              live_sessions: snapshot.live_sessions
            });
          }
        }
      } catch (parseError) {
        continue;
      }
    }

    if (productHistory.length === 0) {
      return NextResponse.json({ 
        error: '未找到该商品的历史数据',
        data: null 
      }, { status: 404 });
    }

    // Calculate derived stats
    const totalClicks = productStats.totalClicks;
    const totalOrders = productStats.totalOrders;
    const totalPaid = productStats.totalPaid;
    const totalAmount = productStats.totalAmount;
    const totalSessions = productStats.totalSessions.size;
    
    const avgClickToOrder = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0;
    const avgOrderToPay = totalOrders > 0 ? (totalPaid / totalOrders) * 100 : 0;
    const avgClickToPay = totalClicks > 0 ? (totalPaid / totalClicks) * 100 : 0;

    // Find best session
    const bestSession = [...productHistory].sort((a, b) => Number(b.pay_amount) - Number(a.pay_amount))[0];
    
    // Find worst session
    const worstSession = [...productHistory].sort((a, b) => Number(a.pay_amount) - Number(b.pay_amount))[0];

    // Get all unique sessions
    const sessionsBySessionId = new Map();
    for (const item of productHistory) {
      if (!sessionsBySessionId.has(item.session_id)) {
        sessionsBySessionId.set(item.session_id, {
          session_id: item.session_id,
          room_name: (item as any).room_name || (item as any).live_sessions?.room_name || '',
          anchor_name: (item as any).anchor_name || (item as any).live_sessions?.anchor_name || '',
          start_time: (item as any).start_time || (item as any).live_sessions?.start_time || '',
          items: []
        });
      }
      sessionsBySessionId.get(item.session_id).items.push(item);
    }

    const uniqueSessions = Array.from(sessionsBySessionId.values()).sort((a, b) => 
      new Date(b.start_time).getTime() - new Date(a.start_time).getTime()
    );

    // Prepare data for AI analysis
    const productData = {
      goods_name: goodsName,
      summary: {
        total_sessions: totalSessions,
        total_clicks: totalClicks,
        total_orders: totalOrders,
        total_paid: totalPaid,
        total_amount: totalAmount,
        avg_click_to_order_rate: avgClickToOrder.toFixed(2),
        avg_order_to_pay_rate: avgOrderToPay.toFixed(2),
        avg_click_to_pay_rate: avgClickToPay.toFixed(2),
        avg_amount_per_session: (totalAmount / totalSessions).toFixed(2)
      },
      best_session: bestSession,
      worst_session: worstSession,
      recent_sessions: uniqueSessions.slice(0, 5)
    };

    // Generate AI analysis
    const aiAnalysis = await analyzeProduct(productData);

    return NextResponse.json({ 
      data: {
        ...productData,
        ai_analysis: aiAnalysis
      }
    });
  } catch (error: any) {
    console.error('[API] 商品分析失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
