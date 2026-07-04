import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { AI_PROVIDERS, AVAILABLE_MODELS } from '@/lib/server/config';

export async function GET() {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'ai_settings')
      .maybeSingle();

    let settings = { provider: AI_PROVIDERS.ZHENJING, model: 'gpt-4o-mini' };
    
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
        availableModels: AVAILABLE_MODELS,
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
