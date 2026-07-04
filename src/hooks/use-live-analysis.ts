'use client';

import { useState, useEffect, useCallback } from 'react';

// ==================== 类型定义 ====================

export interface LiveSession {
  id: number;
  room_id: string;
  room_name: string;
  live_space_id: string | null;
  start_time: string | null;
  end_time: string | null;
  status: string;
  last_snapshot_seq: number;
  error_message: string | null;
  created_at: string;
}

export interface SnapshotData {
  id: number;
  snapshot_seq: number;
  snapshot_time: string;
  watcher_cnt: number | null;
  comment_cnt: number | null;
  online_user_cnt: number | null;
  order_total: string | null;
  order_count: number | null;
  new_fan_conversion_rate: string | null;
  old_fan_conversion_rate: string | null;
  new_fan_pay_count: number | null;
  old_fan_pay_count: number | null;
}

export interface AnalysisReport {
  id: number;
  session_id: number;
  report_type: string;
  segment_seq: number;
  anchor_analysis: string | null;
  interaction_analysis: string | null;
  conversion_analysis: string | null;
  sentiment_analysis: string | null;
  rhythm_analysis: string | null;
  analysis_text: string | null;
  skill_version: string | null;
  model_used: string | null;
  created_at: string;
}

export interface MonitorStatus {
  numberAnalysis: {
    total: number;
    inStart: number;
    notStart: number;
  };
  rooms: Array<{
    id: string;
    roomId: string;
    roomName: string;
    liveStatus: string;
    startTime: string | null;
    coverUrl?: string;
    description?: string;
  }>;
  activeSessions: LiveSession[];
  recentSessions: LiveSession[];
}

export interface SessionDetail {
  session: LiveSession;
  snapshots: SnapshotData[];
  reports: AnalysisReport[];
}

// ==================== API Hooks ====================

export function useApi() {
  const [loading, setLoading] = useState(false);

  const apiCall = useCallback(async <T = unknown>(
    url: string,
    options?: RequestInit
  ): Promise<{ data: T | null; error: string | null }> => {
    setLoading(true);
    try {
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
      });
      const result = await response.json() as { success: boolean; data?: T; error?: string };

      if (!result.success) {
        return { data: null, error: result.error || '请求失败' };
      }
      return { data: result.data as T, error: null };
    } catch (err) {
      return { data: null, error: err instanceof Error ? err.message : '网络错误' };
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, apiCall };
}

// ==================== 监控状态 Hook ====================

export function useMonitorStatus(autoRefresh = false) {
  const [status, setStatus] = useState<MonitorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/monitor/status');
      const result = await response.json() as { success: boolean; data?: MonitorStatus; error?: string };

      if (result.success && result.data) {
        setStatus(result.data);
        setError(null);
      } else {
        setError(result.error || '获取状态失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();

    if (autoRefresh) {
      const interval = setInterval(fetchStatus, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchStatus, autoRefresh]);

  return { status, loading, error, refetch: fetchStatus };
}

// ==================== 会话列表 Hook ====================

export function useSessions(page = 1, pageSize = 20) {
  const [data, setData] = useState<{ sessions: LiveSession[]; total: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/sessions?page=${page}&pageSize=${pageSize}`);
      const result = await response.json() as { success: boolean; data?: { sessions: LiveSession[]; total: number }; error?: string };

      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error || '获取会话列表失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  return { data, loading, error, refetch: fetchSessions };
}

// ==================== 报告详情 Hook ====================

export function useReportDetail(sessionId: number | null) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    setLoading(true);
    fetch(`/api/reports/${sessionId}`)
      .then((response) => response.json())
      .then((result: { success: boolean; data?: SessionDetail; error?: string }) => {
        if (result.success && result.data) {
          setDetail(result.data);
          setError(null);
        } else {
          setError(result.error || '获取报告失败');
        }
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [sessionId]);

  return { detail, loading, error };
}

// ==================== 流式分析 Hook ====================

export function useStreamAnalysis() {
  const [streaming, setStreaming] = useState(false);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const startStream = useCallback(async (
    sessionId: number,
    roomId: string,
    segmentSeq: number,
    reportType: 'segment' | 'final'
  ) => {
    setStreaming(true);
    setContent('');
    setError(null);

    try {
      const url = `/api/analysis/run?sessionId=${sessionId}&roomId=${roomId}&segmentSeq=${segmentSeq}&reportType=${reportType}`;
      const response = await fetch(url);

      if (!response.ok) throw new Error('流式分析请求失败');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法获取响应流');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data) as { content?: string; error?: string };
              if (parsed.content) {
                setContent((prev) => prev + parsed.content);
              }
              if (parsed.error) {
                setError(parsed.error);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '流式分析失败');
    } finally {
      setStreaming(false);
    }
  }, []);

  return { streaming, content, error, startStream };
}
