// 数据迁移脚本：将 storage.json 的数据迁移到 Supabase 数据库
// 使用方法: npx tsx scripts/migrate-to-supabase.ts

import { getLocalStorage } from '../src/storage/database/local-storage';

// camelCase -> snake_case
function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toSnakeCase(obj: any): any {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toSnakeCase);
  if (typeof obj !== 'object') return obj;
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    result[camelToSnake(key)] = toSnakeCase(value);
  }
  return result;
}

async function migrateTable(
  storage: ReturnType<typeof getLocalStorage>,
  tableName: string,
  data: any[]
) {
  if (!data || data.length === 0) {
    console.log(`  [跳过] ${tableName}: 无数据`);
    return 0;
  }

  // 字段重命名映射（storage.json -> 数据库列名）
  const fieldRenames: Record<string, Record<string, string>> = {
    skillVersions: { content: 'template', change_log: 'changes' },
  };

  console.log(`  [迁移] ${tableName}: ${data.length} 条数据`);
  let success = 0;

  // 逐条插入，避免批量错误
  for (let i = 0; i < data.length; i++) {
    let snakeData = toSnakeCase(data[i]);
    
    // 应用字段重命名
    const renames = fieldRenames[tableName];
    if (renames) {
      for (const [oldKey, newKey] of Object.entries(renames)) {
        if (oldKey in snakeData) {
          snakeData[newKey] = snakeData[oldKey];
          delete snakeData[oldKey];
        }
      }
    }

    try {
      const result = await storage.from(tableName).upsert(snakeData as Record<string, unknown>);
      if (result.error) {
        // 尝试insert
        const insertResult = await storage.from(tableName).insert(snakeData as Record<string, unknown>);
        if (insertResult.error) {
          console.error(`  [失败] ${tableName} #${i}:`, insertResult.error.message?.substring(0, 100));
        } else {
          success++;
        }
      } else {
        success++;
      }
    } catch (err: any) {
      console.error(`  [异常] ${tableName} #${i}:`, err.message?.substring(0, 100));
    }
  }

  console.log(`  [完成] ${tableName}: 成功 ${success}/${data.length}`);
  return success;
}

async function main() {
  console.log('=== 开始数据迁移 (storage.json -> Supabase) ===\n');

  const fs = await import('fs');
  const path = await import('path');
  const storagePath = path.join(process.cwd(), 'data', 'storage.json');

  if (!fs.existsSync(storagePath)) {
    console.error('storage.json 不存在');
    process.exit(1);
  }

  const rawData = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
  const storage = getLocalStorage();

  // 按依赖顺序迁移
  const migrationOrder = [
    ['systemConfig', rawData.systemConfig],
    ['liveSessions', rawData.liveSessions],
    ['anchorProfiles', rawData.anchorProfiles],
    ['snapshotData', rawData.snapshotData],
    ['analysisReports', rawData.analysisReports],
    ['liveTimelineEvents', rawData.liveTimelineEvents],
    ['liveMetricsMinute', rawData.liveMetricsMinute],
    ['liveAlerts', rawData.liveAlerts],
    ['analysisKnowledge', rawData.analysisKnowledge],
    ['liveScripts', rawData.liveScripts],
    ['skillVersions', rawData.skillVersions],
  ];

  let totalSuccess = 0;
  let totalRecords = 0;

  for (const [tableName, data] of migrationOrder) {
    const count = await migrateTable(storage, tableName as string, data as any[]);
    totalSuccess += count;
    totalRecords += (data as any[])?.length || 0;
  }

  console.log(`\n=== 迁移完成: 成功 ${totalSuccess}/${totalRecords} ===`);
}

main().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
