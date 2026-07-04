import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { AI_PROVIDERS, AVAILABLE_MODELS } from '@/lib/server/llm-client';

export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'ai_settings')
      .maybeSingle();

    // 默认使用 coze provider 和 doubao-seed-2-0-pro-260215 模型
    let settings = { provider: AI_PROVIDERS.COZE, model: 'doubao-seed-2-0-pro-260215' };
    
    if (data?.config_value) {
      try {
        settings = { ...settings, ...JSON.parse(data.config_value) };
      } catch (e) {}
    }

    return NextResponse.json({
      success: true,
      data: {
        settings,
        providers: Object.values(AI_PROVIDERS),
        availableModels: { [AI_PROVIDERS.COZE]: AVAILABLE_MODELS },
      }
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { provider, model } = body;

    if (!provider || !model) {
      return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 });
    }

    // 验证provider必须是coze
    if (provider !== AI_PROVIDERS.COZE) {
      return NextResponse.json({ 
        success: false, 
        error: '当前只支持 coze provider（使用 coze-coding-dev-sdk）' 
      }, { status: 400 });
    }

    // 验证model必须在可用模型列表中
    if (!AVAILABLE_MODELS.includes(model)) {
      return NextResponse.json({ 
        success: false, 
        error: `模型 ${model} 不在可用模型列表中` 
      }, { status: 400 });
    }

    const client = getSupabaseClient();
    const { error } = await client
      .from('system_config')
      .upsert({
        config_key: 'ai_settings',
        config_value: JSON.stringify({ provider, model }),
        updated_at: new Date().toISOString()
      }, { onConflict: 'config_key' });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
  }
}