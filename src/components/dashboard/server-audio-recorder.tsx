'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Mic, Square, Play, Pause, Download, Loader2, AlertCircle, RefreshCw,
  FileText,
} from 'lucide-react';

interface RecordingStatus {
  roomId: string;
  isRecording: boolean;
  duration: number;
  segmentIndex: number;
  outputPath: string;
  roomName: string;
}

interface AudioSegment {
  filename: string;
  url: string;
  size: number;
  mtime: string;
  transcription?: string;
  transcribing?: boolean;
  transcribe_status?: string;
  segmentSeq?: number;
}

interface ServerAudioRecorderProps {
  roomId: string;
  sessionId?: number;
  roomName?: string;
}

export default function ServerAudioRecorder({ roomId, sessionId, roomName }: ServerAudioRecorderProps) {
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus | null>(null);
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [loading, setLoading] = useState<string | null>(null); // 'start' | 'stop' | null
  const [error, setError] = useState<string | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [transcribingSegments, setTranscribingSegments] = useState<Set<string>>(new Set());
  const [transcriptionMap, setTranscriptionMap] = useState<Record<string, string>>({});
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 轮询录制状态
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/recorder/status');
      const json = await res.json();
      if (json.success && json.data) {
        const found = (json.data as RecordingStatus[]).find(
          (r) => r.roomId === roomId
        );
        setRecordingStatus(found || null);
      }
    } catch {
      // 轮询失败静默
    }
  }, [roomId]);

  // 获取已录制片段
  const fetchSegments = useCallback(async () => {
    try {
      const params = new URLSearchParams({ roomId });
      if (roomName) params.set('roomName', roomName);
      const res = await fetch(`/api/recorder/segments?${params}`);
      const json = await res.json();
      if (json.success) {
        setSegments(json.data || []);
        
        // 更新转写结果映射
        const newTranscriptionMap: Record<string, string> = {};
        for (const seg of json.data || []) {
          if (seg.transcription) {
            newTranscriptionMap[seg.filename] = seg.transcription;
          }
        }
        setTranscriptionMap(newTranscriptionMap);
      }
    } catch {
      // 静默
    }
  }, [roomId, roomName]);

  // 启动录制
  const startRecording = useCallback(async () => {
    setLoading('start');
    setError(null);
    try {
      const res = await fetch('/api/recorder/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, sessionId, roomName }),
      });
      const json = await res.json();
      if (json.success) {
        await fetchStatus();
        await fetchSegments();
      } else {
        setError(json.error || '启动录制失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    }
    setLoading(null);
  }, [roomId, sessionId, roomName, fetchStatus, fetchSegments]);

  // 停止录制
  const stopRecording = useCallback(async () => {
    setLoading('stop');
    setError(null);
    try {
      const res = await fetch('/api/recorder/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });
      const json = await res.json();
      if (json.success) {
        setRecordingStatus(null);
        await fetchSegments();
      } else {
        setError(json.error || '停止录制失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    }
    setLoading(null);
  }, [roomId, fetchSegments]);

  // 播放/暂停
  const togglePlayback = useCallback((segment: AudioSegment) => {
    if (playingUrl === segment.url && !paused) {
      audioRef.current?.pause();
      setPaused(true);
      return;
    }
    if (playingUrl === segment.url && paused) {
      audioRef.current?.play().catch(() => {});
      setPaused(false);
      return;
    }
    // 播放新片段
    if (audioRef.current) audioRef.current.pause();
    const audio = new Audio(segment.url);
    audio.onended = () => { setPlayingUrl(null); setPaused(false); };
    audio.onerror = () => { setPlayingUrl(null); setPaused(false); };
    audio.play().catch(() => {});
    audioRef.current = audio;
    setPlayingUrl(segment.url);
    setPaused(false);
  }, [playingUrl, paused]);

  // 下载
  const downloadSegment = useCallback(async (segment: AudioSegment) => {
    try {
      const response = await fetch(segment.url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = segment.filename;
      link.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      // fallback
      window.open(segment.url, '_blank');
    }
  }, []);

  // 转写音频
  const transcribeSegment = useCallback(async (segment: AudioSegment) => {
    setTranscribingSegments(prev => new Set(prev).add(segment.filename));
    try {
      const res = await fetch('/api/recorder/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioUrl: segment.url,
          sessionId,
          segmentSeq: parseInt(segment.filename.match(/seg(\d+)/)?.[1] || '0', 10),
        }),
      });
      const json = await res.json();
      if (json.success && json.data?.text) {
        setTranscriptionMap(prev => ({ ...prev, [segment.filename]: json.data.text }));
      } else {
        console.error('转写失败:', json.error);
      }
    } catch (err) {
      console.error('转写请求失败:', err);
    }
    setTranscribingSegments(prev => {
      const next = new Set(prev);
      next.delete(segment.filename);
      return next;
    });
  }, [sessionId]);

  // 格式化
  const formatDuration = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  /**
   * 从文件名中提取录制开始时间
   * 文件名格式: {roomName}_seg{n}_{HH-MM}.mp3
   * 使用今天的日期 + 文件名中的时间来构造完整时间
   */
  const extractTimeFromFilename = (filename: string): string | null => {
    // 匹配末尾的 HH-MM 部分
    const match = filename.match(/_(\d{2})-(\d{2})\.mp3$/);
    if (match) {
      const now = new Date();
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    return null;
  };

  const formatSegmentTime = (seg: AudioSegment): string => {
    // 优先使用文件名中的时间（更准确，代表录制开始时间）
    const fromFilename = extractTimeFromFilename(seg.filename);
    if (fromFilename) return fromFilename;
    // 回退到文件修改时间
    try {
      return new Date(seg.mtime).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return seg.mtime;
    }
  };

  // 录制时长实时更新
  const [displayDuration, setDisplayDuration] = useState(0);
  useEffect(() => {
    if (recordingStatus?.isRecording) {
      setDisplayDuration(recordingStatus.duration);
      const timer = setInterval(() => {
        setDisplayDuration((prev) => prev + 1);
      }, 1000);
      return () => clearInterval(timer);
    } else {
      setDisplayDuration(0);
    }
  }, [recordingStatus?.isRecording, recordingStatus?.duration]);

  // 轮询录制状态（5秒间隔）
  useEffect(() => {
    fetchStatus();
    fetchSegments();

    pollRef.current = setInterval(() => {
      fetchStatus();
      fetchSegments();
    }, 5000);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [fetchStatus, fetchSegments]);

  // 清理
  useEffect(() => {
    return () => {
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const isRecording = recordingStatus?.isRecording ?? false;

  // 计算当前片段剩余时间（30分钟 - 已录制时长）
  const segmentRemaining = isRecording
    ? Math.max(0, 30 * 60 - displayDuration)
    : 0;
  const remainingMinutes = Math.floor(segmentRemaining / 60);
  const remainingSeconds = segmentRemaining % 60;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-primary" />
          直播音频录制
          {isRecording && (
            <Badge variant="default" className="ml-2 text-[10px]">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400 mr-1 animate-pulse" />
              录制中
            </Badge>
          )}
          {roomName && (
            <span className="text-sm font-normal text-muted-foreground ml-1">
              {roomName}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 录制控制区 */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border">
          <div className="flex items-center gap-3">
            <div className={`h-2.5 w-2.5 rounded-full ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-muted-foreground'}`} />
            {isRecording ? (
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-primary">
                  {formatDuration(displayDuration)}
                </span>
                <Badge variant="secondary" className="text-[10px]">
                  片段 #{recordingStatus?.segmentIndex ?? '-'}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  下一段 {remainingMinutes}:{remainingSeconds.toString().padStart(2, '0')} 后
                </span>
              </div>
            ) : (
              <span className="text-sm text-muted-foreground">
                {segments.length > 0 ? `已录制 ${segments.length} 个片段` : '未开始录制'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {error && (
              <span className="text-xs text-destructive flex items-center gap-1 mr-2">
                <AlertCircle className="h-3 w-3" /> {error}
              </span>
            )}

            {isRecording ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={stopRecording}
                disabled={loading === 'stop'}
              >
                {loading === 'stop' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Square className="h-3.5 w-3.5 mr-1" />
                )}
                停止录制
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={startRecording}
                disabled={loading === 'start'}
              >
                {loading === 'start' ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                ) : (
                  <Mic className="h-3.5 w-3.5 mr-1" />
                )}
                开始录制
              </Button>
            )}

            <Button size="sm" variant="ghost" onClick={() => { fetchStatus(); fetchSegments(); }}>
              <RefreshCw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* 录制说明 */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p>服务端 ffmpeg 拉流录制，每30分钟自动分段，音频保存为 MP3 格式。</p>
          <p>流地址从直播间的 FLV 流直接获取，无需额外鉴权。</p>
        </div>

        {/* 已录制片段列表 */}
        {segments.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-muted-foreground">
              录制片段 ({segments.length})
            </p>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {segments.map((seg) => (
                <div
                  key={seg.filename}
                  className={`p-2.5 rounded-lg border transition-colors ${
                    playingUrl === seg.url && !paused
                      ? 'border-primary/50 bg-primary/5'
                      : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-3">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0"
                    onClick={() => togglePlayback(seg)}
                  >
                    {playingUrl === seg.url && !paused ? (
                      <Pause className="h-4 w-4 text-primary" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {formatSegmentTime(seg)}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        MP3
                      </Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {formatSize(seg.size)}
                      </Badge>
                      {seg.transcribe_status && (
                        <Badge 
                          variant={seg.transcribe_status === 'success' ? 'default' : seg.transcribe_status === 'pending' ? 'outline' : 'destructive'} 
                          className="text-[10px]"
                        >
                          {seg.transcribe_status === 'success' ? '转写完成' : 
                           seg.transcribe_status === 'pending' ? '等待转写' : 
                           seg.transcribe_status === 'failed' ? '转写失败' : seg.transcribe_status}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                      {seg.filename}
                    </p>
                  </div>

                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => downloadSegment(seg)}
                    title="下载"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0"
                    onClick={() => transcribeSegment(seg)}
                    disabled={transcribingSegments.has(seg.filename) || seg.transcribe_status === 'success'}
                    title="转写为文字"
                  >
                    {transcribingSegments.has(seg.filename) || seg.transcribe_status === 'pending' ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <FileText className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  </div>
                  {/* 转写文本展示 */}
                  {transcriptionMap[seg.filename] && (
                    <div className="mt-2 p-2 rounded bg-muted/50 text-xs text-muted-foreground leading-relaxed">
                      <p className="font-medium text-foreground mb-1">转写文本:</p>
                      <p className="whitespace-pre-wrap">{transcriptionMap[seg.filename]}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
