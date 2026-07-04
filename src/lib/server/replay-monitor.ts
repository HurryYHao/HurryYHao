// 录播回放监控模块 - 针对智能直播的录播分析功能
// 选择智能直播房间和场次，进行数据抓取和AI分析

import { adminApiRequest } from './auth';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { 
  fetchLiveSpaceOptions, 
  fetchReplayAnalysis, 
  fetchReplayChartData, 
  fetchReplayNewoldData, 
  fetchReplayOrderAnalysis 
} from './fetcher';
import { extractAnchorName, runAnalysisForReplay } from './analyzer';
import { globalQueue } from '@/worker/queue';

// 正在运行的分析任务（防止重复触发）
const runningAnalyses = new Set<number>();

// 缓存模板名称
const templateNameCache = new Map<string, string>();

/**
 * 获取智能模板名称
 */
async function getIntelligenceTemplateName(templateId: string): Promise<string> {
  if (templateNameCache.has(templateId)) {
    return templateNameCache.get(templateId)!;
  }
  
  try {
    const result = await adminApiRequest<{
      code: number;
      data: {
        id: string;
        name: string;
        [key: string]: unknown;
      };
    }>(`/api/livemanage/intelligenceTemplate/detail?id=${templateId}`, {
      method: 'GET',
    });
    
    const templateName = result.data?.name || '智能模板';
    templateNameCache.set(templateId, templateName);
    return templateName;
  } catch (err) {
    console.error('[ReplayMonitor] 获取智能模板名称失败:', templateId, err);
    return '智能模板';
  }
}

export interface ReplayRoom {
  id: string;
  roomId: string;
  roomName: string;
  intelligenceRoom: boolean;
  liveStatus: string;
  startTime: string;
  downTime: string;
  intelligenceTemplateId?: string;
  templateName?: string;
  coverUrl?: string;
}

export interface ReplaySession {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isAnalyzed: boolean;
  analyzedAt: string | null;
  roomId?: string;
  roomName?: string;
  templateName?: string;
}

/**
 * 获取智能直播房间列表
 */
export async function getReplayRooms(page = 1, size = 100): Promise<{ rooms: ReplayRoom[]; total: number }> {
  console.log('[ReplayMonitor] getReplayRooms 被调用（使用智能直播API）');
  
  // 1. 使用智能直播API获取房间列表
  const listResult = await adminApiRequest<{
    code: number;
    data: {
      records: Array<Record<string, unknown>>;
      total: number;
    };
  }>('/api/livemanage/intelligenceRoom/page', {
    body: { model: {}, extra: {}, current: page, size },
    pathOverride: '/livemanage/intelligenceRoom',
  });

  const rawRecords = listResult.data?.records || [];
  console.log('[ReplayMonitor] 智能直播房间记录数量:', rawRecords.length);
  console.log('[ReplayMonitor] 原始房间数据样本 (前3个):', JSON.stringify(rawRecords.slice(0, 3), null, 2));
  
  // 2. 对每个房间获取详情
  const rooms: ReplayRoom[] = [];
  
  for (let i = 0; i < rawRecords.length; i++) {
    const rawRoom = rawRecords[i];
    try {
      const roomId = String(rawRoom.roomId || rawRoom.id || '');
      if (!roomId) continue;
      
      // 获取房间详情
      const detailResult = await adminApiRequest<{
        code: number;
        data: Record<string, unknown>;
      }>(`/api/livemanage/openClassesRoom/detail?id=${roomId}`, {
        method: 'GET',
        pathOverride: `/livemanage/intelligenceRoom/manage/${roomId}`,
      });
      
      const roomDetail = detailResult.data || {};
      
      if (i < 3) {
        console.log(`[ReplayMonitor] 房间 ${i} (ID: ${roomId}) 详情:`, JSON.stringify(roomDetail, null, 2));
      }
      
      // 获取模板名称
      const templateId = roomDetail.intelligenceTemplateId || rawRoom.intelligenceTemplateId;
      let templateName = '智能模板';
      if (templateId) {
        templateName = await getIntelligenceTemplateName(String(templateId));
      }
      
      // 显示所有从智能直播API获取的房间
      if (true) {
        console.log('[ReplayMonitor] 找到智能直播房间:', {
          id: roomId,
          name: rawRoom.name || roomDetail.name,
          templateId,
          templateName
        });
        
        rooms.push({
          id: roomId,
          roomId: roomId,
          roomName: String(rawRoom.name || roomDetail.name || ''),
          intelligenceRoom: true,
          liveStatus: String(rawRoom.liveStatus || roomDetail.liveStatus || ''),
          startTime: String(rawRoom.startTime || roomDetail.startTime || ''),
          downTime: String(roomDetail.downTime || ''),
          intelligenceTemplateId: templateId ? String(templateId) : undefined,
          templateName: templateName,
          coverUrl: roomDetail.liveCover ? String(roomDetail.liveCover) : undefined,
        });
      }
    } catch (err) {
      console.error('[ReplayMonitor] 处理房间失败:', rawRoom.id, err);
    }
  }
  
  console.log('[ReplayMonitor] 智能直播房间数量:', rooms.length);
  console.log('[ReplayMonitor] 找到的智能直播房间:', rooms);
  
  return {
    rooms,
    total: listResult.data?.total || 0,
  };
}

/**
 * 检查录播场次是否已被分析（包括实时直播分析或录播分析）
 */
export async function checkIfSessionAnalyzed(roomId: string, liveSpaceId: string): Promise<{ isAnalyzed: boolean; analyzedAt: string | null }> {
  const client = getSupabaseClient();

  const { data: sessions, error } = await client
    .from('live_sessions')
    .select('*')
    .eq('room_id', roomId)
    .eq('live_space_id', liveSpaceId)
    .in('status', ['ended', 'analyzing']);

  if (error || !sessions || sessions.length === 0) {
    return { isAnalyzed: false, analyzedAt: null };
  }

  // 找到最新的已完成分析的会话
  const latestSession = sessions.find((s: any) => s.status === 'ended') || sessions[0];
  return {
    isAnalyzed: true,
    analyzedAt: latestSession.last_analysis_time || latestSession.created_at,
  };
}

/**
 * 获取指定房间的录播场次列表
 */
export async function getReplaySessions(roomId: string): Promise<ReplaySession[]> {
  console.log('[ReplayMonitor] getReplaySessions 被调用, roomId:', roomId);
  
  // 使用现成的 fetchLiveSpaceOptions 函数
  const rawSessions = await fetchLiveSpaceOptions(roomId);
  console.log('[ReplayMonitor] 原始直播场次:', rawSessions.length);

  // 对每个场次检查是否已分析
  const sessionsWithAnalysisStatus: ReplaySession[] = [];
  for (const raw of rawSessions) {
    const { isAnalyzed, analyzedAt } = await checkIfSessionAnalyzed(roomId, raw.id);
    sessionsWithAnalysisStatus.push({
      id: raw.id,
      name: raw.name,
      startTime: raw.startTime,
      endTime: raw.endTime,
      isAnalyzed,
      analyzedAt,
    });
  }

  console.log('[ReplayMonitor] 处理完的直播场次:', sessionsWithAnalysisStatus.length);
  return sessionsWithAnalysisStatus;
}

/**
 * 启动录播回放监控会话
 */
export async function startReplaySession(
  roomId: string,
  roomName: string,
  liveSpaceId: string,
  sessionName: string,
  startTime: string,
  endTime: string
): Promise<number> {
  const client = getSupabaseClient();
  const now = new Date().toISOString();
  const anchorName = extractAnchorName(roomName || '');

  // 创建数据库记录
  const { data: session, error } = await client
    .from('live_sessions')
    .insert({
      room_id: roomId,
      room_name: roomName,
      live_space_id: liveSpaceId,
      start_time: startTime,
      end_time: endTime,
      status: 'recording',
      last_snapshot_seq: 0,
      last_analysis_time: now,
      anchor_name: anchorName,
      session_type: 'replay',
    })
    .select('id')
    .single();

  if (error) {
    throw new Error('创建录播回放会话失败: ' + error.message);
  }

  const sessionId = session.id;

  // 立即抓取完整的录播数据（第1个快照，包含所有录播的完整数据）
  try {
    await fetchReplaySnapshot(sessionId, roomId, liveSpaceId, 1);
  } catch (err) {
    console.error('[ReplayMonitor] 首次录播数据抓取失败:', err);
  }

  // 启动后台队列任务，处理录播回放分析
  await globalQueue.enqueue('replay_analysis', {
    sessionId,
    roomId,
    liveSpaceId,
    roomName,
  });

  return sessionId;
}

/**
 * 抓取录播数据快照
 */
export async function fetchReplaySnapshot(
  sessionId: number,
  roomId: string,
  liveSpaceId: string,
  snapshotSeq: number
): Promise<void> {
  console.log('[ReplayMonitor] fetchReplaySnapshot 被调用');
  const client = getSupabaseClient();

  // 并行抓取各类数据
  const [analysis, chartData, newoldData, orderAnalysis] = await Promise.all([
    fetchReplayAnalysis(roomId, liveSpaceId),
    fetchReplayChartData(roomId, liveSpaceId),
    fetchReplayNewoldData(roomId, liveSpaceId),
    fetchReplayOrderAnalysis(roomId, liveSpaceId),
  ]);

  const rawJson = {
    analysis,
    chartData,
    newoldData,
    orderAnalysis,
  };

  // 保存到数据库
  const { error } = await client
    .from('snapshot_data')
    .insert({
      session_id: sessionId,
      snapshot_seq: snapshotSeq,
      snapshot_time: new Date().toISOString(),
      watcher_cnt: analysis.watcherCnt ? parseInt(analysis.watcherCnt as string) : null,
      comment_cnt: analysis.commentCnt ? parseInt(analysis.commentCnt as string) : null,
      online_user_cnt: analysis.peakConcurrentViewers ? parseInt(analysis.peakConcurrentViewers as string) : null,
      order_total: analysis.transactionAmount ? analysis.transactionAmount : null,
      order_count: analysis.transactionCnt ? parseInt(analysis.transactionCnt as string) : null,
      new_fan_conversion_rate: newoldData.nconversionRate || null,
      old_fan_conversion_rate: newoldData.oconversionRate || null,
      new_fan_pay_count: newoldData.ntransactionUserCnt ? parseInt(newoldData.ntransactionUserCnt as string) : null,
      old_fan_pay_count: newoldData.otransactionUserCnt ? parseInt(newoldData.otransactionUserCnt as string) : null,
      raw_json: rawJson,
    });

  if (error) {
    throw new Error('保存录播快照数据失败: ' + error.message);
  }

  // 更新会话的最后快照序号
  await client
    .from('live_sessions')
    .update({ last_snapshot_seq: snapshotSeq })
    .eq('id', sessionId);
  
  console.log('[ReplayMonitor] 录播快照保存成功');
}

/**
 * 执行录播回放分析（单次分析完整分析 - 不同于实时直播，录播可以一次性分析）
 */
export async function runReplayAnalysis(
  sessionId: number,
  roomId: string,
  liveSpaceId: string
): Promise<void> {
  if (runningAnalyses.has(sessionId)) {
    console.log('[ReplayMonitor] 录播分析已在进行中，跳过重复执行');
    return;
  }

  runningAnalyses.add(sessionId);
  console.log('[ReplayMonitor] runReplayAnalysis 开始执行');

  try {
    const client = getSupabaseClient();

    // 更新会话状态为分析中
    await client
      .from('live_sessions')
      .update({ status: 'analyzing' })
      .eq('id', sessionId);

    // 获取录播分析
    await runAnalysisForReplay(sessionId, roomId, liveSpaceId);

    // 更新会话状态为已结束
    await client
      .from('live_sessions')
      .update({
        status: 'ended',
        last_analysis_time: new Date().toISOString(),
      })
      .eq('id', sessionId);

  } finally {
    runningAnalyses.delete(sessionId);
    console.log('[ReplayMonitor] runReplayAnalysis 执行完成');
  }
}

/**
 * 获取录播回放会话状态
 */
export async function getReplaySessionStatus(sessionId: number): Promise<any> {
  const client = getSupabaseClient();

  const { data: session, error } = await client
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (error) {
    throw new Error('获取录播会话状态失败: ' + error.message);
  }

  const { data: snapshots } = await client
    .from('snapshot_data')
    .select('*')
    .eq('session_id', sessionId)
    .order('snapshot_seq', { ascending: true });

  const { data: reports } = await client
    .from('analysis_reports')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  return {
    session,
    snapshots: snapshots || [],
    reports: reports || [],
  };
}

/**
 * 获取所有录播回放会话列表
 */
export async function getAllReplaySessions(): Promise<any[]> {
  const client = getSupabaseClient();

  const { data: sessions, error } = await client
    .from('live_sessions')
    .select('*')
    .eq('session_type', 'replay')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('获取录播会话列表失败: ' + error.message);
  }

  return sessions || [];
}
