/**
 * 数据库客户端 - 使用 coze-coding-dev-sdk 的 getPool 获取连接
 * 
 * 所有数据存储到 PostgreSQL 数据库，不再使用本地 storage.json
 * 提供 Supabase 兼容 API: db.from('table').select().eq().order()
 */
import { getPool, getDbUrl } from 'coze-coding-dev-sdk';
import pg from 'pg';
import type { Pool, QueryResult, QueryResultRow } from 'pg';

let _pool: Pool | null = null;
let _poolInit: Promise<Pool> | null = null;

/**
 * 获取 pg Pool 实例（懒初始化）
 */
export async function getDbPool(): Promise<Pool> {
  if (_pool) return _pool;
  if (_poolInit) return _poolInit;

  _poolInit = (async () => {
    try {
      // 直接用 dbUrl 创建 pg.Pool，避免 SDK getPool() 的 prepared statement 缓存问题
      const dbUrl = await getDbUrl();
      const pool = new pg.Pool({ connectionString: dbUrl, ssl: false });
      _pool = pool as Pool;
      console.log('[DB] Pool initialized from dbUrl');
    } catch (e) {
      console.error('[DB] Failed to get pool from dbUrl:', e);
      try {
        const pool = await Promise.resolve(getPool());
        _pool = pool as Pool;
        console.log('[DB] Pool initialized from coze-coding-dev-sdk fallback');
      } catch (e2) {
        console.error('[DB] Failed to get pool from SDK:', e2);
        throw e2;
      }
    }
    _poolInit = null;
    return _pool!;
  })();

  return _poolInit;
}

/**
 * 执行 SQL 查询
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const pool = await getDbPool();
  return pool.query<T>(text, params);
}

/**
 * 测试数据库连接
 */
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT 1 as ok');
    return result.rows[0]?.ok === 1;
  } catch (e) {
    console.error('[DB] Connection test failed:', e);
    return false;
  }
}

// 表名映射：camelCase -> snake_case
const TABLE_NAME_MAP: Record<string, string> = {
  liveSessions: 'live_sessions',
  snapshotData: 'snapshot_data',
  analysisReports: 'analysis_reports',
  liveMetricsMinute: 'live_metrics_minute',
  liveAlerts: 'live_alerts',
  analysisKnowledge: 'analysis_knowledge',
  liveScripts: 'live_scripts',
  anchorProfiles: 'anchor_profiles',
  systemConfig: 'system_config',
};

// 列名映射工具
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

/**
 * PostgreSQL numeric/decimal 类型通过 pg 库返回字符串，
 * 但前端期望数字。此函数自动将纯数字字符串转为 number。
 * 只转换看起来是数字的字符串（含小数点、负号），跳过日期/时间/ID 等字段。
 */
const NUMERIC_STRING_FIELDS = new Set([
  'overall_score', 'anchor_score', 'interaction_score', 'conversion_score',
  'sentiment_score', 'rhythm_score', 'confidence', 'amount', 'paid_amount',
  'order_amount', 'success_rate', 'avg_conversion_rate', 'avg_comment_rate',
  'avg_online', 'avg_viewers', 'avg_sales', 'latitude', 'longitude',
]);

function convertRowToCamel(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    let converted = value;
    // 自动将 numeric 字符串转为数字
    if (typeof value === 'string' && NUMERIC_STRING_FIELDS.has(key)) {
      const num = Number(value);
      if (!isNaN(num)) converted = num;
    }
    result[toCamelCase(key)] = converted;
  }
  return result;
}

function convertRowToSnake(row: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    result[toSnakeCase(key)] = value;
  }
  return result;
}

// 查询结果类型 - 使用 any 兼容旧代码的属性访问模式
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DbResult {
  data: any;
  error: Error | null;
  count?: number | null;
}

/**
 * 数据库查询构建器 - 完全兼容 Supabase 风格 API
 * 
 * 通过实现 Thenable 接口支持 await，但不继承 Promise
 * 这样 TypeScript 能正确推断链式方法的返回类型
 */
class DbQueryBuilder {
  private _tableName: string;
  private _dbTableName: string;
  private _selectFields: string = '*';
  private _headMode: boolean = false;
  private _whereClauses: string[] = [];
  private _whereParams: unknown[] = [];
  private _orderClause: string = '';
  private _limitClause: string = '';
  private _offsetClause: string = '';
  private _singleMode: 'none' | 'single' | 'maybeSingle' = 'none';
  private _operation: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  private _insertRows: Record<string, unknown> | Record<string, unknown>[] | null = null;
  private _upsertRow: Record<string, unknown> | null = null;
  private _upsertOptions: { onConflict?: string } | undefined;
  private _updateData: Record<string, unknown> | null = null;
  private _orClauses: string[] = [];
  private _promise: Promise<DbResult> | null = null;

  constructor(tableName: string) {
    this._tableName = tableName;
    this._dbTableName = TABLE_NAME_MAP[tableName] || tableName;
  }

  // --- Chainable query methods ---

  select(fields: string = '*', opts?: { count?: string; head?: boolean }): this {
    this._selectFields = fields;
    this._operation = 'select';
    if (opts?.head) this._selectFields = '1'; // head=true means no data needed
    return this;
  }

  eq(column: string, value: unknown): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    this._whereClauses.push(`${snakeCol} = $${paramIdx}`);
    this._whereParams.push(value);
    return this;
  }

  neq(column: string, value: unknown): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    this._whereClauses.push(`${snakeCol} != $${paramIdx}`);
    this._whereParams.push(value);
    return this;
  }

  gt(column: string, value: unknown): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    this._whereClauses.push(`${snakeCol} > $${paramIdx}`);
    this._whereParams.push(value);
    return this;
  }

  gte(column: string, value: unknown): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    this._whereClauses.push(`${snakeCol} >= $${paramIdx}`);
    this._whereParams.push(value);
    return this;
  }

  lt(column: string, value: unknown): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    this._whereClauses.push(`${snakeCol} < $${paramIdx}`);
    this._whereParams.push(value);
    return this;
  }

  lte(column: string, value: unknown): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    this._whereClauses.push(`${snakeCol} <= $${paramIdx}`);
    this._whereParams.push(value);
    return this;
  }

  in(column: string, values: unknown[]): this {
    const snakeCol = toSnakeCase(column);
    const placeholders = values.map((_, i) => `$${this._whereParams.length + i + 1}`);
    this._whereClauses.push(`${snakeCol} IN (${placeholders.join(', ')})`);
    this._whereParams.push(...values);
    return this;
  }

  like(column: string, pattern: string): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    this._whereClauses.push(`${snakeCol} LIKE $${paramIdx}`);
    this._whereParams.push(pattern);
    return this;
  }

  ilike(column: string, pattern: string): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    this._whereClauses.push(`${snakeCol} ILIKE $${paramIdx}`);
    this._whereParams.push(pattern);
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    const snakeCol = toSnakeCase(column);
    const paramIdx = this._whereParams.length + 1;
    const op = operator === 'eq' ? '!=' : operator === 'like' ? 'NOT LIKE' : operator === 'ilike' ? 'NOT ILIKE' : '!=';
    this._whereClauses.push(`${snakeCol} ${op} $${paramIdx}`);
    this._whereParams.push(value);
    return this;
  }

  is(column: string, value: unknown): this {
    const snakeCol = toSnakeCase(column);
    if (value === null) {
      this._whereClauses.push(`${snakeCol} IS NULL`);
    } else {
      const paramIdx = this._whereParams.length + 1;
      this._whereClauses.push(`${snakeCol} IS NOT NULL AND ${snakeCol} = $${paramIdx}`);
      this._whereParams.push(value);
    }
    return this;
  }

  or(conditions: string): this {
    const parts = conditions.split(',').map(c => {
      const [col, op, val] = c.split('.');
      const snakeCol = toSnakeCase(col);
      const paramIdx = this._whereParams.length + 1;
      this._whereParams.push(val);
      if (op === 'eq') return `${snakeCol} = $${paramIdx}`;
      if (op === 'neq') return `${snakeCol} != $${paramIdx}`;
      if (op === 'like') return `${snakeCol} LIKE $${paramIdx}`;
      if (op === 'ilike') return `${snakeCol} ILIKE $${paramIdx}`;
      if (op === 'gt') return `${snakeCol} > $${paramIdx}`;
      if (op === 'lt') return `${snakeCol} < $${paramIdx}`;
      return `${snakeCol} = $${paramIdx}`;
    });
    this._orClauses.push(`(${parts.join(' OR ')})`);
    return this;
  }

  /**
   * 排序 - 兼容 Supabase 两种参数格式:
   *   .order('column', { ascending: true })  - Supabase SDK 格式
   *   .order('column', 'asc')                - 简化格式
   */
  order(column: string, direction?: 'asc' | 'desc' | { ascending?: boolean; nullsFirst?: boolean }): this {
    const snakeCol = toSnakeCase(column);
    let dir = 'ASC';
    if (typeof direction === 'string') {
      dir = direction.toUpperCase();
    } else if (direction && typeof direction === 'object') {
      dir = direction.ascending === false ? 'DESC' : 'ASC';
    }
    this._orderClause = `ORDER BY ${snakeCol} ${dir}`;
    return this;
  }

  limit(count: number): this {
    this._limitClause = `LIMIT ${Number(count)}`;
    return this;
  }

  range(from: number, to: number): this {
    const limit = to - from + 1;
    this._limitClause = `LIMIT ${limit} OFFSET ${from}`;
    return this;
  }

  single(): this {
    this._singleMode = 'single';
    return this;
  }

  maybeSingle(): this {
    this._singleMode = 'maybeSingle';
    return this;
  }

  // --- 写入操作 ---

  insert(rows: Record<string, unknown> | Record<string, unknown>[]): this {
    this._operation = 'insert';
    this._insertRows = rows;
    this._promise = this._execute();
    return this;
  }

  upsert(row: Record<string, unknown>, options?: { onConflict?: string }): this {
    this._operation = 'upsert';
    this._upsertRow = row;
    this._upsertOptions = options;
    this._promise = this._execute();
    return this;
  }

  update(data: Record<string, unknown>): this {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  delete(): this {
    this._operation = 'delete';
    return this;
  }

  // --- Thenable interface (支持 await) ---

  then<TResult1 = DbResult, TResult2 = never>(
    onfulfilled?: ((value: DbResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    if (!this._promise) {
      this._promise = this._execute();
    }
    return this._promise.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<DbResult | TResult> {
    return this.then(undefined, onrejected);
  }

  // --- Core execution ---

  private async _execute(): Promise<DbResult> {
    try {
      switch (this._operation) {
        case 'select': return await this._executeSelect();
        case 'insert': return await this._executeInsert();
        case 'upsert': return await this._executeUpsert();
        case 'update': return await this._executeUpdate();
        case 'delete': return await this._executeDelete();
        default: return { data: null, error: new Error(`Unknown operation: ${this._operation}`) };
      }
    } catch (e) {
      console.error(`[DB] ${this._operation} error on ${this._dbTableName}:`, e);
      return { data: null, error: e as Error };
    }
  }

  private _buildWhereClause(): string {
    const clauses = [...this._whereClauses, ...this._orClauses];
    return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  }

  private async _executeSelect(): Promise<DbResult> {
    let sql = `SELECT ${this._selectFields} FROM ${this._dbTableName}`;
    const whereClause = this._buildWhereClause();
    if (whereClause) sql += ` ${whereClause}`;
    if (this._orderClause) sql += ` ${this._orderClause}`;

    if (this._singleMode === 'single' || this._singleMode === 'maybeSingle') {
      sql += ' LIMIT 1';
    } else if (this._limitClause) {
      sql += ` ${this._limitClause}`;
    }
    if (this._offsetClause) sql += ` ${this._offsetClause}`;

    const result = await query(sql, this._whereParams);
    let data = result.rows.map(convertRowToCamel);

    if (this._singleMode === 'single') {
      if (data.length === 0) {
        const err = new Error('No rows found') as Error & { code: string };
        err.code = 'PGRST116';
        return { data: null, error: err };
      }
      return { data: data[0] as unknown as Record<string, unknown>[], error: null };
    }

    if (this._singleMode === 'maybeSingle') {
      return { data: (data[0] || null) as unknown as Record<string, unknown>[], error: null };
    }

    return { data, error: null, count: result.rowCount };
  }

  private async _executeInsert(): Promise<DbResult> {
    if (!this._insertRows) return { data: null, error: new Error('No data to insert') };

    const rowList = Array.isArray(this._insertRows) ? this._insertRows : [this._insertRows];
    const results: Record<string, unknown>[] = [];

    for (const row of rowList) {
      const snakeRow = convertRowToSnake(row);
      const columns = Object.keys(snakeRow);
      // 对 object/array 值序列化为 JSON 字符串，并在 placeholder 中加 ::jsonb 类型转换
      const processedValues: unknown[] = [];
      const placeholders = columns.map((col, _i) => {
        const val = snakeRow[col];
        if (val !== null && val !== undefined && (typeof val === 'object' || Array.isArray(val))) {
          processedValues.push(JSON.stringify(val));
          return `$${processedValues.length}::jsonb`;
        }
        processedValues.push(val);
        return `$${processedValues.length}`;
      });

      const sql = `INSERT INTO ${this._dbTableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
      const result = await query(sql, processedValues);
      if (result.rows.length > 0) {
        results.push(convertRowToCamel(result.rows[0]));
      }
    }

    return { data: results, error: null };
  }

  private async _executeUpsert(): Promise<DbResult> {
    if (!this._upsertRow) return { data: null, error: new Error('No data to upsert') };

    const snakeRow = convertRowToSnake(this._upsertRow);
    const columns = Object.keys(snakeRow);
    // 对 object/array 值序列化为 JSON 字符串，并加 ::jsonb 类型转换
    const values: unknown[] = [];
    const placeholders = columns.map((col, _i) => {
      const val = snakeRow[col];
      if (val !== null && val !== undefined && (typeof val === 'object' || Array.isArray(val))) {
        values.push(JSON.stringify(val));
        return `$${values.length}::jsonb`;
      }
      values.push(val);
      return `$${values.length}`;
    });

    // Default to 'id' as conflict column since all tables have id as PK
    // Support comma-separated onConflict like 'category,dimension,key'
    const conflictCols = this._upsertOptions?.onConflict
      ? this._upsertOptions.onConflict.split(',').map(s => toSnakeCase(s.trim()))
      : ['id'];
    const conflictColStr = conflictCols.join(', ');
    
    const updateCols = columns.filter(c => !conflictCols.includes(c));

    let sql = `INSERT INTO ${this._dbTableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')})`;
    if (updateCols.length > 0) {
      const updateSet: string[] = [];
      const updateValues: unknown[] = [];
      for (const c of updateCols) {
        const val = snakeRow[c];
        if (val !== null && val !== undefined && (typeof val === 'object' || Array.isArray(val))) {
          updateValues.push(JSON.stringify(val));
          updateSet.push(`${c} = $${values.length + updateValues.length}::jsonb`);
        } else {
          updateValues.push(val);
          updateSet.push(`${c} = $${values.length + updateValues.length}`);
        }
      }
      sql += ` ON CONFLICT (${conflictColStr}) DO UPDATE SET ${updateSet.join(', ')} RETURNING *`;
      const result = await query(sql, [...values, ...updateValues]);
      const data = result.rows.map(convertRowToCamel);
      return { data, error: null };
    } else {
      sql += ` ON CONFLICT (${conflictColStr}) DO NOTHING RETURNING *`;
      const result = await query(sql, values);
      const data = result.rows.map(convertRowToCamel);
      return { data, error: null };
    }
  }

  private async _executeUpdate(): Promise<DbResult> {
    if (!this._updateData) return { data: null, error: new Error('No data to update') };

    const snakeUpdates = convertRowToSnake(this._updateData);
    const setValues: unknown[] = [];
    const setClauses = Object.keys(snakeUpdates).map((col, _i) => {
      const val = snakeUpdates[col];
      if (val !== null && val !== undefined && (typeof val === 'object' || Array.isArray(val))) {
        setValues.push(JSON.stringify(val));
        return `${col} = $${this._whereParams.length + setValues.length}::jsonb`;
      }
      setValues.push(val);
      return `${col} = $${this._whereParams.length + setValues.length}`;
    });

    let sql = `UPDATE ${this._dbTableName} SET ${setClauses.join(', ')}`;
    const whereClause = this._buildWhereClause();
    if (whereClause) sql += ` ${whereClause}`;
    sql += ' RETURNING *';

    const result = await query(sql, [...this._whereParams, ...setValues]);
    const data = result.rows.map(convertRowToCamel);
    return { data, error: null };
  }

  private async _executeDelete(): Promise<DbResult> {
    let sql = `DELETE FROM ${this._dbTableName}`;
    const whereClause = this._buildWhereClause();
    if (whereClause) sql += ` ${whereClause}`;
    sql += ' RETURNING *';

    const result = await query(sql, this._whereParams);
    const data = result.rows.map(convertRowToCamel);
    return { data, error: null };
  }
}

/**
 * 数据库操作入口
 */
class DatabaseClient {
  from(tableName: string): DbQueryBuilder {
    // camelCase -> snake_case (e.g., liveSessions -> live_sessions)
    const snakeName = tableName.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    return new DbQueryBuilder(snakeName);
  }

  async query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<T>> {
    return query<T>(text, params);
  }
}

// 单例
let _db: DatabaseClient | null = null;

/**
 * 获取数据库客户端实例
 */
export function getStorage(): DatabaseClient {
  if (!_db) {
    _db = new DatabaseClient();
  }
  return _db;
}

/**
 * 兼容旧代码的 getSupabaseClient
 */
export function getSupabaseClient(): DatabaseClient {
  return getStorage();
}

/**
 * 兼容旧代码的 getLocalStorage
 */
export function getLocalStorage(): DatabaseClient {
  return getStorage();
}

/**
 * 初始化数据库（应用启动时调用）
 */
export async function initDatabase(): Promise<void> {
  console.log('[DB] Initializing database connection...');
  const ok = await testConnection();
  if (ok) {
    console.log('[DB] Database connection OK');
  } else {
    console.error('[DB] Database connection FAILED');
  }
}

/**
 * 初始化时从 storage.json 迁移数据到数据库
 */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const fs = await import('fs');
    const path = await import('path');
    const storagePath = path.join(process.env.COZE_WORKSPACE_PATH || '/workspace/projects', 'data', 'storage.json');
    
    if (!fs.existsSync(storagePath)) {
      console.log('[DB] No storage.json found, skipping migration');
      return;
    }

    const data = JSON.parse(fs.readFileSync(storagePath, 'utf-8'));
    const db = getStorage();
    
    // 检查是否已有数据（避免重复迁移）
    const { data: existingSessions } = await db.from('liveSessions').select('id').limit(1);
    if (existingSessions && existingSessions.length > 0) {
      console.log('[DB] Database already has data, skipping migration');
      return;
    }

    console.log('[DB] Migrating data from storage.json to database...');

    // 迁移各表数据（按依赖顺序）
    const migrationOrder = [
      'systemConfig',
      'liveSessions', 
      'snapshotData',
      'analysisReports',
      'liveTimelineEvents',
      'liveMetricsMinute',
      'liveAlerts',
      'analysisKnowledge',
      'liveScripts',
      'anchorProfiles',
    ];

    for (const jsonKey of migrationOrder) {
      const rows = data[jsonKey];
      if (!Array.isArray(rows) || rows.length === 0) continue;

      let migrated = 0;
      let errors = 0;
      for (const row of rows) {
        try {
          const { error } = await db.from(jsonKey).upsert(row, { onConflict: 'id' });
          if (error) {
            errors++;
            if (errors <= 3) console.error(`[DB] Migration error on ${jsonKey}:`, error.message);
          } else {
            migrated++;
          }
        } catch (e) {
          errors++;
          if (errors <= 3) console.error(`[DB] Migration exception on ${jsonKey}:`, e);
        }
      }
      console.log(`[DB] Migrated ${migrated}/${rows.length} rows from ${jsonKey}${errors > 0 ? ` (${errors} errors)` : ''}`);
    }

    // 重命名storage.json为备份
    try {
      fs.renameSync(storagePath, storagePath + '.bak');
      console.log('[DB] storage.json renamed to storage.json.bak');
    } catch {
      // 忽略重命名失败
    }

    console.log('[DB] Migration complete!');
  } catch (e) {
    console.error('[DB] Migration failed:', e);
  }
}
