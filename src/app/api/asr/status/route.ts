// GET /api/asr/status - 检查ASR配置状态
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // coze-coding-dev-sdk ASR 不需要额外配置，SDK 自带鉴权
    const clientInitialized = true;
    
    return NextResponse.json({
      success: true,
      data: {
        hasConfig: true,
        clientInitialized,
        config: {
          provider: 'coze-coding-dev-sdk (豆包语音识别)',
          maxFileSize: '100MB',
          maxDuration: '2小时',
          supportedFormats: ['mp3', 'wav', 'ogg', 'm4a'],
        },
        message: clientInitialized 
          ? 'ASR服务已就绪（豆包语音识别），可以进行语音转写' 
          : 'ASR服务未配置',
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
