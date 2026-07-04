// GET /api/asr/status - 检查ASR配置状态
import { NextResponse } from 'next/server';
import { CONFIG } from '@/lib/server/config';
import { asrClient } from '@/lib/server/asr-client';

export async function GET() {
  try {
    const hasConfig = !!CONFIG.tencentCloud.secretId && !!CONFIG.tencentCloud.secretKey;
    
    // 检查客户端是否初始化成功
    const clientInitialized = !!asrClient.client;
    
    return NextResponse.json({
      success: true,
      data: {
        hasConfig,
        clientInitialized,
        config: {
          secretId: hasConfig ? '已配置 ✓' : '未配置 ✗',
          secretKey: hasConfig ? '已配置 ✓' : '未配置 ✗',
          region: CONFIG.tencentCloud.region,
        },
        message: clientInitialized 
          ? 'ASR服务已就绪，可以进行语音转写' 
          : 'ASR服务未配置，请检查环境变量 TENCENTCLOUD_SECRET_ID 和 TENCENTCLOUD_SECRET_KEY',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : '检查ASR状态失败' 
      },
      { status: 500 }
    );
  }
}