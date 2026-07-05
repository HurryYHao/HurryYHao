import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, AlignmentType,
  BorderStyle, ShadingType, convertInchesToTwip,
} from 'docx';

/**
 * GET /api/reports/export?sessionId=58  (单场导出)
 * GET /api/reports/export?all=true       (批量导出全部)
 * GET /api/reports/export?sessionIds=1,2,3 (批量指定)
 *
 * POST /api/reports/export  (前端批量导出)
 * Body: { reportIds: number[], format: 'docx' }
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const all = url.searchParams.get('all') === 'true';
    const sessionIdsStr = url.searchParams.get('sessionIds');

    const supabase = getSupabaseClient();

    // 构建查询条件
    // DbQueryBuilder 会将结果自动转为 camelCase
    let reportQuery = supabase
      .from('analysis_reports')
      .select('id, session_id, report_type, segment_seq, anchor_analysis, interaction_analysis, conversion_analysis, sentiment_analysis, rhythm_analysis, action_items, alerts, analysis_text, analysis_json, created_at')
      .order('created_at', { ascending: false });

    if (sessionId) {
      reportQuery = reportQuery.eq('session_id', Number(sessionId));
    } else if (sessionIdsStr) {
      const ids = sessionIdsStr.split(',').map(Number);
      reportQuery = reportQuery.in('session_id', ids);
    } else if (!all) {
      return Response.json({ error: '请指定导出条件: sessionId / sessionIds / all' }, { status: 400 });
    }

    const { data: reports, error: reportError } = await reportQuery;
    if (reportError) throw reportError;

    if (!reports || reports.length === 0) {
      return Response.json({ error: '没有可导出的报告' }, { status: 404 });
    }

    // 2. 查询关联的 session 信息
    // DbQueryBuilder 返回 camelCase: sessionId, roomName, anchorName, startTime, endTime
    const sids = [...new Set(reports.map((r: Record<string, unknown>) => Number(r.sessionId)))];
    const { data: sessions, error: sessionError } = await supabase
      .from('live_sessions')
      .select('id, room_name, anchor_name, start_time, end_time')
      .in('id', sids);
    if (sessionError) throw sessionError;

    const sessionMapData = new Map<number, Record<string, unknown>>();
    for (const s of sessions || []) {
      sessionMapData.set(Number(s.id), s);
    }

    return await buildDocxResponse(reports, sessionMapData);
  } catch (err) {
    console.error('[ReportsExport] GET 导出失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/reports/export  - 前端批量导出
 * Body: { reportIds: number[], format: 'docx' }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { reportIds, format } = body;

    if (!reportIds || !Array.isArray(reportIds) || reportIds.length === 0) {
      return Response.json({ error: '请提供 reportIds 数组' }, { status: 400 });
    }

    if (format && format !== 'docx') {
      return Response.json({ error: '仅支持 docx 格式' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 查询指定ID的报告
    const { data: reports, error: reportError } = await supabase
      .from('analysis_reports')
      .select('id, session_id, report_type, segment_seq, anchor_analysis, interaction_analysis, conversion_analysis, sentiment_analysis, rhythm_analysis, action_items, alerts, analysis_text, analysis_json, created_at')
      .in('id', reportIds);

    if (reportError) throw reportError;
    if (!reports || reports.length === 0) {
      return Response.json({ error: '没有可导出的报告' }, { status: 404 });
    }

    // 查询关联的 session 信息
    const sids = [...new Set(reports.map((r: Record<string, unknown>) => Number(r.sessionId)))];
    const { data: sessions, error: sessionError } = await supabase
      .from('live_sessions')
      .select('id, room_name, anchor_name, start_time, end_time')
      .in('id', sids);
    if (sessionError) throw sessionError;

    const sessionMapData = new Map<number, Record<string, unknown>>();
    for (const s of sessions || []) {
      sessionMapData.set(Number(s.id), s);
    }

    return await buildDocxResponse(reports, sessionMapData);
  } catch (err) {
    console.error('[ReportsExport] POST 导出失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * 构建 DOCX 响应 - 共用逻辑
 * reports 和 sessionMapData 中的 key 均为 DbQueryBuilder 返回的 camelCase 格式
 */
async function buildDocxResponse(
  reports: Record<string, unknown>[],
  sessionMapData: Map<number, Record<string, unknown>>
) {
  // 按 session 分组（使用 camelCase sessionId）
  const sessionMap = new Map<number, Record<string, unknown>[]>();
  for (const r of reports) {
    const sid = Number(r.sessionId);
    if (!sessionMap.has(sid)) sessionMap.set(sid, []);
    sessionMap.get(sid)!.push(r);
  }

  // 构建 DOCX
  const children: Paragraph[] = [];

  // 封面
  children.push(new Paragraph({ text: '', spacing: { after: 2000 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'AI 直播数据分析报告', bold: true, size: 56, color: '1A5276' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `导出时间: ${new Date().toLocaleString('zh-CN')}`, size: 24, color: '666666' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `共 ${sessionMap.size} 场直播 / ${reports.length} 份报告`, size: 24, color: '666666' })],
    alignment: AlignmentType.CENTER,
    spacing: { after: 1000 },
  }));

  // 每场直播的报告
  for (const [sid, sessionReports] of sessionMap) {
    const session = sessionMapData.get(sid) || {};
    const roomName = String(session.roomName || '未知直播');
    const anchorName = String(session.anchorName || '未知主播');
    const startTime = String(session.startTime || '');

    // 场次标题
    children.push(new Paragraph({
      children: [new TextRun({ text: roomName, bold: true, size: 36, color: '1A5276' })],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 400, after: 200 },
    }));
    children.push(new Paragraph({
      children: [
        new TextRun({ text: `主播: ${anchorName}`, size: 22 }),
        new TextRun({ text: `    开播时间: ${startTime}`, size: 22 }),
      ],
      spacing: { after: 200 },
    }));

    // 按类型排序: final在前, segment按seq排序
    const sorted = [...sessionReports].sort((a, b) => {
      if (a.reportType === 'final' && b.reportType !== 'final') return -1;
      if (a.reportType !== 'final' && b.reportType === 'final') return 1;
      return (Number(a.segmentSeq) || 0) - (Number(b.segmentSeq) || 0);
    });

    for (const report of sorted) {
      const isFinal = report.reportType === 'final';
      const segSeq = report.segmentSeq;
      const reportTitle = isFinal ? '整场综合分析' : `片段${segSeq}分析`;

      children.push(new Paragraph({
        children: [new TextRun({ text: reportTitle, bold: true, size: 28, color: '2E86C1' })],
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 300, after: 150 },
      }));

      // 五维分析（camelCase 键名）
      const dimensions = [
        { key: 'anchorAnalysis', name: '主播话术分析' },
        { key: 'interactionAnalysis', name: '互动热度分析' },
        { key: 'conversionAnalysis', name: '商品转化分析' },
        { key: 'sentimentAnalysis', name: '评论舆情分析' },
        { key: 'rhythmAnalysis', name: '直播节奏分析' },
      ];

      for (const dim of dimensions) {
        const content = report[dim.key];
        if (!content || content === 'N/A') continue;

        children.push(new Paragraph({
          children: [new TextRun({ text: dim.name, bold: true, size: 24, color: '1A5276' })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }));

        const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // 检测是否为子标题 (以 ### 或 ** 开头)
          const isSubHeader = /^(#{1,4}\s|\*\*[^*]+\*\*)/.test(trimmed);
          children.push(new Paragraph({
            children: [new TextRun({
              text: trimmed.replace(/^#{1,4}\s/, '').replace(/\*\*/g, ''),
              bold: isSubHeader,
              size: 20,
            })],
            spacing: { after: 60 },
          }));
        }
      }

      // 行动建议
      if (report.actionItems) {
        children.push(new Paragraph({
          children: [new TextRun({ text: '行动建议', bold: true, size: 24, color: '1A5276' })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }));
        const aiText = typeof report.actionItems === 'string' ? report.actionItems : JSON.stringify(report.actionItems, null, 2);
        for (const line of aiText.split('\n')) {
          if (line.trim()) {
            children.push(new Paragraph({
              children: [new TextRun({ text: line.trim().replace(/^[-*]\s/, '• '), size: 20 })],
              spacing: { after: 60 },
            }));
          }
        }
      }

      // 预警
      if (report.alerts) {
        children.push(new Paragraph({
          children: [new TextRun({ text: '预警信息', bold: true, size: 24, color: 'C0392B' })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }));
        const alertText = typeof report.alerts === 'string' ? report.alerts : JSON.stringify(report.alerts, null, 2);
        for (const line of alertText.split('\n')) {
          if (line.trim()) {
            children.push(new Paragraph({
              children: [new TextRun({ text: line.trim(), size: 20, color: 'C0392B' })],
              spacing: { after: 60 },
            }));
          }
        }
      }

      // 时间戳
      children.push(new Paragraph({
        children: [new TextRun({ text: `分析时间: ${report.createdAt || ''}`, size: 18, color: '999999' })],
        spacing: { before: 100, after: 200 },
      }));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  const buffer = await Packer.toBuffer(doc);

  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('AI直播分析报告_' + new Date().toISOString().split('T')[0] + '.docx')}`,
    },
  });
}
