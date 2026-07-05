import { getSupabaseClient } from '@/storage/database/supabase-client';
import { NextRequest } from 'next/server';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, Table, TableRow, TableCell, WidthType,
  BorderStyle,
} from 'docx';

/**
 * GET /api/knowledge/export?format=json   (JSON格式，用于导入)
 * GET /api/knowledge/export?format=docx   (DOCX格式，用于阅读)
 * GET /api/knowledge/export?category=xxx  (按分类过滤)
 * GET /api/knowledge/export?type=knowledge|scripts|all  (类型过滤)
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'json';
    const category = url.searchParams.get('category');
    const type = url.searchParams.get('type') || 'all';

    const supabase = getSupabaseClient();

    let knowledgeData: any[] = [];
    let scriptsData: any[] = [];

    // 获取知识库数据
    if (type === 'knowledge' || type === 'all') {
      let query = supabase.from('analysis_knowledge').select('*').order('category');
      if (category) query = query.eq('category', category);
      const { data, error } = await query;
      if (error) throw error;
      knowledgeData = data || [];
    }

    // 获取话术数据
    if (type === 'scripts' || type === 'all') {
      const { data, error } = await supabase.from('live_scripts').select('*').order('session_date');
      if (error) throw error;
      scriptsData = data || [];
    }

    if (knowledgeData.length === 0 && scriptsData.length === 0) {
      return Response.json({ error: '没有可导出的知识库数据' }, { status: 404 });
    }

    // JSON格式 - 用于备份和导入
    if (format === 'json') {
      return Response.json({
        success: true,
        exportedAt: new Date().toISOString(),
        knowledge: knowledgeData,
        scripts: scriptsData,
      });
    }

    // DOCX格式 - 用于阅读
    const children: Paragraph[] = [];

    children.push(new Paragraph({
      children: [new TextRun({ text: '知识库导出', bold: true, size: 56, color: '1A5276' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }));
    children.push(new Paragraph({
      children: [new TextRun({ text: `导出时间: ${new Date().toLocaleString('zh-CN')}`, size: 24, color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 1000 },
    }));

    // 知识库条目
    if (knowledgeData.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `分析知识库 (${knowledgeData.length}条)`, bold: true, size: 32, color: '1A5276' })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 200 },
      }));

      // 按category分组
      const catMap = new Map<string, any[]>();
      for (const item of knowledgeData) {
        const cat = item.category || '未分类';
        if (!catMap.has(cat)) catMap.set(cat, []);
        catMap.get(cat)!.push(item);
      }

      for (const [cat, items] of catMap) {
        children.push(new Paragraph({
          children: [new TextRun({ text: cat, bold: true, size: 26, color: '2E86C1' })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));

        for (const item of items) {
          children.push(new Paragraph({
            children: [
              new TextRun({ text: `[${item.dimension || ''}] `, bold: true, size: 20 }),
              new TextRun({ text: `${item.key || ''}: `, size: 20 }),
              new TextRun({ text: `${item.value || ''}`, size: 20 }),
            ],
            spacing: { after: 80 },
          }));
        }
      }
    }

    // 话术模板
    if (scriptsData.length > 0) {
      children.push(new Paragraph({
        children: [new TextRun({ text: `话术模板 (${scriptsData.length}条)`, bold: true, size: 32, color: '1A5276' })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      }));

      for (const script of scriptsData) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `${script.anchorName || '未知'} - ${script.sessionDate || ''}`, bold: true, size: 24, color: '2E86C1' })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }));

        if (script.scriptContent) {
          const content = typeof script.scriptContent === 'string'
            ? script.scriptContent
            : JSON.stringify(script.scriptContent, null, 2);
          for (const line of content.split('\n')) {
            if (line.trim()) {
              children.push(new Paragraph({
                children: [new TextRun({ text: line.trim(), size: 20 })],
                spacing: { after: 60 },
              }));
            }
          }
        }
      }
    }

    const doc = new Document({ sections: [{ children }] });
    const buffer = await Packer.toBuffer(doc);

    return new Response(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent('知识库导出_' + new Date().toISOString().split('T')[0] + '.docx')}`,
      },
    });
  } catch (err) {
    console.error('[KnowledgeExport] 导出失败:', err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
