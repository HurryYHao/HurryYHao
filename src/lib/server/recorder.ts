// 服务端 ffmpeg 音频录制模块
// 从 FLV 直播流拉取音频，录制为 MP3 文件
// FLV 流地址无需认证，可直接访问
// 每30分钟自动分段，完成后自动启动下一段

import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getRoomParameter } from './auth';
import { cosManager } from './cos-manager';

// ==================== 流地址转换 ====================

/**
 * 将 webrtc:// 播放地址转换为 FLV 流地址
 * webrtc://play-stream.clsjcorp.com/live_xxx/main_yyy_720p
 * → http://play-stream.clsjcorp.com/live_xxx/main_yyy_720p.flv
 */
export function webrtcToFlvUrl(webrtcUrl: string): string {
  if (!webrtcUrl) return '';
  return webrtcUrl
    .replace(/^webrtc:\/\//, 'http://')
    + '.flv';
}

/**
 * 将 webrtc:// 播放地址转换为 HLS 流地址
 */
export function webrtcToHlsUrl(webrtcUrl: string): string {
  if (!webrtcUrl) return '';
  return webrtcUrl
    .replace(/^webrtc:\/\//, 'http://')
    + '.m3u8';
}

// ==================== 录音存储管理 ====================

import fs from 'fs';
import { globalQueue } from '@/worker/queue';

const STORAGE_DIR = process.env.DATA_STORAGE_PATH 
  ? path.join(process.env.DATA_STORAGE_PATH, 'recordings')
  : path.join(process.cwd(), 'data', 'recordings');

// 确保目录存在
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true, mode: 0o755 });
}

// 记录录制分段状态到数据库
async function saveSegmentRecord(sessionId: number, roomId: string, seq: number, start: Date, end: Date, localPath: string, status: string = 'completed') {
  try {
    const client = getSupabaseClient();
    const duration = Math.floor((end.getTime() - start.getTime()) / 1000);
    let fileSize = 0;
    
    if (fs.existsSync(localPath)) {
      fileSize = fs.statSync(localPath).size;
    }
    
    await client.from('recording_segments').insert({
      session_id: sessionId,
      room_id: roomId,
      segment_seq: seq,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      duration_seconds: duration,
      local_path: localPath,
      file_size: fileSize,
      status: status,
      transcribe_status: 'pending'
    });
  } catch (e) {
    console.error(`[Recorder] Failed to save segment record:`, e);
  }
}

// ==================== 录制进程管理 ====================

interface RecordingProcess {
  process: ChildProcess;
  roomId: string;
  roomName: string;
  sessionId: number;
  startTime: Date;
  outputPath: string;
  segmentIndex: number;
  mainUrl: string;
}

// 当前活跃的录制进程（roomId → process）
const activeRecordings = new Map<string, RecordingProcess>();

// 录制重试计数（roomId → {count, lastAttempt}），防止流不可用时无限重启
const retryTracker = new Map<string, { count: number; lastAttempt: number }>();
const MAX_RETRY_COUNT = 3;
const RETRY_BACKOFF_MS = 60_000; // 1分钟退避

// 录制片段时长（秒），每30分钟一个片段
const SEGMENT_DURATION_SECONDS = 30 * 60;

/**
 * 获取录制文件输出目录
 */
function getRecordingDir(): string {
  return STORAGE_DIR;
}

/**
 * 生成录制文件名：使用直播间名称替代 roomId
 * 格式: {roomName}_seg{n}_{HH-mm}.mp3
 */
function generateFilename(roomName: string, segmentIndex: number): string {
  const now = new Date();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  // 清理房间名称中的特殊字符
  const safeName = (roomName || 'unknown').replace(/[\/\\:*?"<>|\s]/g, '_').slice(0, 50);
  return `${safeName}_seg${segmentIndex}_${timeStr}.mp3`;
}

/**
 * 获取直播流地址
 * 按照 xinyun_live_stream_api.md 中的规则，实施 4 级降级策略
 */
export async function resolveStreamUrl(roomId: string): Promise<{ mainUrl: string; source: string }> {
  console.log(`[Recorder] resolveStreamUrl 开始: roomId=${roomId}`);
  
  // 策略 1: 尝试观众端 getRoomParameter API (api.clsjcorp.com)
  // 注意：这需要管理页的 token
  try {
    const client = getSupabaseClient();
    const { data: config } = await client
      .from('system_config')
      .select('config_value')
      .eq('config_key', 'admin_token')
      .maybeSingle();

    if (config?.config_value) {
      const response = await fetch(
        `https://api.clsjcorp.com/api/livebiz/public/openClassesRoom/audience/getRoomParameter?roomId=${roomId}`,
        {
          headers: {
            'Authorization': `Bearer ${config.config_value}`,
            'tenantid': process.env.XINYUN_TENANT_ID || '751087375173437746'
          }
        }
      );
      
      if (response.ok) {
        const result = await response.json();
        if (result.data?.mainUrl) {
          console.log(`[Recorder] 从观众端 API 成功获取: ${result.data.mainUrl}`);
          return { mainUrl: result.data.mainUrl, source: 'audience_api' };
        }
      }
    }
  } catch (err) {
    console.warn('[Recorder] 观众端 API 获取失败:', err instanceof Error ? err.message : err);
  }

  // 策略 2: 尝试助理端 getRoomParameter API (api.xinyuntv.com)
  try {
    console.log(`[Recorder] 尝试从助理端 getRoomParameter 获取: roomId=${roomId}`);
    const roomParam = await getRoomParameter(roomId);
    if (roomParam.mainUrl) {
      console.log(`[Recorder] 从助理端 API 成功获取: ${roomParam.mainUrl}`);
      return { mainUrl: roomParam.mainUrl, source: 'assistant_api' };
    }
  } catch (err) {
    console.warn('[Recorder] 助理端 API 获取失败 (可能401):', err instanceof Error ? err.message : err);
  }

  // 策略 3: 回退直接构造流地址 (不验证，直接交给 ffmpeg)
  const defaultUrl = `webrtc://play-stream.clsjcorp.com/live_1600073723/main_${roomId}_720p`;
  console.log(`[Recorder] 使用回退构造的 URL: ${defaultUrl}`);
  return { mainUrl: defaultUrl, source: 'fallback_pattern' };
}

/**
 * 自动为直播会话启动录制（供 monitor.ts 调用）
 * 当检测到直播开始时自动调用
 * 包含重试限制：如果最近连续失败超过 MAX_RETRY_COUNT 次，则跳过
 */
export async function autoStartRecording(
  roomId: string, 
  sessionId: number, 
  roomName: string,
  providedMainUrl?: string | null
): Promise<{ success: boolean; error?: string }> {
  // 已在录制中，跳过
  if (activeRecordings.has(roomId)) {
    return { success: true };
  }

  // 检查重试限制
  const retry = retryTracker.get(roomId);
  if (retry && retry.count >= MAX_RETRY_COUNT) {
    const elapsed = Date.now() - retry.lastAttempt;
    if (elapsed < RETRY_BACKOFF_MS) {
      // 还在退避期内，跳过
      return { success: false, error: `重试退避中，还需等待 ${Math.round((RETRY_BACKOFF_MS - elapsed) / 1000)}s` };
    }
  }

  try {
    // 查询该会话已有的最大片段编号
    let nextSegmentIndex = 1;
    try {
      const client = getSupabaseClient();
      const { data: segments } = await client
        .from('recording_segments')
        .select('segment_seq')
        .eq('session_id', sessionId)
        .order('segment_seq', { ascending: false })
        .limit(1);
      
      if (segments && segments.length > 0) {
        nextSegmentIndex = (segments[0] as any).segment_seq + 1;
        console.log(`[AutoRecording] 检测到已有录制，从片段 #${nextSegmentIndex} 继续`);
      }
    } catch (dbErr) {
      console.warn(`[AutoRecording] 查询片段信息失败，默认从 #1 开始:`, dbErr instanceof Error ? dbErr.message : dbErr);
    }

    let mainUrl: string;
    let source: string;

    // 优先使用预提供的流地址
    if (providedMainUrl) {
      mainUrl = providedMainUrl;
      source = 'live_list';
      console.log(`[AutoRecording] 使用直播列表预提供的流地址`);
    } else {
      const streamResult = await resolveStreamUrl(roomId);
      mainUrl = streamResult.mainUrl;
      source = streamResult.source;
    }

    const flvUrl = webrtcToFlvUrl(mainUrl);
    console.log(`[AutoRecording] 自动启动录制: room=${roomId}, name=${roomName}, source=${source}, flv=${flvUrl}, seg=${nextSegmentIndex}`);

    // 将 mainUrl 存到数据库以便后续使用
    try {
      const client = getSupabaseClient();
      await client
        .from('live_sessions')
        .update({ trtc_info: { mainUrl } } as Record<string, unknown>)
        .eq('id', sessionId);
    } catch {
      // 存储失败不影响录制
    }

    const result = startAudioRecording(roomId, sessionId, mainUrl, nextSegmentIndex, roomName);
    if (!result.success) {
      // 启动失败（无法spawn ffmpeg等同步错误），记录失败
      const current = retryTracker.get(roomId) || { count: 0, lastAttempt: 0 };
      retryTracker.set(roomId, { count: current.count + 1, lastAttempt: Date.now() });
      console.error(`[AutoRecording] 自动录制启动失败(${current.count + 1}/${MAX_RETRY_COUNT}): ${result.error}`);
    }
    // 注意：ffmpeg spawn成功不代表流可用，不重置retryTracker
    // retryTracker 只在片段成功完成(code===0)或手动停止时重置
    return result;
  } catch (err) {
    const current = retryTracker.get(roomId) || { count: 0, lastAttempt: 0 };
    retryTracker.set(roomId, { count: current.count + 1, lastAttempt: Date.now() });
    console.error(`[AutoRecording] 获取流地址失败(${current.count + 1}/${MAX_RETRY_COUNT}):`, err instanceof Error ? err.message : err);
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * 启动音频录制
 * @param roomId 房间ID
 * @param sessionId 会话ID
 * @param mainUrl webrtc:// 播放地址（来自 getRoomParameter）
 * @param segmentIndex 片段序号
 * @param roomName 直播间名称（用于文件命名）
 */
export function startAudioRecording(
  roomId: string,
  sessionId: number,
  mainUrl: string,
  segmentIndex: number = 1,
  roomName: string = ''
): { success: boolean; error?: string; outputPath?: string } {
  // 检查是否已在录制
  if (activeRecordings.has(roomId)) {
    return { success: false, error: `房间 ${roomId} 已在录制中` };
  }

  console.log(`[Recording] 准备启动录制: room=${roomId}, session=${sessionId}, mainUrl=${mainUrl}`);

  const flvUrl = webrtcToFlvUrl(mainUrl);
  console.log(`[Recording] 转换流地址: mainUrl=${mainUrl} -> flvUrl=${flvUrl}`);
  
  if (!flvUrl) {
    return { success: false, error: '无法转换流地址' };
  }

  const recordingDir = getRecordingDir();
  const filename = generateFilename(roomName, segmentIndex);
  const outputPath = path.join(recordingDir, filename);

  console.log(`[Recording] 录制配置: dir=${recordingDir}, filename=${filename}, outputPath=${outputPath}`);

  // 构建 ffmpeg 命令
  // -i: 输入 FLV 流
  // -vn: 忽略视频
  // -ac 1: 单声道
  // -ar 16000: 16kHz采样率 (适合语音识别)
  // -b:a 32k: 32kbps码率 (极大压缩体积)
  // -t SEGMENT_DURATION: 限制片段时长
  // -y: 覆盖输出文件
  const ffmpegArgs = [
    '-i', flvUrl,
    '-vn',
    '-ac', '1',
    '-ar', '16000',
    '-b:a', '32k',
    '-t', String(SEGMENT_DURATION_SECONDS),
    '-y',
    outputPath,
  ];

  console.log(`[Recording] 启动 ffmpeg: args=${JSON.stringify(ffmpegArgs)}`);

  let ffmpegProcess: ChildProcess;
  try {
    ffmpegProcess = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe'],  // stdin=pipe 以便发送 'q' 命令优雅退出
      detached: false,
    });
    console.log(`[Recording] ffmpeg 进程启动成功, pid=${ffmpegProcess.pid}`);
  } catch (err) {
    const errorMsg = `ffmpeg 启动失败: ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[Recording] ${errorMsg}`);
    return { success: false, error: errorMsg };
  }

  const recording: RecordingProcess = {
    process: ffmpegProcess,
    roomId,
    roomName,
    sessionId,
    startTime: new Date(),
    outputPath,
    segmentIndex,
    mainUrl,
  };

  // 监听 stderr（ffmpeg 输出日志到 stderr）
  let stderrBuffer = '';
  ffmpegProcess.stderr?.on('data', (data: Buffer) => {
    const logLine = data.toString();
    stderrBuffer += logLine;
    // 只保留最后 5000 字符
    if (stderrBuffer.length > 5000) {
      stderrBuffer = stderrBuffer.slice(-5000);
    }
    // 输出调试信息
    if (logLine.includes('error') || logLine.includes('Error') || logLine.includes('ERROR')) {
      console.error(`[Recording] ffmpeg error: ${logLine.trim()}`);
    }
  });

  ffmpegProcess.on('close', (code, signal) => {
    console.log(`[Recording] 录制进程退出: room=${roomId}, seg=${segmentIndex}, code=${code}, signal=${signal}`);
    
    // 输出完整的 ffmpeg 日志用于调试
    if (code !== 0) {
      console.error(`[Recording] ffmpeg 完整 stderr 输出: ${stderrBuffer}`);
    }
    
    activeRecordings.delete(roomId);

    // 检查是否是手动停止（mainUrl 被清空）
    const wasManualStop = !recording.mainUrl;
    console.log(`[Recording] wasManualStop=${wasManualStop}`);

    if (code === 0 && !wasManualStop) {
      // 正常结束（30分钟片段录制完成） - 重置重试计数
      retryTracker.delete(roomId);
      
      // 检查输出文件是否存在
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        console.log(`[Recording] 录制文件生成成功: ${outputPath}, size=${stats.size} bytes`);
      } else {
        console.warn(`[Recording] 录制文件未生成: ${outputPath}`);
      }

      // 记录片段信息到数据库
      saveSegmentRecord(sessionId, roomId, segmentIndex, recording.startTime, new Date(), outputPath, 'completed').then(() => {
        // 将转写任务加入队列
        globalQueue.enqueue('transcribe', {
          sessionId,
          segmentSeq: segmentIndex,
          roomId,
          audioUrl: outputPath
        });
      }).catch(err => {
        console.error(`[Recording] 保存片段信息失败:`, err instanceof Error ? err.message : err);
      });

      // 自动启动下一段录制
      console.log(`[Recording] 片段 #${segmentIndex} 完成，自动启动片段 #${segmentIndex + 1}`);
      const nextResult = startAudioRecording(roomId, sessionId, mainUrl, segmentIndex + 1, roomName);
      if (!nextResult.success) {
        console.error(`[Recording] 自动启动下一段失败: ${nextResult.error}`);
      }
    } else if (code !== 0 && !wasManualStop) {
      console.error(`[Recording] ffmpeg 异常退出(code=${code}): room=${roomId}`);
      // 截取最后的错误信息
      const lastLines = stderrBuffer.split('\n').filter(Boolean).slice(-10).join('\n');
      console.error(`[Recording] ffmpeg 错误详情:\n${lastLines}`);

      // 记录失败（用于重试限制）
      const current = retryTracker.get(roomId) || { count: 0, lastAttempt: 0 };
      retryTracker.set(roomId, { count: current.count + 1, lastAttempt: Date.now() });
      console.warn(`[Recording] 失败记录更新: count=${current.count + 1}/${MAX_RETRY_COUNT}`);

      // 如果重试次数已达上限，不再自动启动下一段
      if (current.count + 1 >= MAX_RETRY_COUNT) {
        console.warn(`[Recording] 重试次数已达上限(${MAX_RETRY_COUNT})，停止自动重启: room=${roomId}`);
      }
    }
    // 手动停止时重置重试计数
    if (wasManualStop) {
      console.log(`[Recording] 手动停止，重置重试计数: room=${roomId}`);
      retryTracker.delete(roomId);
    }
  });

  ffmpegProcess.on('error', (err) => {
    console.error(`[Recording] 进程错误: room=${roomId}, error=${err.message}, stack=${err.stack}`);
    activeRecordings.delete(roomId);
  });

  activeRecordings.set(roomId, recording);

  return { success: true, outputPath };
}

/**
 * 停止音频录制（不自动继续下一段）
 */
export function stopAudioRecording(roomId: string): { success: boolean; error?: string } {
  const recording = activeRecordings.get(roomId);
  if (!recording) {
    return { success: false, error: `房间 ${roomId} 没有在录制` };
  }

  console.log(`[Recording] 停止录制: room=${roomId}, pid=${recording.process.pid}`);

  // 标记为手动停止，防止 close 事件中自动继续下一段
  // 修改 mainUrl 为空，这样 close 回调中 startAudioRecording 会因 flvUrl 为空而失败
  recording.mainUrl = '';

  try {
    // 发送 'q' 命令给 ffmpeg 优雅退出（让它完成当前帧的写入）
    recording.process.stdin?.write('q');
    
    // 从活跃列表移除（避免重复停止）
    activeRecordings.delete(roomId);

    // 如果 5 秒后还没退出，强制 kill
    const pid = recording.process.pid;
    setTimeout(() => {
      try {
        process.kill(pid!, 'SIGKILL');
      } catch { /* already exited */ }
    }, 5000);

    return { success: true };
  } catch (err) {
    // 优雅退出失败，直接 SIGTERM
    try {
      recording.process.kill('SIGTERM');
    } catch { /* ignore */ }
    activeRecordings.delete(roomId);
    return { success: false, error: `停止录制失败: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/**
 * 获取所有活跃录制状态
 */
export function getActiveRecordings(): Array<{
  roomId: string;
  sessionId: number;
  segmentIndex: number;
  startTime: string;
  duration: number; // 秒
  outputPath: string;
  roomName: string;
}> {
  const now = Date.now();
  return Array.from(activeRecordings.values()).map(r => ({
    roomId: r.roomId,
    sessionId: r.sessionId,
    segmentIndex: r.segmentIndex,
    startTime: r.startTime.toISOString(),
    duration: Math.round((now - r.startTime.getTime()) / 1000),
    outputPath: r.outputPath,
    roomName: r.roomName,
  }));
}

/**
 * 检查房间是否在录制中
 */
export function isRecording(roomId: string): boolean {
  return activeRecordings.has(roomId);
}

/**
 * 检查是否允许自动重启录制（重试次数未超限）
 */
export function canAutoRestart(roomId: string): boolean {
  const tracker = retryTracker.get(roomId);
  if (!tracker) return true; // 没有重试记录，允许
  if (tracker.count >= MAX_RETRY_COUNT) return false; // 超过3次，不允许
  const tenMinAgo = Date.now() - 10 * 60 * 1000;
  if (tracker.lastAttempt < tenMinAgo) return true; // 超过10分钟，重置
  return true;
}

/**
 * 检查流是否已失效（连续多次录制失败，应结束会话）
 * 用于在 pollLiveStatus 未及时检测到直播结束时，由录制侧主动判定
 */
export function isStreamDead(roomId: string): boolean {
  const tracker = retryTracker.get(roomId);
  if (!tracker) return false;
  // 连续失败3次且最后一次在5分钟内，视为流已死
  if (tracker.count >= MAX_RETRY_COUNT) {
    const elapsed = Date.now() - tracker.lastAttempt;
    if (elapsed < 5 * 60 * 1000) return true;
  }
  return false;
}

/** 重置某房间的重试计数（会话结束时调用） */
export function resetRetryCount(roomId: string): void {
  retryTracker.delete(roomId);
}



/**
 * 获取指定会话的所有录制片段
 */
export async function getRecordingSegments(sessionId: number): Promise<Array<{
  seq: number;
  url: string;
  timestamp: string;
}>> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from('snapshot_data')
    .select('snapshot_seq, recording_url, created_at')
    .eq('session_id', sessionId)
    .not('recording_url', 'is', null)
    .order('snapshot_seq', { ascending: true });

  if (error || !data) return [];

  return data.map((d: { snapshot_seq: number; recording_url: string; created_at: string }) => ({
    seq: d.snapshot_seq,
    url: d.recording_url,
    timestamp: d.created_at,
  }));
}

/**
 * 获取指定房间的已录制音频片段（从磁盘扫描）
 */
export async function getSegments(roomId: string, roomName?: string): Promise<Array<{
  filename: string;
  url: string;
  size: number;
  mtime: string;
  transcription?: string;
  transcribe_status?: string;
  segmentSeq?: number;
}>> {
  const fs = require('fs') as typeof import('fs');
  const recordingDir = getRecordingDir();

  if (!fs.existsSync(recordingDir)) return [];

  try {
    // 匹配两种文件名格式: room_{roomId}_* 和 {roomName}_*
    const safeRoomName = (roomName || '').replace(/[\/\\:*?"<>|\s]/g, '_').slice(0, 50);
    const files = fs.readdirSync(recordingDir)
      .filter((f: string) => f.endsWith('.mp3') && (
        f.startsWith(`room_${roomId}_`) || 
        (safeRoomName && f.startsWith(`${safeRoomName}_`))
      ))
      .sort();

    // 获取数据库中的转写状态（通过 session_id 关联）
    const client = getSupabaseClient();

    // 先查找 session_id
    let sessionId: number | null = null;
    const { data: sessionData } = await client
      .from('live_sessions')
      .select('id')
      .eq('room_id', roomId)
      .limit(1);
    
    if (sessionData && sessionData.length > 0) {
      sessionId = (sessionData[0] as any).id;
    }

    const { data: recordingSegments } = sessionId
      ? await client
          .from('recording_segments')
          .select('segment_seq, transcribe_status')
          .eq('session_id', sessionId)
      : { data: [] };

    const { data: snapshotDataRows } = sessionId
      ? await client
          .from('snapshot_data')
          .select('snapshot_seq, transcription')
          .eq('session_id', sessionId)
      : { data: [] };

    // 构建映射
    const transcribeStatusMap = new Map<number, string>();
    const transcriptionMap = new Map<number, string>();
    
    if (recordingSegments) {
      for (const seg of recordingSegments) {
        if (seg.segment_seq && seg.transcribe_status) {
          transcribeStatusMap.set(seg.segment_seq, seg.transcribe_status);
        }
      }
    }
    
    if (snapshotDataRows) {
      for (const snap of snapshotDataRows) {
        if ((snap as any).snapshot_seq && (snap as any).transcription) {
          transcriptionMap.set((snap as any).snapshot_seq, (snap as any).transcription);
        }
      }
    }

    return files.map((f: string) => {
      const stat = fs.statSync(path.join(recordingDir, f));
      
      // 从文件名提取片段序号
      const match = f.match(/_seg(\d+)_/);
      const segmentSeq = match ? parseInt(match[1], 10) : undefined;
      
      return {
        filename: f,
        url: `/api/recorder/file/${encodeURIComponent(f)}`,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        segmentSeq,
        transcribe_status: segmentSeq ? transcribeStatusMap.get(segmentSeq) : undefined,
        transcription: segmentSeq ? transcriptionMap.get(segmentSeq) : undefined,
      };
    });
  } catch (e) {
    console.error('[Recorder] Error getting segments:', e);
    return [];
  }
}

/**
 * 获取指定房间的录制状态详情
 */
export function getRecordingStatus(roomId: string): {
  isRecording: boolean;
  duration: number;
  segmentIndex: number;
  outputPath: string;
  roomName: string;
} | null {
  const recording = activeRecordings.get(roomId);
  if (!recording) return null;

  const now = Date.now();
  return {
    isRecording: true,
    duration: Math.round((now - recording.startTime.getTime()) / 1000),
    segmentIndex: recording.segmentIndex,
    outputPath: recording.outputPath,
    roomName: recording.roomName,
  };
}
