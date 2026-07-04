import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const goodsName = searchParams.get('name');

    const client = getSupabaseClient();
    
    if (goodsName) {
      // 从 product_battle_cards 表获取单个商品的详情
      const { data: battleCard } = await client
        .from('product_battle_cards')
        .select('*')
        .eq('goods_name', goodsName)
        .maybeSingle();

      if (battleCard) {
        return NextResponse.json({ data: battleCard });
      }

      // 如果作战卡表中没有，则从原始数据计算
      const { data: snapshotData } = await client
        .from('snapshot_data')
        .select('*')
        .not('raw_json', 'is', null)
        .order('snapshot_time', { ascending: false });

      // Parse and filter snapshots that contain the product
      const productHistory = [];
      const productStats = {
        totalSessions: new Set(),
        totalClicks: 0,
        totalOrders: 0,
        totalPaid: 0,
        totalAmount: 0
      };

      for (const snapshot of (snapshotData || [])) {
        try {
          const rawJson = snapshot.raw_json as any;
          const orderDetails = rawJson?.orderDetails || [];
          
          for (const orderItem of (orderDetails as any[])) {
            // Check if this order item matches the goods_name
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
                pay_amount: payAmount
              });
            }
          }
        } catch (parseError) {
          // Skip invalid JSON
          continue;
        }
      }

      if (productHistory.length > 0) {
        const totalClicks = productStats.totalClicks;
        const totalOrders = productStats.totalOrders;
        const totalPaid = productStats.totalPaid;
        const totalAmount = productStats.totalAmount;
        const totalSessions = productStats.totalSessions.size;
        
        const avgClickToOrder = totalClicks > 0 ? (totalOrders / totalClicks) * 100 : 0;
        const avgOrderToPay = totalOrders > 0 ? (totalPaid / totalOrders) * 100 : 0;
        const avgClickToPay = totalClicks > 0 ? (totalPaid / totalClicks) * 100 : 0;

        // Find best session (highest pay_amount)
        const bestSession = [...productHistory].sort((a, b) => Number(b.pay_amount) - Number(a.pay_amount))[0];

        return NextResponse.json({ 
          data: {
            goods_name: goodsName,
            total_sessions: totalSessions,
            total_clicks: totalClicks,
            total_orders: totalOrders,
            total_paid: totalPaid,
            total_amount: totalAmount,
            avg_click_to_order_rate: avgClickToOrder.toFixed(2),
            avg_order_to_pay_rate: avgOrderToPay.toFixed(2),
            avg_click_to_pay_rate: avgClickToPay.toFixed(2),
            best_session: bestSession,
            history: productHistory.slice(0, 10) // recent 10 sessions
          }
        });
      }

      return NextResponse.json({ data: null });
    }

    // 从 product_battle_cards 表获取所有商品作战卡
    const { data: battleCards } = await client
      .from('product_battle_cards')
      .select('*')
      .order('updated_at', { ascending: false });

    if (battleCards && battleCards.length > 0) {
      // 格式化数据，从 summary_stats 中提取字段
      const formattedCards = battleCards.map((card: any) => ({
        id: card.id,
        goods_name: card.goods_name,
        session_count: card.summary_stats?.total_sessions || 0,
        total_clicks: card.summary_stats?.total_clicks || 0,
        total_orders: card.summary_stats?.total_orders || 0,
        total_paid: card.summary_stats?.total_paid || 0,
        total_amount: card.summary_stats?.total_amount || 0,
        click_to_pay_rate: card.summary_stats?.avg_click_to_pay_rate || '0.00',
        summary_stats: card.summary_stats,
        best_session: card.best_session,
        worst_session: card.worst_session,
        ai_analysis: card.ai_analysis,
        updated_at: card.updated_at
      }));

      return NextResponse.json({ data: formattedCards });
    }

    // 如果作战卡表为空，则从原始数据计算
    const { data: snapshotData } = await client
      .from('snapshot_data')
      .select('*')
      .not('raw_json', 'is', null)
      .order('snapshot_time', { ascending: false });

    // Parse all snapshots and aggregate products
    const productAggregation = new Map();

    for (const snapshot of (snapshotData || [])) {
      try {
        const rawJson = snapshot.raw_json as any;
        const orderDetails = rawJson?.orderDetails || [];
        
        for (const orderItem of (orderDetails as any[])) {
          const itemName = orderItem.goodsName || orderItem.goods_name || '';
          if (!itemName) continue;
          
          if (!productAggregation.has(itemName)) {
            productAggregation.set(itemName, {
              goods_name: itemName,
              session_count: 0,
              sessions: new Set(),
              total_clicks: 0,
              total_orders: 0,
              total_paid: 0,
              total_amount: 0
            });
          }
          
          const product = productAggregation.get(itemName);
          
          const clickCount = Number(orderItem.clickCount || orderItem.click_count || 0);
          const orderCount = Number(orderItem.orderCount || orderItem.order_count || 0);
          const paidCount = Number(orderItem.paidCount || orderItem.paid_count || 0);
          const payAmount = Number(orderItem.payAmount || orderItem.pay_amount || 0);
          
          product.sessions.add(snapshot.session_id);
          product.total_clicks += clickCount;
          product.total_orders += orderCount;
          product.total_paid += paidCount;
          product.total_amount += payAmount;
        }
      } catch (parseError) {
        // Skip invalid JSON
        continue;
      }
    }

    // Convert Map to array and calculate rates
    const result = Array.from(productAggregation.values()).map((product: any) => {
      product.session_count = product.sessions.size;
      delete product.sessions;
      product.click_to_pay_rate = product.total_clicks > 0 
        ? ((product.total_paid / product.total_clicks) * 100).toFixed(2) 
        : '0.00';
      return product;
    });

    // Sort by total amount descending
    result.sort((a: any, b: any) => b.total_amount - a.total_amount);

    return NextResponse.json({ data: result });
  } catch (error: any) {
    console.error('[Products API] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
