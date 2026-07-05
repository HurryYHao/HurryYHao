
// POST /api/recorder/transcribe - 音频转文字（ASR）
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import fs from 'fs';
import path from 'path';
import { asrClient } from '@/lib/server/asr-client';

// 录音文件存储目录（与 recorder.ts 保持一致）
const STORAGE_DIR = process.env.DATA_STORAGE_PATH 
  ? path.join(process.env.DATA_STORAGE_PATH, 'recordings')
  : path.join(process.cwd(), 'data', 'recordings');

export async function POST(request: NextRequest) {
  try {
    const { audioUrl, sessionId, segmentSeq } = await request.json();

    if (!audioUrl) {
      return NextResponse.json(
        { success: false, error: '缺少 audioUrl 参数' },
        { status: 400 }
      );
    }

    console.log(`[ASR] 收到转写请求: audioUrl=${audioUrl}`);

    // 确定本地文件路径
    let localFilePath: string;
    
    // 先尝试直接检查是否是完整路径
    if (fs.existsSync(audioUrl)) {
      localFilePath = audioUrl;
      console.log(`[ASR] 直接使用完整路径: ${localFilePath}`);
    } else if (audioUrl.startsWith('/api/recorder/file/')) {
      // 处理 /api/recorder/file/xxx.mp3 格式
      const encodedFilename = audioUrl.replace('/api/recorder/file/', '');
      const filename = decodeURIComponent(encodedFilename);
      localFilePath = path.join(STORAGE_DIR, filename);
      console.log(`[ASR] 解析API路径: filename=${filename}, path=${localFilePath}`);
      if (!fs.existsSync(localFilePath)) {
        throw new Error(`本地文件不存在: ${localFilePath}`);
      }
    } else if (audioUrl.startsWith('/recordings/')) {
      // 处理 /recordings/ 开头的路径
      const filename = path.basename(audioUrl);
      const publicPath = path.join(process.cwd(), 'public', audioUrl);
      const dataPath = path.join(STORAGE_DIR, filename);
      
      if (fs.existsSync(publicPath)) {
        localFilePath = publicPath;
      } else if (fs.existsSync(dataPath)) {
        localFilePath = dataPath;
      } else {
        throw new Error(`找不到音频文件: ${publicPath} 或 ${dataPath}`);
      }
    } else if (audioUrl.startsWith('/')) {
      // 其他绝对路径
      localFilePath = path.join(process.cwd(), 'public', audioUrl);
      if (!fs.existsSync(localFilePath)) {
        throw new Error(`本地文件不存在: ${localFilePath}`);
      }
    } else {
      // 尝试从 URL 中提取文件名
      try {
        const urlObj = new URL(audioUrl);
        const filename = path.basename(urlObj.pathname);
        localFilePath = path.join(STORAGE_DIR, filename);
        if (!fs.existsSync(localFilePath)) {
          throw new Error(`本地文件不存在: ${localFilePath}`);
        }
      } catch (e) {
        throw new Error(`无法解析音频路径: ${audioUrl}`);
      }
    }

    const fileSize = fs.statSync(localFilePath).size;
    const fileSizeMB = (fileSize / (1024 * 1024)).toFixed(1);
    console.log(`[ASR] 读取本地文件: ${localFilePath} (${fileSizeMB}MB)`);

    // 使用我们的 ASR 客户端
    const text = await asrClient.transcribe(localFilePath);

    console.log(`[ASR] 转写完成: ${text.length} 字符`);

    // 如果有 sessionId 和 segmentSeq，将转写文本保存到数据库
    if (sessionId && segmentSeq) {
      const client = getSupabaseClient();
      const { error } = await client
        .from('snapshot_data')
        .update({ transcription: text })
        .eq('session_id', sessionId)
        .eq('snapshot_seq', segmentSeq);

      if (error) {
        console.error(`[ASR] 保存转写文本失败:`, error.message);
      } else {
        console.log(`[ASR] 转写文本已保存到 snapshot_data (session=${sessionId}, seq=${segmentSeq})`);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        text,
        duration: 0,
        utterances: [],
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : '音频转写失败';
    console.error('[ASR] 转写错误:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
