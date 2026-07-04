/**
 * ASR 转写 Worker 函数
 * 从 Worker 任务队列调用
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import fs from 'fs';
import { asrClient } from './asr-client';

/**
 * 执行音频转写
 */
export async function transcribeAudio(audioPath: string, sessionId: number, segmentSeq: number): Promise<string> {
  console.log(`[TranscribeWorker] 开始转写: session=${sessionId}, seg=${segmentSeq}, path=${audioPath}`);

  if (!fs.existsSync(audioPath)) {
    const db = getSupabaseClient();
    await db.from('recording_segments')
      .update({ transcribe_status: 'failed', error_message: '文件不存在' })
      .eq('session_id', sessionId)
      .eq('segment_seq', segmentSeq);
    throw new Error(`音频文件不存在: ${audioPath}`);
  }

  // 使用我们的 ASR 客户端
  const text = await asrClient.transcribe(audioPath, 'zh');

  console.log(`[TranscribeWorker] ASR 转写成功: ${text.length} 字符`);

  // 保存到数据库
  const db = getSupabaseClient();
  
  // 更新 snapshot_data 转写结果
  await db
    .from('snapshot_data')
    .update({ transcription: text })
    .eq('session_id', sessionId)
    .eq('snapshot_seq', segmentSeq);

  // 更新 recording_segments 转写状态
  const { error } = await db
    .from('recording_segments')
    .update({ transcribe_status: 'success' })
    .eq('session_id', sessionId)
    .eq('segment_seq', segmentSeq);

  if (error) {
    console.error(`[TranscribeWorker] 保存转写状态失败: ${error.message}`);
  }

  console.log(`[TranscribeWorker] 转写完成: session=${sessionId}, seg=${segmentSeq}, chars=${text.length}`);
  return text;
}
