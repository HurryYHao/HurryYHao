import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function GET() {
  try {
    const supabase = getSupabaseClient();
    // 检查最近一次备份
    const { data: config } = await supabase
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'knowledge_backup')
      .single();

    // config_value 中存的是完整备份JSON，只返回元信息（不返回snapshot_json）
    let lastBackup: Record<string, unknown> | null = null;
    const configData = config as any;
    if (configData?.config_value) {
      try {
        const parsed = JSON.parse(configData.config_value);
        lastBackup = {
          timestamp: parsed.timestamp,
          knowledge_count: parsed.knowledge_count,
          scripts_count: parsed.scripts_count,
        };
      } catch {
        lastBackup = { raw: configData.config_value };
      }
    }

    return Response.json({
      success: true,
      last_backup: lastBackup,
    });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const supabase = getSupabaseClient();
    const timestamp = new Date().toISOString();

    // 1. 导出完整知识库快照
    const [knowledge, scripts] = await Promise.all([
      supabase.from('analysis_knowledge').select('*').order('confidence', { ascending: false }),
      supabase.from('live_scripts').select('*').order('session_date', { ascending: false }),
    ]);

    const knowledgeData = Array.isArray(knowledge.data) ? knowledge.data : [];
    const scriptsData = Array.isArray(scripts.data) ? scripts.data : [];
    
    const snapshot = {
      timestamp,
      knowledge: knowledgeData,
      scripts: scriptsData,
    };

    // 2. 保存备份记录到system_config
    const { error } = await supabase
      .from('system_config')
      .upsert({
        config_key: 'knowledge_backup',
        config_value: JSON.stringify({
          timestamp,
          knowledge_count: knowledgeData.length,
          scripts_count: scriptsData.length,
          snapshot_json: JSON.stringify(snapshot),
        }),
      }, { onConflict: 'config_key' });

    if (error) throw error;

    return Response.json({
      success: true,
      timestamp,
      knowledge_count: snapshot.knowledge.length,
      scripts_count: snapshot.scripts.length,
    });
  } catch (err) {
    console.error('[KnowledgeBackup] 备份失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
