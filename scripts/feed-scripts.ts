/**
 * 解析Excel录播大纲并投喂到知识库
 * 用法: node scripts/feed-scripts.ts <xlsx路径>
 */
import XLSX from 'xlsx';
import fs from 'fs';

interface ScriptRow {
  seq: number;
  date: string;
  keywords: string;
  contentPoints: string;
  productList: string;
  transactionData: string;
  replayTransaction: string;
}

function parseExcel(filePath: string): ScriptRow[] {
  const wb = XLSX.readFile(filePath);
  const allScripts: ScriptRow[] = [];

  const sheetsToParse = ['2026年', '2025年', '舒叶'];

  for (const sheetName of sheetsToParse) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;

    const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as string[][];
    console.log(`解析Sheet: ${sheetName}, 行数: ${data.length}`);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[1]) continue; // 跳过空行

      const script: ScriptRow = {
        seq: Number(row[0]) || i,
        date: String(row[1] || '').trim(),
        keywords: String(row[2] || '').trim(),
        contentPoints: String(row[3] || '').trim(),
        productList: String(row[4] || '').trim(),
        transactionData: String(row[5] || '').trim(),
        replayTransaction: String(row[6] || '').trim(),
      };

      if (script.date && (script.keywords || script.contentPoints)) {
        allScripts.push(script);
      }
    }
  }

  // Also parse "不重复" sheet (different structure: has "来源" column)
  const wsUnique = wb.Sheets['不重复'];
  if (wsUnique) {
    const data = XLSX.utils.sheet_to_json(wsUnique, { header: 1 }) as string[][];
    console.log(`解析Sheet: 不重复, 行数: ${data.length}`);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || !row[1]) continue;

      const script: ScriptRow = {
        seq: Number(row[0]) || i,
        date: String(row[1] || '').trim(),
        keywords: String(row[2] || '').trim(),
        contentPoints: String(row[3] || '').trim(),
        productList: String(row[4] || '').trim(),
        transactionData: String(row[5] || '').trim(),
        replayTransaction: String(row[6] || '').trim(),
      };

      if (script.date && (script.keywords || script.contentPoints)) {
        allScripts.push(script);
      }
    }
  }

  return allScripts;
}

async function feedScripts(scripts: ScriptRow[]): Promise<void> {
  const baseUrl = process.env.COZE_PROJECT_DOMAIN_DEFAULT
    ? `https://${process.env.COZE_PROJECT_DOMAIN_DEFAULT}`
    : 'http://localhost:5000';

  // Batch feed in chunks of 10
  const chunkSize = 10;
  let totalInserted = 0;

  for (let i = 0; i < scripts.length; i += chunkSize) {
    const chunk = scripts.slice(i, i + chunkSize);
    try {
      const response = await fetch(`${baseUrl}/api/knowledge/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scripts: chunk, source: 'excel_batch' }),
      });

      const result = await response.json();
      if (result.success) {
        totalInserted += result.data.scriptsInserted;
        console.log(`批次 ${Math.floor(i / chunkSize) + 1}: 投喂${result.data.scriptsInserted}个脚本, ${result.data.knowledgeInserted}条知识`);
      } else {
        console.error(`批次 ${Math.floor(i / chunkSize) + 1} 失败:`, result.error);
      }
    } catch (err) {
      console.error(`批次 ${Math.floor(i / chunkSize) + 1} 请求失败:`, err);
    }
  }

  console.log(`\n投喂完成! 总计: ${totalInserted}/${scripts.length}个脚本`);
}

// Main
const xlsxPath = process.argv[2] || '/tmp/录播大纲_分表.xlsx';
console.log(`开始解析: ${xlsxPath}`);

const scripts = parseExcel(xlsxPath);
console.log(`共解析${scripts.length}个脚本`);

if (scripts.length > 0) {
  // Output JSON for preview
  const outputPath = '/tmp/parsed_scripts.json';
  fs.writeFileSync(outputPath, JSON.stringify(scripts, null, 2), 'utf-8');
  console.log(`解析结果已保存: ${outputPath}`);

  feedScripts(scripts).catch(console.error);
}
