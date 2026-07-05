import { NextRequest } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const { message, history = [] } = await request.json();
    if (!message) {
      return Response.json({ error: '消息不能为空' }, { status: 400 });
    }

    // 1. 从知识库加载相关上下文
    const knowledgeContext = await buildKnowledgeContext(message);

    // 2. 加载历史脚本摘要
    const scriptsContext = await buildScriptsContext();

    // 3. 构建系统提示词
    const systemPrompt = `你是鑫云直播数据分析系统的AI助手，拥有完整的直播运营知识库。

【你的能力】
1. 基于知识库回答直播运营相关问题
2. 分析直播数据趋势和规律
3. 生成直播话术、脚本、运营方案
4. 提供商品定价和转化优化建议
5. 对比历史数据给出参考基准

【知识库数据】
${knowledgeContext}

【历史脚本参考】
${scriptsContext}

【回答要求】
- 优先引用知识库中的量化数据和基准值
- 给出具体可执行的建议，不要泛泛而谈
- 如涉及历史数据，标注场次日期
- 如无法从知识库找到依据，明确说明并给出通用建议`;

    // 4. 构建消息列表
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...history.slice(-10).map((h: { role: string; content: string }) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      { role: 'user' as const, content: message },
    ];

    // 5. 调用LLM
    const { LLMClient, Config } = await import('coze-coding-dev-sdk');
    const config = new Config();
    const client = new LLMClient(config);

    const llmResponse = await client.invoke(
      messages.map(h => ({ role: h.role as 'system' | 'user' | 'assistant', content: h.content })),
      { model: 'doubao-seed-2-0-pro-260215', temperature: 0.7 }
    );

    // 6. 返回响应（流式）
    const fullContent = llmResponse.content || '';
    const encoder = new TextEncoder();
    const chunkSize = 20;

    const readable = new ReadableStream({
      start(controller) {
        try {
          for (let i = 0; i < fullContent.length; i += chunkSize) {
            const content = fullContent.slice(i, i + chunkSize);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
        } catch (err) {
          console.error('[KnowledgeChat] 错误:', err);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[KnowledgeChat] 错误:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** 根据用户消息检索相关知识 */
async function buildKnowledgeContext(message: string): Promise<string> {
  try {
    const client = getSupabaseClient();

    const keywords = message
      .replace(/[，。？、！；：""''（）\[\]{}]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2)
      .slice(0, 5);

    let query = client
      .from('analysis_knowledge')
      .select('category, dimension, key, value, confidence, sample_count')
      .gte('confidence', 1)
      .order('confidence', { ascending: false })
      .limit(80);

    if (keywords.length > 0) {
      const { data: matched } = await client
        .from('analysis_knowledge')
        .select('category, dimension, key, value, confidence, sample_count')
        .gte('confidence', 1)
        .or(keywords.map(k => `key.ilike.%${k}%`).join(','))
        .order('confidence', { ascending: false })
        .limit(40);

      const matchedData = Array.isArray(matched) ? matched : [];
      
      if (matchedData.length > 0) {
        const { data: general } = await client
          .from('analysis_knowledge')
          .select('category, dimension, key, value, confidence, sample_count')
          .gte('confidence', 2)
          .order('confidence', { ascending: false })
          .limit(40);

        const generalData = Array.isArray(general) ? general : [];
        const all = [...(matchedData as any[]), ...(generalData as any[])];
        return formatKnowledge(all as unknown as KnowledgeItem[]);
      }
    }

    const { data } = await query;
    const queryData = Array.isArray(data) ? data : [];
    return formatKnowledge(queryData as unknown as KnowledgeItem[]);
  } catch (err) {
    console.error('[KnowledgeChat] 加载知识失败:', err);
    return '（知识库加载失败）';
  }
}

interface KnowledgeItem {
  category: string;
  dimension: string;
  key: string;
  value: string;
  confidence: number;
  sample_count: number;
}

function formatKnowledge(items: KnowledgeItem[]): string {
  if (items.length === 0) return '（暂无知识数据）';

  const grouped: Record<string, Array<{ key: string; value: string; confidence: number; sample_count: number }>> = {};
  for (const item of items) {
    const group = `${item.category}/${item.dimension}`;
    if (!grouped[group]) grouped[group] = [];
    if (!grouped[group].some(i => i.key === item.key)) {
      grouped[group].push({ key: item.key, value: item.value, confidence: item.confidence, sample_count: item.sample_count });
    }
  }

  const lines: string[] = [];
  for (const [group, entries] of Object.entries(grouped)) {
    lines.push(`【${group}】`);
    for (const e of entries.slice(0, 10)) {
      const stars = '★'.repeat(Math.min(e.confidence, 5));
      lines.push(`  ${e.key}: ${e.value} ${stars}(样本${e.sample_count})`);
    }
  }
  return lines.join('\n');
}

/** 加载历史脚本摘要 */
async function buildScriptsContext(): Promise<string> {
  try {
    const client = getSupabaseClient();
    const { data } = await client
      .from('live_scripts')
      .select('session_date, anchor_name, keywords, content_points, product_list, transaction_data')
      .order('session_date', { ascending: false })
      .limit(10);

    const scriptsData = Array.isArray(data) ? data : [];
    if (scriptsData.length === 0) return '（暂无历史脚本）';

    return scriptsData.map((s: any) => {
      const parts = [`📅 ${s.sessionDate} | ${s.anchorName || '未知主播'}`];
      if (s.keywords) parts.push(`  关键词: ${String(s.keywords).substring(0, 100)}`);
      if (s.contentPoints) parts.push(`  内容: ${String(s.contentPoints).substring(0, 150)}`);
      if (s.productList) parts.push(`  商品: ${String(s.productList).substring(0, 100)}`);
      if (s.transactionData) parts.push(`  成交: ${String(s.transactionData).substring(0, 80)}`);
      return parts.join('\n');
    }).join('\n\n');
  } catch {
    return '（脚本加载失败）';
  }
}
