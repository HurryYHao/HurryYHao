'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

/* ---------- Types ---------- */
interface LogEntry { time: string; level: string; message: string; }

interface SessionInfo {
  id: number; roomId: string; roomName: string | null; status: string;
  startTime: string | null; endTime: string | null; lastSnapshotSeq: number;
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
  /** 直播中的房间数量 (liveStatus=STARTING) */
  liveRoomCount: number;
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

/* ---------- Provider ---------- */
export function MonitorProvider({ children }: { children: React.ReactNode }) {
  // 始终用 true 初始化（避免 hydration mismatch），在 useEffect 中读取 localStorage
  const [polling, setPolling] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [activeSessions, setActiveSessions] = useState<SessionInfo[]>([]);
  const [liveRoomCount, setLiveRoomCount] = useState(0);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastPollTime, setLastPollTime] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 挂载后从 localStorage 恢复状态（避免 hydration mismatch）
  useEffect(() => {
    const saved = localStorage.getItem('monitor-polling');
    if (saved === 'false') setPolling(false);
    setHydrated(true);
  }, []);

  // 保存状态到 localStorage
  useEffect(() => {
    if (hydrated) {
      localStorage.setItem('monitor-polling', String(polling));
    }
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
        setActiveSessions(json.data.activeSessions || []);
        // 统计直播中的房间数（liveStatus=STARTING 表示直播中）
        const liveRooms = (json.data.rooms || []).filter(
          (r: { liveStatus: string }) => r.liveStatus === 'STARTING'
        );
        setLiveRoomCount(liveRooms.length);
        setLastPollTime(new Date());
        
        const roomCount = json.data.rooms?.length || 0;
        const sessionCount = json.data.activeSessions?.length || 0;
        const recordingCount = json.data.recordingStatus?.length || 0;
        
        let logMsg = `状态轮询完成: ${roomCount} 个房间, ${sessionCount} 个活跃会话`;
        if (recordingCount > 0) {
          logMsg += `, ${recordingCount} 个录制中`;
        }
        addLog('info', logMsg);
        
        // 检测自动分析触发
        const triggered = json.data.autoAnalysisTriggered || [];
        if (triggered.length > 0) {
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

  /* --- 轮询定时器（全局，不随页面卸载而消失） --- */
  useEffect(() => {
    if (polling) {
      fetchStatus();
      intervalRef.current = setInterval(fetchStatus, 30000);
      addLog('info', '全局轮询已启动 (30s)');
      toast.success('监控轮询已启动');
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (lastPollTime) {
        addLog('info', '全局轮询已停止');
        toast.info('监控轮询已停止');
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [polling]);

  const togglePolling = useCallback(() => setPolling(p => !p), []);

  const manualPoll = useCallback(async () => {
    setManualLoading(true);
    addLog('info', '手动触发状态轮询...');
    try {
      const res = await fetch('/api/monitor/status', { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        setActiveSessions(json.data.activeSessions || []);
        const liveRooms = (json.data.rooms || []).filter(
          (r: { liveStatus: string }) => r.liveStatus === 'STARTING'
        );
        setLiveRoomCount(liveRooms.length);
        setLastPollTime(new Date());
        addLog('info', `手动轮询成功: ${json.data.rooms?.length || 0} 个房间`);
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
    activeSessions, liveRoomCount, logs, addLog, lastPollTime,
    snapshot, analyze,
  };

  return (
    <MonitorContext.Provider value={value}>
      {children}
    </MonitorContext.Provider>
  );
}
