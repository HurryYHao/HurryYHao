import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseClient();
    const url = new URL(request.url);
    const type = url.searchParams.get('type') || 'all'; // all | knowledge | scripts | skill
    const format = url.searchParams.get('format') || 'json'; // json | csv

    if (type === 'skill') {
      return exportSkill();
    }

    const result: Record<string, unknown> = {};
    let knowledgeData: any[] = [];
    let scriptsData: any[] = [];

    if (type === 'all' || type === 'knowledge') {
      const { data: knowledge, error: kErr } = await supabase
        .from('analysis_knowledge')
        .select('*')
        .order('confidence', { ascending: false });
      if (kErr) throw kErr;
      knowledgeData = Array.isArray(knowledge) ? knowledge : [];
      result.knowledge = knowledgeData;
    }

    if (type === 'all' || type === 'scripts') {
      const { data: scripts, error: sErr } = await supabase
        .from('live_scripts')
        .select('*')
        .order('session_date', { ascending: false });
      if (sErr) throw sErr;
      scriptsData = Array.isArray(scripts) ? scripts : [];
      result.scripts = scriptsData;
    }

    if (format === 'csv') {
      return exportCSV({ ...result, knowledge: knowledgeData, scripts: scriptsData }, type);
    }

    return Response.json({
      success: true,
      exported_at: new Date().toISOString(),
      data: result,
    });
  } catch (err) {
    console.error('[KnowledgeExport] 导出失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/** 导出完整技能包（知识库+脚本+分析框架），用于迁移到新环境 */
async function exportSkill() {
  const supabase = getSupabaseClient();
  const [knowledge, scripts, skillVersions] = await Promise.all([
    supabase.from('analysis_knowledge').select('*').order('confidence', { ascending: false }),
    supabase.from('live_scripts').select('*').order('session_date', { ascending: false }),
    supabase.from('skill_versions').select('*').order('created_at', { ascending: false }).limit(5),
  ]);

  const knowledgeData = Array.isArray(knowledge.data) ? knowledge.data : [];
  const scriptsData = Array.isArray(scripts.data) ? scripts.data : [];
  const skillVersionsData = Array.isArray(skillVersions.data) ? skillVersions.data : [];
  
  const skillPackage = {
    _meta: {
      name: 'AI直播分析技能包',
      version: new Date().toISOString().split('T')[0],
      exported_at: new Date().toISOString(),
      description: '包含知识库、直播脚本、分析框架，可导入新环境',
    },
    knowledge: knowledgeData,
    scripts: scriptsData,
    skill_versions: skillVersionsData,
    analysis_framework: {
      dimensions: ['anchor', 'interaction', 'conversion', 'sentiment', 'rhythm'],
      dimension_names: {
        anchor: '主播话术',
        interaction: '互动热度',
        conversion: '商品转化',
        sentiment: '评论舆情',
        rhythm: '直播节奏',
      },
      knowledge_categories: ['threshold', 'pattern', 'benchmark', 'rule'],
    },
  };

  return Response.json({
    success: true,
    exported_at: skillPackage._meta.exported_at,
    stats: {
      knowledge_count: knowledgeData.length,
      scripts_count: scriptsData.length,
      skill_versions_count: skillVersionsData.length,
    },
    data: skillPackage,
  });
}

function exportCSV(data: Record<string, unknown>, type: string): Response {
  const items = type === 'scripts'
    ? (Array.isArray(data.scripts) ? data.scripts : []) as Array<Record<string, unknown>>
    : (Array.isArray(data.knowledge) ? data.knowledge : []) as Array<Record<string, unknown>>;

  if (!items || items.length === 0) {
    return Response.json({ error: '无数据可导出' }, { status: 400 });
  }

  const headers = Object.keys(items[0]);
  const csvRows = [
    headers.join(','),
    ...items.map(item =>
      headers.map(h => {
        const val = String(item[h] ?? '');
        return val.includes(',') || val.includes('"') || val.includes('\n')
          ? `"${val.replace(/"/g, '""')}"`
          : val;
      }).join(',')
    ),
  ];

  return new Response(csvRows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename=knowledge_${type}_${new Date().toISOString().split('T')[0]}.csv`,
    },
  });
}
