// 报告生成模块 - Markdown 报告生成

import { getSupabaseClient } from '@/storage/database/supabase-client';

interface SessionInfo {
  id: number;
  room_id: string;
  room_name: string;
  start_time: string | null;
  end_time: string | null;
  status: string;
  last_snapshot_seq: number;
}

/**
 * 生成 Markdown 格式的分析报告
 */
export async function generateMarkdownReport(sessionId: number): Promise<string> {
  const client = getSupabaseClient();

  // 获取会话信息
  const { data: session, error: sessionError } = await client
    .from('live_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError) throw new Error(`查询会话失败: ${sessionError.message}`);
  if (!session) throw new Error('会话不存在');

  const s = session as unknown as SessionInfo;

  // 获取快照数据
  const { data: snapshots, error: snapError } = await client
    .from('snapshot_data')
    .select('snapshot_seq, snapshot_time, watcher_cnt, comment_cnt, online_user_cnt, order_total, order_count, new_fan_conversion_rate, old_fan_conversion_rate')
    .eq('session_id', sessionId)
    .order('snapshot_seq', { ascending: true });

  if (snapError) throw new Error(`查询快照失败: ${snapError.message}`);

  // 获取分析报告
  const { data: reports, error: reportError } = await client
    .from('analysis_reports')
    .select('*')
    .eq('session_id', sessionId)
    .order('segment_seq', { ascending: true });

  if (reportError) throw new Error(`查询报告失败: ${reportError.message}`);

  // 计算时长
  const startTime = s.start_time ? new Date(s.start_time) : null;
  const endTime = s.end_time ? new Date(s.end_time) : null;
  const durationMs = startTime && endTime ? endTime.getTime() - startTime.getTime() : null;
  const durationStr = durationMs
    ? `${Math.floor(durationMs / 3600000)}小时${Math.floor((durationMs % 3600000) / 60000)}分钟`
    : '进行中';

  // 汇总数据
  const totalWatcher = (snapshots || []).reduce((sum: number, snap: Record<string, unknown>) => sum + ((snap.watcher_cnt as number) || 0), 0);
  const maxOnline = Math.max(...(snapshots || []).map((snap: Record<string, unknown>) => (snap.online_user_cnt as number) || 0));
  const totalComments = (snapshots || []).reduce((sum: number, snap: Record<string, unknown>) => sum + ((snap.comment_cnt as number) || 0), 0);
  const lastSnapshot = (snapshots || [])[(snapshots || []).length - 1] as Record<string, unknown> | undefined;
  const totalOrderAmount = lastSnapshot?.order_total || '0';
  const totalOrderCount = (snapshots || []).reduce((sum: number, snap: Record<string, unknown>) => sum + ((snap.order_count as number) || 0), 0);

  // 生成 Markdown
  let md = `# 直播分析：${s.room_name || s.room_id} - ${new Date().toISOString().split('T')[0]}

## 基础信息
- 直播ID: ${s.room_id}
- 开播时间: ${startTime?.toLocaleString('zh-CN') || '未知'}
- 下播时间: ${endTime?.toLocaleString('zh-CN') || '进行中'}
- 总时长: ${durationStr}
- 监控片段数: ${(snapshots || []).length}

## 数据概览
| 指标 | 数值 |
|------|------|
| 累计观看人次 | ${totalWatcher.toLocaleString()} |
| 峰值在线人数 | ${maxOnline.toLocaleString()} |
| 评论总数 | ${totalComments.toLocaleString()} |
| 成交总额 | ¥${totalOrderAmount} |
| 成交单数 | ${totalOrderCount} |
`;

  // 新老粉数据
  if (lastSnapshot?.new_fan_conversion_rate || lastSnapshot?.old_fan_conversion_rate) {
    md += `
### 新老粉转化对比
| 指标 | 新学员 | 老学员 |
|------|--------|--------|
| 转化率 | ${lastSnapshot?.new_fan_conversion_rate || '-'}% | ${lastSnapshot?.old_fan_conversion_rate || '-'}% |
| 支付人数 | ${lastSnapshot?.new_fan_pay_count || '-'} | ${lastSnapshot?.old_fan_pay_count || '-'} |
`;
  }

  // 每半小时数据趋势
  if ((snapshots || []).length > 0) {
    md += `
## 数据趋势
| 时段 | 观看人次 | 在线人数 | 评论数 | 成交额 |
|------|----------|----------|--------|--------|
`;
    for (const snap of (snapshots || []) as Record<string, unknown>[]) {
      const time = snap.snapshot_time ? new Date(snap.snapshot_time as string).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '-';
      md += `| ${time} | ${snap.watcher_cnt || '-'} | ${snap.online_user_cnt || '-'} | ${snap.comment_cnt || '-'} | ¥${snap.order_total || '0'} |\n`;
    }
  }

  // 每半小时分析
  const segmentReports = (reports || []).filter((r: Record<string, unknown>) => r.report_type === 'segment');
  for (const report of segmentReports as Record<string, unknown>[]) {
    md += `
## [片段 ${report.segment_seq}] 分析报告

${report.analysis_text || '暂无分析内容'}
`;
  }

  // 终场分析
  const finalReport = (reports || []).find((r: Record<string, unknown>) => r.report_type === 'final');
  if (finalReport) {
    md += `
## 终场综合分析

${(finalReport as Record<string, unknown>).analysis_text || '暂无分析内容'}
`;
  }

  // Skill 迭代记录
  md += `
## Skill 迭代记录
- 本场使用: ${(reports?.[0] as Record<string, unknown>)?.skill_version || 'v1'}
`;

  return md;
}
