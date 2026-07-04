import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

let _db: ReturnType<typeof getSupabaseClient> | null = null;
function getDb() {
  if (!_db) _db = getSupabaseClient();
  return _db;
}

interface ScriptRow {
  seq: number;
  date: string;
  keywords: string;
  contentPoints: string;
  productList: string;
  transactionData: string;
  replayTransaction: string;
}

/**
 * POST /api/knowledge/feed
 * 投喂主播脚本和商品成交数据到知识库
 * Body: { scripts: ScriptRow[], source: string }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { scripts, source = 'manual' } = body as { scripts: ScriptRow[]; source?: string };

    if (!scripts || !Array.isArray(scripts) || scripts.length === 0) {
      return NextResponse.json({ error: 'scripts数组不能为空' }, { status: 400 });
    }

    let scriptsInserted = 0;
    let scriptsUpdated = 0;
    const knowledgeEntries: Array<{
      category: string;
      dimension: string;
      key: string;
      value: string;
      source: string;
      confidence: number;
      sample_count: number;
    }> = [];

    for (const script of scripts) {
      // 1. 写入live_scripts表
      const { error: scriptError } = await getDb()
        .from('live_scripts')
        .upsert({
          session_date: script.date,
          anchor_name: '雅文老师',
          keywords: script.keywords,
          content_points: script.contentPoints,
          product_list: script.productList,
          transaction_data: script.transactionData,
          replay_transaction: script.replayTransaction,
          source,
        }, { onConflict: 'session_date,anchor_name' });

      if (scriptError) {
        console.error('[KnowledgeFeed] 脚本写入失败:', script.date, (scriptError as any)?.message || scriptError);
        continue;
      }

      scriptsInserted++;

      // 2. 从脚本中提取知识写入analysis_knowledge
      // 2a. 提取核心关键词 → pattern类知识
      if (script.keywords) {
        const kwList = script.keywords.split(/[、,，]/).map(k => k.trim()).filter(Boolean);
        knowledgeEntries.push({
          category: 'pattern',
          dimension: 'anchor',
          key: `脚本关键词_${script.date}`,
          value: kwList.join(' | '),
          source: `script:${script.date}`,
          confidence: 3,
          sample_count: 1,
        });
      }

      // 2b. 提取产品清单 → benchmark类知识
      if (script.productList) {
        const products = script.productList.split('\n').filter(Boolean);
        products.forEach((p: string) => {
          const priceMatch = p.match(/(\d+\.?\d*)/);
          if (priceMatch) {
            const name = p.replace(/[\d.]+$/, '').trim();
            knowledgeEntries.push({
              category: 'benchmark',
              dimension: 'conversion',
              key: `商品定价_${name.substring(0, 50)}`,
              value: `${name} 售价${priceMatch[1]}元`,
              source: `script:${script.date}`,
              confidence: 3,
              sample_count: 1,
            });
          }
        });
      }

      // 2c. 提取成交数据 → benchmark类知识
      if (script.transactionData) {
        const totalMatch = script.transactionData.match(/总成交[：:]\s*([\d,.]+)\s*元/);
        if (totalMatch) {
          knowledgeEntries.push({
            category: 'benchmark',
            dimension: 'conversion',
            key: `单场成交额_${script.date}`,
            value: `${totalMatch[1]}元`,
            source: `script:${script.date}`,
            confidence: 4,
            sample_count: 1,
          });
        }

        // 提取单商品成交额
        const productSales = script.transactionData.matchAll(/(.+?)\s+([\d,.]+)元/g);
        for (const match of productSales) {
          const pName = match[1].trim();
          const pAmount = match[2];
          if (pName && pName.length > 1 && pName.length < 50 && !pName.includes('总成交')) {
            knowledgeEntries.push({
              category: 'benchmark',
              dimension: 'conversion',
              key: `商品成交_${pName}`,
              value: `${pAmount}元`,
              source: `script:${script.date}`,
              confidence: 3,
              sample_count: 1,
            });
          }
        }
      }

      // 2d. 提取内容要点 → pattern类知识
      if (script.contentPoints) {
        const points = script.contentPoints.split('\n').filter((p: string) => p.trim().length > 5);
        points.forEach((point: string, idx: number) => {
          const colonIdx = point.indexOf('：');
          if (colonIdx > 0 && colonIdx < 20) {
            const topic = point.substring(0, colonIdx).trim();
            knowledgeEntries.push({
              category: 'pattern',
              dimension: 'anchor',
              key: `话术主题_${script.date}_${idx + 1}`,
              value: `${topic}：${point.substring(colonIdx + 1).trim().substring(0, 100)}`,
              source: `script:${script.date}`,
              confidence: 3,
              sample_count: 1,
            });
          }
        });
      }
    }

    // 3. 批量写入analysis_knowledge（upsert with merge）
    let knowledgeInserted = 0;
    for (const entry of knowledgeEntries) {
      // 先查询是否已存在
      const { data: existing } = await getDb()
        .from('analysis_knowledge')
        .select('id, confidence, sample_count, value')
        .eq('category', entry.category)
        .eq('dimension', entry.dimension)
        .eq('key', entry.key)
        .maybeSingle();

      if (existing && !Array.isArray(existing)) {
        const existingEntry = existing as any;
        // 已存在: 合并 - 取更高置信度, 增加样本数, 拼接value
        const newValue = (existingEntry.value || '').includes(entry.value)
          ? existingEntry.value
          : `${existingEntry.value || ''} | ${entry.value}`;
        const { error: updateError } = await getDb()
          .from('analysis_knowledge')
          .update({
            value: newValue.substring(0, 2000),
            confidence: Math.min(5, Math.max(existingEntry.confidence || 0, entry.confidence)),
            sample_count: (existingEntry.sample_count || 0) + 1,
            last_validated_at: new Date().toISOString(),
          })
          .eq('id', existingEntry.id);

        if (!updateError) knowledgeInserted++;
      } else {
        const { error: insertError } = await getDb()
          .from('analysis_knowledge')
          .insert({
            ...entry,
            last_validated_at: new Date().toISOString(),
          });

        if (!insertError) knowledgeInserted++;
      }
    }

    // 4. 计算商品成交基准统计
    const { data: allBenchmarks } = await getDb()
      .from('analysis_knowledge')
      .select('key, value, sample_count')
      .eq('category', 'benchmark')
      .eq('dimension', 'conversion')
      .like('key', '单场成交额_%');

    const benchmarksData = Array.isArray(allBenchmarks) ? allBenchmarks : [];
    if (benchmarksData.length > 0) {
      const amounts = benchmarksData.map((b: any) => {
        const m = b.value.match(/([\d,.]+)/);
        return m ? parseFloat(m[1].replace(',', '')) : 0;
      }).filter((a: number) => a > 0);

      if (amounts.length > 0) {
        const avg = amounts.reduce((a: number, b: number) => a + b, 0) / amounts.length;
        const max = Math.max(...amounts);
        const min = Math.min(...amounts);

        // 写入/更新汇总基准
        const summaryKey = '单场成交额基准';
        const summaryValue = `历史${amounts.length}场均值: ${avg.toFixed(0)}元 | 最高: ${max.toFixed(0)}元 | 最低: ${min.toFixed(0)}元`;

        const { data: existingSummary } = await getDb()
          .from('analysis_knowledge')
          .select('id, sample_count')
          .eq('category', 'benchmark')
          .eq('dimension', 'conversion')
          .eq('key', summaryKey)
          .maybeSingle();

        if (existingSummary && !Array.isArray(existingSummary)) {
          const summaryEntry = existingSummary as any;
          await getDb()
            .from('analysis_knowledge')
            .update({
              value: summaryValue,
              sample_count: amounts.length,
              confidence: Math.min(5, (summaryEntry.sample_count || 0) + 1),
              last_validated_at: new Date().toISOString(),
            })
            .eq('id', summaryEntry.id);
        } else {
          await getDb()
            .from('analysis_knowledge')
            .insert({
              category: 'benchmark',
              dimension: 'conversion',
              key: summaryKey,
              value: summaryValue,
              source: 'aggregated',
              confidence: 4,
              sample_count: amounts.length,
              last_validated_at: new Date().toISOString(),
            });
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        scriptsProcessed: scripts.length,
        scriptsInserted,
        knowledgeExtracted: knowledgeEntries.length,
        knowledgeInserted,
      },
    });
  } catch (error) {
    console.error('[KnowledgeFeed] 投喂失败:', error);
    return NextResponse.json(
      { error: `投喂失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * GET /api/knowledge/feed
 * 查询已投喂的知识和脚本
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all';

    const result: Record<string, unknown> = {};

    if (type === 'all' || type === 'scripts') {
      const { data: scripts, error: sError } = await getDb()
        .from('live_scripts')
        .select('*')
        .order('session_date', { ascending: false })
        .limit(50);

      if (sError) throw sError;
      result.scripts = Array.isArray(scripts) ? scripts : [];
    }

    if (type === 'all' || type === 'knowledge') {
      const { data: knowledge, error: kError } = await getDb()
        .from('analysis_knowledge')
        .select('*')
        .order('confidence', { ascending: false })
        .limit(500);

      if (kError) throw kError;
      result.knowledge = Array.isArray(knowledge) ? knowledge : [];

      // 统计信息（简化版）
      const { data: allScripts } = await getDb()
        .from('live_scripts')
        .select('*');
      const { data: allKnowledge } = await getDb()
        .from('analysis_knowledge')
        .select('*');

      result.stats = {
        totalScripts: Array.isArray(allScripts) ? allScripts.length : 0,
        totalKnowledge: Array.isArray(allKnowledge) ? allKnowledge.length : 0,
      };
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('[KnowledgeFeed] 查询失败:', error);
    return NextResponse.json(
      { error: `查询失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/knowledge/feed
 * 删除知识条目
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type'); // 'knowledge' or 'script'

    if (!id) {
      return NextResponse.json({ error: '缺少id参数' }, { status: 400 });
    }

    if (type === 'script') {
      const { error } = await getDb().from('live_scripts').delete().eq('id', id);
      if (error) throw error;
    } else {
      const { error } = await getDb().from('analysis_knowledge').delete().eq('id', id);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[KnowledgeFeed] 删除失败:', error);
    return NextResponse.json(
      { error: `删除失败: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
