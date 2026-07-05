import { NextResponse } from 'next/server';
import { cleanupRecordingFiles } from '@/lib/server/recorder';

/**
 * POST /api/recorder/cleanup
 * 手动触发录音文件清理
 */
export async function POST() {
  try {
    const result = await cleanupRecordingFiles();
    return NextResponse.json({
      success: true,
      data: {
        deletedCount: result.deletedCount,
        freedMB: result.freedMB,
        details: result.details.slice(0, 50), // 限制返回条数
      },
    });
  } catch (error: any) {
    console.error('[Recorder] 手动清理失败:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

/**
 * GET /api/recorder/cleanup
 * 获取录音文件清理配置和当前磁盘占用
 */
export async function GET() {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const recordingDir = process.env.DATA_STORAGE_PATH
      ? path.join(process.env.DATA_STORAGE_PATH, 'recordings')
      : path.join(process.cwd(), 'data', 'recordings');

    let fileCount = 0;
    let totalSizeMB = 0;

    if (fs.existsSync(recordingDir)) {
      const files = fs.readdirSync(recordingDir).filter((f: string) => f.endsWith('.mp3'));
      fileCount = files.length;
      for (const file of files) {
        const stat = fs.statSync(path.join(recordingDir, file));
        totalSizeMB += stat.size / (1024 * 1024);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        recordingDir,
        fileCount,
        totalSizeMB: Math.round(totalSizeMB * 100) / 100,
        config: {
          transcribedRetentionHours: parseInt(process.env.TRANSCRIBED_RETENTION_HOURS || '6', 10),
          untranscribedMaxRetentionDays: parseInt(process.env.UNTRANSCRIBED_MAX_RETENTION_DAYS || '3', 10),
          diskUsageThreshold: parseInt(process.env.DISK_USAGE_THRESHOLD || '80', 10),
          cleanupIntervalMinutes: parseInt(process.env.RECORDING_CLEANUP_INTERVAL_MS || `${60 * 60 * 1000}`, 10) / 60000,
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
