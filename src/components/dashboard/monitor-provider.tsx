'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/* ---------- Types ---------- */
interface LogEntry { time: string; level: string; message: string; }

interface Room {
  id: string; roomId: string; roomName: string; liveStatus: string;
  startTime: string | null; coverUrl?: string; description?: string;
  online?: string; anchorId?: string;
  roomType?: 'normal' | 'intelligence'; templateName?: string;
  liveData?: {
    onlineCount: number; totalWatchCount: number; commentCount: number;
    commenterCnt: number; orderTotalAmount: number; orderCount: number;
  };
}

interface LiveSummary {
  totalOnline: number; totalWatch: number; totalComments: number;
  totalCommenters: number; totalAmount: number; totalOrders: number;
  liveRoomCount: number;
}

interface RecordingStatus {
  sessionId: number; roomId: string; roomName: string | null;
  status: string; startTime: string | null;
  lastAnalysisTime: string | null; lastSnapshotSeq: number;
  nextAnalysisIn: number | null; isAnalyzing: boolean;
  recordingDuration: number | null;
}

interface NumberAnalysis { total: string; inStart: string; notStart: string; }

interface SessionInfo {
  id: number; roomId: string; roomName: string | null; status: string;
  startTime: string | null; endTime: string | null; lastSnapshotSeq: number;
}

export interface MonitorData {
  numberAnalysis: NumberAnalysis;
  rooms: Room[];
  activeSessions: SessionInfo[];
  recentSessions: { id: string; roomId: string; roomName: string; status: string; startTime: string; endTime: string }[];
  recordingStatus?: RecordingStatus[];
  liveSummary?: LiveSummary;
}

interface MonitorState {
  /** 是否正在轮询 */
  polling: boolean;
  /** 切换轮询 */
  togglePolling: () => void;
  /** 手动触发一次状态轮询 */
  manualPoll: () => Promise<void>;
  /** 手动轮询加载中 */
  manualLoading: boolean;
  /** 活跃会话列表 */
  activeSessions: SessionInfo[];
  /** 直播中的房间数量 */
  liveRoomCount: number;
  /** 完整监控数据（rooms/liveSummary/recordingStatus等） */
  monitorData: MonitorData | null;
  /** 数据是否首次加载中 */
  dataLoading: boolean;
  /** 距下次刷新倒计时（秒） */
  nextRefreshIn: number;
  /** 操作日志 */
  logs: LogEntry[];
  /** 添加日志 */
  addLog: (level: string, message: string) => void;
  /** 最近一次轮询时间 */
  lastPollTime: Date | null;
  /** 快照抓取 */
  snapshot: (sessionId: number) => Promise<void>;
  /** 片段分析 */
  analyze: (sessionId: number) => Promise<void>;
}

const MonitorContext = createContext<MonitorState | null>(null);

export function useMonitor() {
  const ctx = useContext(MonitorContext);
  if (!ctx) throw new Error('useMonitor must be used within MonitorProvider');
  return ctx;
}

/** 全局数据轮询间隔（毫秒） */
const POLL_INTERVAL = 10_000;

/* ---------- Provider ---------- */
export function MonitorProvider({ children }: { children: React.ReactNode }) {
  const [polling, setPolling] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
  const [liveRoomCount, setLiveRoomCount] = useState(0);
  const [monitorData, setMonitorData] = useState<MonitorData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [nextRefreshIn, setNextRefreshIn] = useState(POLL_INTERVAL / 1000);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('monitor-polling');
    if (saved === 'false') setPolling(false);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem('monitor-polling', String(polling));
  }, [polling, hydrated]);

  const addLog = useCallback((level: string, message: string) => {
    setLogs(prev => [...prev.slice(-199), { time: new Date().toLocaleTimeString('zh-CN'), level, message }]);
  }, []);

  /* --- 核心轮询方法 --- */
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/status');
      const json = await res.json();
      if (json.success) {
        const d = json.data as MonitorData;
        setMonitorData(d);
        setActiveSessions(d.activeSessions || []);
        const liveRooms = (d.rooms || []).filter(
          (r: Room) => r.liveStatus === 'STARTING'
        );
        setLiveRoomCount(liveRooms.length);
        setLastPollTime(new Date());
        setDataLoading(false);

        const roomCount = d.rooms?.length || 0;
        const sessionCount = d.activeSessions?.length || 0;
        const recordingCount = d.recordingStatus?.length || 0;

        let logMsg = `状态轮询完成: ${roomCount} 个房间, ${sessionCount} 个活跃会话`;
        if (recordingCount > 0) logMsg += `, ${recordingCount} 个录制中`;
        addLog('info', logMsg);

        // 检测自动开播/下播
        const pollResult = (json.data as Record<string, unknown>).pollResult as { newLiveRooms?: string[]; endedRooms?: string[] } | undefined;
        if (pollResult?.newLiveRooms?.length) {
          addLog('info', `[自动检测] 新开播房间: ${pollResult.newLiveRooms.join(', ')}`);
          toast.success(`检测到新开播，已自动创建录制会话`);
        }
        if (pollResult?.endedRooms?.length) {
          addLog('info', `[自动检测] 已下播房间: ${pollResult.endedRooms.join(', ')}`);
          toast.info(`检测到直播结束，已执行终场分析`);
        }

        const triggered = (json.data as Record<string, unknown>).autoAnalysisTriggered as Array<{ roomId: string; segmentSeq: number }> | undefined;
        if (triggered?.length) {
          for (const t of triggered) {
            addLog('info', `[自动分析] 触发片段分析: 房间${t.roomId}, 第${t.segmentSeq}段`);
            toast.info(`自动分析已触发: 第${t.segmentSeq}段`);
          }
        }
      } else {
        addLog('error', `轮询返回错误: ${json.error}`);
      }
    } catch {
      addLog('error', '状态轮询网络异常');
    }
  }, [addLog]);

  /* --- 轮询定时器 --- */
  useEffect(() => {
    if (polling) {
      fetchStatus();
      setNextRefreshIn(POLL_INTERVAL / 1000);
      intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL);
      // 倒计时
      countdownRef.current = setInterval(() => {
        setNextRefreshIn(prev => Math.max(0, prev - 1));
      }, 1000);
      addLog('info', `全局轮询已启动 (${POLL_INTERVAL / 1000}s)`);
      toast.success('监控轮询已启动');
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
      if (lastPollTime) {
        addLog('info', '全局轮询已停止');
        toast.info('监控轮询已停止');
      }
    }
    return () => {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  // 每次轮询完成后重置倒计时
  useEffect(() => {
    if (lastPollTime) setNextRefreshIn(POLL_INTERVAL / 1000);
  }, [lastPollTime]);

  const togglePolling = useCallback(() => setPolling(p => !p), []);

  const manualPoll = useCallback(async () => {
    setManualLoading(true);
    addLog('info', '手动触发状态轮询...');
    try {
      const res = await fetch('/api/monitor/status', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        const d = json.data as MonitorData;
        setMonitorData(d);
        setActiveSessions(d.activeSessions || []);
        const liveRooms = (d.rooms || []).filter(
          (r: Room) => r.liveStatus === 'STARTING'
        );
        setLiveRoomCount(liveRooms.length);
        setLastPollTime(new Date());
        setNextRefreshIn(POLL_INTERVAL / 1000);
        addLog('info', `手动轮询成功: ${d.rooms?.length || 0} 个房间`);
        toast.success('轮询成功');
      } else {
        addLog('error', `手动轮询失败: ${json.error}`);
        toast.error(json.error || '轮询失败');
      }
    } catch (err) {
      addLog('error', `手动轮询异常: ${err}`);
      toast.error('轮询异常');
    } finally {
      setManualLoading(false);
    }
  }, [addLog]);

  const snapshot = useCallback(async (sessionId: number) => {
    addLog('info', `触发快照抓取: session=${sessionId}`);
    try {
      const res = await fetch('/api/fetcher/snapshot', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (json.success) {
        addLog('info', `快照抓取成功: #${json.data?.snapshotSeq || '?'}`);
        toast.success('快照抓取成功');
      } else {
        addLog('error', `快照抓取失败: ${json.error}`);
        toast.error(json.error || '抓取失败');
      }
    } catch (err) {
      addLog('error', `快照抓取异常: ${err}`);
      toast.error('抓取异常');
    }
  }, [addLog]);

  const analyze = useCallback(async (sessionId: number) => {
    addLog('info', `触发片段分析: session=${sessionId}`);
    try {
      const res = await fetch('/api/monitor/segment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (json.success) {
        addLog('info', '片段分析完成');
        toast.success('分析完成');
      } else {
        addLog('error', `片段分析失败: ${json.error}`);
        toast.error(json.error || '分析失败');
      }
    } catch (err) {
      addLog('error', `片段分析异常: ${err}`);
      toast.error('分析异常');
    }
  }, [addLog]);

  const value: MonitorState = {
    polling, togglePolling, manualPoll, manualLoading,
    activeSessions, liveRoomCount, monitorData, dataLoading,
    nextRefreshIn, logs, addLog, lastPollTime,
    snapshot, analyze,
  };

  return (
    <MonitorContext.Provider value={value}>
      {children}
    </MonitorContext.Provider>
  );
}
