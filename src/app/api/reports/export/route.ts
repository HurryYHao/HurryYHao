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
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get('sessionId');
    const all = url.searchParams.get('all') === 'true';
    const sessionIdsStr = url.searchParams.get('sessionIds');

    const supabase = getSupabaseClient();

    // 构建查询条件
    // DbQueryBuilder 不支持 join，需拆成两次查询
    // 1. 查询报告
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
    const sessionIds = [...new Set(reports.map((r: any) => r.session_id))];
    const { data: sessions, error: sessionError } = await supabase
      .from('live_sessions')
      .select('id, room_name, anchor_name, start_time, end_time')
      .in('id', sessionIds);
    if (sessionError) throw sessionError;

    const sessionMap_data = new Map<number, any>();
    for (const s of sessions || []) {
      sessionMap_data.set(s.id, s);
    }

    // 按 session 分组
    const sessionMap = new Map<number, any[]>();
    for (const r of reports) {
      const sid = r.session_id;
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
      const firstReport = sessionReports[0] as any;
      const session = sessionMap_data.get(sid) || {};
      const roomName = session.room_name || '未知直播';
      const anchorName = session.anchor_name || '未知主播';
      const startTime = session.start_time || '';

      // 场次标题
      children.push(new Paragraph({
        children: [new TextRun({ text: `${roomName}`, bold: true, size: 36, color: '1A5276' })],
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
      const sorted = [...sessionReports].sort((a: any, b: any) => {
        if (a.report_type === 'final' && b.report_type !== 'final') return -1;
        if (a.report_type !== 'final' && b.report_type === 'final') return 1;
        return (a.segment_seq || 0) - (b.segment_seq || 0);
      });

      for (const report of sorted) {
        const isFinal = report.report_type === 'final';
        const reportTitle = isFinal ? '整场综合分析' : `片段${report.segment_seq}分析`;

        children.push(new Paragraph({
          children: [new TextRun({ text: reportTitle, bold: true, size: 28, color: '2E86C1' })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        }));

        // 五维分析
        const dimensions = [
          { key: 'anchor_analysis', name: '主播话术分析' },
          { key: 'interaction_analysis', name: '互动热度分析' },
          { key: 'conversion_analysis', name: '商品转化分析' },
          { key: 'sentiment_analysis', name: '评论舆情分析' },
          { key: 'rhythm_analysis', name: '直播节奏分析' },
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
        if (report.action_items) {
          children.push(new Paragraph({
            children: [new TextRun({ text: '行动建议', bold: true, size: 24, color: '1A5276' })],
            heading: HeadingLevel.HEADING_3,
            spacing: { before: 200, after: 100 },
          }));
          const aiText = typeof report.action_items === 'string' ? report.action_items : JSON.stringify(report.action_items, null, 2);
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
          children: [new TextRun({ text: `分析时间: ${report.created_at}`, size: 18, color: '999999' })],
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
  } catch (err) {
    console.error('[ReportsExport] 导出失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
