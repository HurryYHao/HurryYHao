// 本地内存存储系统 - 替代 Supabase
import fs from 'fs';
import path from 'path';

// 确定数据存储目录
const getStoragePath = (): string => {
  // 优先使用环境变量指定的目录
  if (process.env.DATA_STORAGE_PATH) {
    return process.env.DATA_STORAGE_PATH;
  }
  // 生产环境: 使用项目根目录的 data 文件夹
  // 开发环境: 同样使用项目根目录的 data 文件夹
  return path.join(process.cwd(), 'data');
};

const DATA_DIR = getStoragePath();

// 确保数据目录存在
const ensureDataDirExists = (): void => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o755 });
      console.log(`[Storage] Created data directory at: ${DATA_DIR}`);
    }
  } catch (error) {
    console.error(`[Storage] Failed to create data directory at ${DATA_DIR}:`, error);
    throw error;
  }
};

ensureDataDirExists();

// 数据类型定义
interface LiveSession {
  id: number;
  room_id: string;
  room_name?: string;
  live_space_id?: string;
  start_time?: string;
  end_time?: string;
  status: string;
  trtc_info?: any;
  last_snapshot_seq: number;
  last_analysis_time?: string;
  live_token?: string;
  token_expires_at?: string;
  error_message?: string;
  anchor_name?: string;
  created_at: string;
  updated_at?: string;
  session_type?: string;
  product_category?: string;
  traffic_level?: string;
  final_status?: string;
  total_duration_seconds?: number;
  data_quality_score?: number;
}

interface SnapshotData {
  id: number;
  session_id: number;
  snapshot_seq: number;
  snapshot_time: string;
  watcher_cnt?: number;
  comment_cnt?: number;
  online_user_cnt?: number;
  order_total?: string;
  order_count?: number;
  new_fan_conversion_rate?: string;
  old_fan_conversion_rate?: string;
  new_fan_pay_count?: number;
  old_fan_pay_count?: number;
  raw_json?: any;
  recording_url?: string;
  transcription?: string;
  created_at: string;
}

interface AnalysisReport {
  id: number;
  session_id: number;
  segment_seq: number;
  report_type: 'segment' | 'final';
  analysis_text: string;
  analysis_json?: any;
  overall_score?: number;
  dimension_scores?: any;
  risk_level?: string;
  key_findings?: any;
  action_items?: any;
  prompt_version?: string;
  model_name?: string;
  knowledge_snapshot_id?: number;
  created_at: string;
}

interface SystemConfig {
  id: number;
  config_key: string;
  config_value?: string;
  updated_at?: string;
}

interface LiveAlert {
  id: number;
  session_id: number;
  alert_type: string;
  level: string;
  title: string;
  description?: string;
  evidence?: any;
  suggestion?: string;
  status: string;
  triggered_at: string;
  resolved_at?: string;
}

interface ActionItem {
  id: number;
  session_id: number;
  report_id?: number;
  anchor_name?: string;
  dimension: string;
  title: string;
  description?: string;
  priority: string;
  assignee?: string;
  status: string;
  due_date?: string;
  verified_in_session_id?: number;
  verified_result?: string;
  source_quote?: string;
  created_at: string;
  updated_at: string;
}

interface AnalysisKnowledge {
  id: number;
  category: 'threshold' | 'pattern' | 'benchmark' | 'rule';
  dimension: string;
  key: string;
  value: string;
  source: string;
  confidence: number;
  sample_count: number;
  source_session_ids?: number[];
  source_report_ids?: number[];
  first_seen_at?: string;
  last_seen_at?: string;
  last_used_at?: string;
  positive_count?: number;
  negative_count?: number;
  conflict_count?: number;
  scope_anchor?: string;
  scope_product?: string;
  scope_traffic?: string;
  scope_session_type?: string;
  status?: string;
  decay_score?: number;
  created_at: string;
  updated_at: string;
}

interface SkillVersion {
  id: number;
  version: string;
  content: string;
  change_log?: string;
  knowledge_snapshot?: string;
  is_active: number;
  created_at: string;
}

interface LiveScript {
  id: number;
  session_date: string;
  anchor_name?: string;
  keywords?: string;
  content_points?: string;
  product_list?: string;
  transaction_data?: string;
  replay_transaction?: string;
  source?: string;
  created_at: string;
}

interface RawLivePayload {
  id: number;
  session_id: number;
  snapshot_seq: number;
  api_name: string;
  request_params?: any;
  response_data?: any;
  fetched_at: string;
}

interface LiveMetricsMinute {
  id: number;
  session_id: number;
  minute_index: number;
  online_count?: number;
  comment_count?: number;
  click_count?: number;
  order_count?: number;
  paid_count?: number;
  paid_amount?: number;
  viewer_count?: number;
  created_at: string;
}

interface LiveGoodsMetrics {
  id: number;
  session_id: number;
  goods_id: string;
  goods_name: string;
  click_count: number;
  order_count: number;
  paid_count: number;
  unpaid_count: number;
  pay_amount: number;
  click_to_order_rate?: number;
  order_to_pay_rate?: number;
  click_to_pay_rate?: number;
  created_at: string;
}

interface RecordingSegment {
  id: number;
  session_id: number;
  room_id: string;
  segment_seq: number;
  start_time?: string;
  end_time?: string;
  duration_seconds?: number;
  local_path?: string;
  storage_url?: string;
  file_size?: number;
  status: string;
  transcribe_status: string;
  retry_count: number;
  error_message?: string;
  created_at: string;
}

interface LiveTimelineEvent {
  id: number;
  session_id: number;
  timestamp: string;
  offset_seconds?: number;
  event_type: string;
  content?: string;
  metrics?: any;
  source?: string;
  importance: string;
  created_at: string;
}

interface CommentInsight {
  id: number;
  session_id: number;
  comment_id?: string;
  comment_text: string;
  category?: string;
  sentiment?: string;
  importance: string;
  answered: boolean;
  answer_time?: string;
  related_sales_after?: any;
  created_at: string;
}

interface AnalysisReportItem {
  id: number;
  report_id: number;
  dimension?: string;
  severity?: string;
  title: string;
  evidence?: string;
  suggestion?: string;
  related_metric?: any;
  related_time?: string;
  created_at: string;
}

interface KnowledgeUsageLog {
  id: number;
  report_id: number;
  knowledge_id: number;
  session_id: number;
  used_dimension?: string;
  prompt_version?: string;
  model_name?: string;
  output_reference?: string;
  created_at: string;
}

interface KnowledgeConflict {
  id: number;
  knowledge_id: number;
  session_id: number;
  conflict_reason: string;
  metric_evidence?: any;
  created_at: string;
}

interface BackgroundJob {
  id: number;
  job_type: string;
  session_id?: number;
  segment_seq?: number;
  status: string;
  payload?: any;
  result?: any;
  error_message?: string;
  retry_count: number;
  max_retry: number;
  locked_by?: string;
  locked_until?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

interface ReviewTask {
  id: number;
  source_report_id?: number;
  session_id: number;
  anchor_name?: string;
  dimension?: string;
  problem?: string;
  suggestion?: string;
  priority: string;
  owner_role?: string;
  status: string;
  verify_metric?: string;
  target_value?: string;
  actual_value?: string;
  verify_session_id?: number;
  created_at: string;
  verified_at?: string;
}

interface AnchorProfile {
  anchor_name: string;
  avg_sales?: number;
  avg_viewers?: number;
  avg_online?: number;
  avg_conversion_rate?: number;
  avg_comment_rate?: number;
  avg_score?: number;
  dimension_scores?: any;
  strengths?: string[];
  weaknesses?: string[];
  best_product_types?: string[];
  updated_at: string;
}

interface PromptVersion {
  id: number;
  version: string;
  prompt_type: string;
  content: string;
  is_active: boolean;
  changelog?: string;
  created_at: string;
}

interface WorkerHeartbeat {
  worker_id: string;
  worker_type?: string;
  last_seen_at: string;
  status: string;
  current_job_id?: number;
}

interface ProductBattleCard {
  id: number;
  goods_name: string;
  summary_stats?: any;
  best_session?: any;
  worst_session?: any;
  ai_analysis?: string;
  created_at: string;
  updated_at: string;
}

// 告警推送记录（保留基础告警接口，用于直播预警）
interface MonitorAlert {
  id: number;
  issue_id?: number;
  alert_type: string;
  alert_level: string;
  channels?: any;
  recipients?: any;
  title: string;
  content?: string;
  status: string;
  sent_at?: string;
  error_message?: string;
  created_at: string;
}

// 内存存储
const storage = {
  liveSessions: [] as LiveSession[],
  snapshotData: [] as SnapshotData[],
  analysisReports: [] as AnalysisReport[],
  systemConfig: [] as SystemConfig[],
  liveAlerts: [] as LiveAlert[],
  actionItems: [] as ActionItem[],
  analysisKnowledge: [] as AnalysisKnowledge[],
  skillVersions: [] as SkillVersion[],
  liveScripts: [] as LiveScript[],
  backgroundJobs: [] as BackgroundJob[],
  rawLivePayloads: [] as RawLivePayload[],
  liveMetricsMinute: [] as LiveMetricsMinute[],
  liveGoodsMetrics: [] as LiveGoodsMetrics[],
  recordingSegments: [] as RecordingSegment[],
  liveTimelineEvents: [] as LiveTimelineEvent[],
  commentInsights: [] as CommentInsight[],
  analysisReportItems: [] as AnalysisReportItem[],
  knowledgeUsageLogs: [] as KnowledgeUsageLog[],
  knowledgeConflicts: [] as KnowledgeConflict[],
  reviewTasks: [] as ReviewTask[],
  anchorProfiles: [] as AnchorProfile[],
  promptVersions: [] as PromptVersion[],
  workerHeartbeats: [] as WorkerHeartbeat[],
  productBattleCards: [] as ProductBattleCard[],
  monitorAlerts: [] as MonitorAlert[], // 保留基础告警功能，用于直播预警
  nextIds: {
    liveSessions: 1,
    snapshotData: 1,
    analysisReports: 1,
    systemConfig: 1,
    liveAlerts: 1,
    actionItems: 1,
    analysisKnowledge: 1,
    skillVersions: 1,
    liveScripts: 1,
    backgroundJobs: 1,
    rawLivePayloads: 1,
    liveMetricsMinute: 1,
    liveGoodsMetrics: 1,
    recordingSegments: 1,
    liveTimelineEvents: 1,
    commentInsights: 1,
    analysisReportItems: 1,
    knowledgeUsageLogs: 1,
    knowledgeConflicts: 1,
    reviewTasks: 1,
    anchorProfiles: 1,
    promptVersions: 1,
    workerHeartbeats: 1,
    productBattleCards: 1,
    monitorAlerts: 1,
  }
};

// 保存数据到文件
function saveToFile() {
  try {
    const filePath = path.join(DATA_DIR, 'storage.json');
    const tempPath = `${filePath}.tmp`;
    
    // 自定义 replacer 来处理 BigInt
    const replacer = (key: string, value: any) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    };
    
    // 先写入临时文件，确保原子性
    fs.writeFileSync(tempPath, JSON.stringify(storage, replacer, 2), { mode: 0o644 });
    
    // 原子性重命名
    if (fs.existsSync(filePath)) {
      fs.renameSync(filePath, `${filePath}.bak`);
    }
    fs.renameSync(tempPath, filePath);
    
    // 清理旧备份文件
    const backupPath = `${filePath}.bak`;
    if (fs.existsSync(backupPath)) {
      try {
        fs.unlinkSync(backupPath);
      } catch {
        // 忽略清理错误
      }
    }
    
    console.log(`[Storage] Data saved successfully to ${filePath}`);
  } catch (error) {
    console.error('[Storage] Failed to save data to file:', error);
  }
}

// 从文件加载数据
function loadFromFile() {
  const filePath = path.join(DATA_DIR, 'storage.json');
  
  try {
    if (fs.existsSync(filePath)) {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      // 确保所有必要的数组都已初始化
      Object.keys(storage).forEach(key => {
        if (key !== 'nextIds' && Array.isArray((storage as any)[key]) && !Array.isArray(data[key])) {
          data[key] = (storage as any)[key];
        }
      });
      Object.assign(storage, data);
      console.log(`[Storage] Data loaded successfully from ${filePath}`);
    } else {
      console.log(`[Storage] No existing data file found, starting with empty storage`);
    }
  } catch (error) {
    console.error(`[Storage] Failed to load data:`, error);
    console.log(`[Storage] Starting with empty storage`);
  }
}

// 初始化时加载数据
loadFromFile();

// 创建一个模拟的 Supabase 风格查询接口
class LocalTable<T extends { id: number }> {
  public tableName: Exclude<keyof typeof storage, 'nextIds'>;

  constructor(tableName: string) {
    this.tableName = tableName as Exclude<keyof typeof storage, 'nextIds'>;
  }

  select(columns = '*', options?: { count?: 'exact' | 'planned' | 'estimated', head?: boolean }) {
    return new LocalQueryBuilder(this, columns, options);
  }

  insert(data: any | any[]) {
    const items = Array.isArray(data) ? data : [data];
    const inserted: any[] = [];
    
    // 确保表存在
    if (!(this.tableName in storage) || !Array.isArray((storage as any)[this.tableName])) {
      (storage as any)[this.tableName] = [];
    }
    if (!(this.tableName in storage.nextIds)) {
      storage.nextIds[this.tableName as keyof typeof storage.nextIds] = 1;
    }
    
    items.forEach(item => {
      const id = storage.nextIds[this.tableName as keyof typeof storage.nextIds];
      storage.nextIds[this.tableName as keyof typeof storage.nextIds]++;
      const now = new Date().toISOString();
      const newItem = {
        ...item,
        id,
        created_at: item.created_at || now,
        updated_at: item.updated_at || now
      };
      (storage[this.tableName] as any[]).push(newItem);
      inserted.push(newItem);
    });
    
    saveToFile();
    
    // 返回一个支持链式调用的对象
    const result = { 
      data: inserted.length === 1 ? inserted[0] : inserted, 
      error: null 
    };
    
    // 添加 select 方法支持链式调用
    (result as any).select = () => {
      return {
        single: () => Promise.resolve({ data: inserted[0] || null, error: null }),
        then: (onfulfilled: any) => Promise.resolve(onfulfilled({ data: inserted, error: null }))
      };
    };
    
    return result as any;
  }

  upsert(data: any | any[], options?: { onConflict?: string }) {
    const items = Array.isArray(data) ? data : [data];
    const upserted = items.map(item => {
      const tableData = this.getTableData();
      let existingIndex = -1;
      
      if (options?.onConflict) {
        const conflictFields = options.onConflict.split(',').map(s => s.trim());
        existingIndex = tableData.findIndex((row: any) => {
          return conflictFields.every(field => row[field] === item[field]);
        });
      }

      if (existingIndex >= 0) {
        // 更新现有记录
        const now = new Date().toISOString();
        tableData[existingIndex] = {
          ...tableData[existingIndex],
          ...item,
          updated_at: now
        };
        return tableData[existingIndex];
      } else {
        // 插入新记录
        const id = storage.nextIds[this.tableName];
        storage.nextIds[this.tableName]++;
        const now = new Date().toISOString();
        const newItem = {
          ...item,
          id,
          created_at: item.created_at || now,
          updated_at: item.updated_at || now
        };
        (storage[this.tableName] as any[]).push(newItem);
        return newItem;
      }
    });
    saveToFile();
    return { data: upserted, error: null };
  }

  update(data: any) {
    return new LocalUpdateBuilder(this, data);
  }

  delete() {
    return new LocalDeleteBuilder(this);
  }

  getTableData(): T[] {
    const data = (storage as any)[this.tableName];
    // 确保返回一个数组
    if (!data || !Array.isArray(data)) {
      (storage as any)[this.tableName] = [];
      // 确保也初始化 nextIds
      if (!(this.tableName in storage.nextIds)) {
        storage.nextIds[this.tableName as keyof typeof storage.nextIds] = 1;
      }
      return [];
    }
    return data;
  }
}

class LocalQueryBuilder<T extends { id: number }> {
  private table: LocalTable<T>;
  private filters: { [key: string]: any } = {};
  private inFilters: { [key: string]: any[] } = {};
  private orderByField?: string;
  private orderDirection: 'asc' | 'desc' = 'asc';
  private limitCount?: number;
  private rangeStart?: number;
  private rangeEnd?: number;
  private countOption?: { count?: 'exact' | 'planned' | 'estimated', head?: boolean };
  private isSingle = false;
  private isMaybeSingle = false;

  constructor(table: LocalTable<T>, columns: string, options?: { count?: 'exact' | 'planned' | 'estimated', head?: boolean }) {
    this.table = table;
    this.countOption = options;
  }

  eq(field: string, value: any) {
    this.filters[field] = value;
    return this;
  }
  
  in(field: string, values: any[]) {
    this.inFilters[field] = values;
    return this;
  }

  not(field: string, operator: string, value: any) {
    if (operator === 'is' && value === null) {
      this.filters[`${field}__not_null`] = true;
    } else {
      this.filters[`${field}__neq`] = value;
    }
    return this;
  }

  like(field: string, pattern: string) {
    // 简单实现: 暂时忽略 like 条件, 或用包含关系模拟
    // 将 pattern 中的 % 去掉, 然后做字符串包含判断
    const searchTerm = pattern.replace(/%/g, '');
    // 我们可以用 inFilters 或者创建一个新的 likeFilters
    // 为了简化, 这里暂时不做特殊处理, 留待后续扩展
    return this;
  }

  or(condition: string) {
    // 简单实现: 暂时忽略 or 条件, 返回所有匹配其他条件的结果
    return this;
  }

  neq(field: string, value: any) {
    this.filters[`${field}__neq`] = value;
    return this;
  }

  gt(field: string, value: any) {
    this.filters[`${field}__gt`] = value;
    return this;
  }

  lt(field: string, value: any) {
    this.filters[`${field}__lt`] = value;
    return this;
  }

  gte(field: string, value: any) {
    this.filters[`${field}__gte`] = value;
    return this;
  }

  lte(field: string, value: any) {
    this.filters[`${field}__lte`] = value;
    return this;
  }

  order(field: string, { ascending = true }: { ascending?: boolean } = {}) {
    this.orderByField = field;
    this.orderDirection = ascending ? 'asc' : 'desc';
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  range(start: number, end: number) {
    this.rangeStart = start;
    this.rangeEnd = end;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async then<TResult1 = any>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => TResult1 | PromiseLike<TResult1>) | null | undefined
  ) {
    let data = [...this.table.getTableData()];

    // 应用过滤器
    data = data.filter(item => {
      // 普通过滤器
      for (const [key, value] of Object.entries(this.filters)) {
        if (key.endsWith('__neq')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] === value) return false;
        } else if (key.endsWith('__not_null')) {
          const field = key.slice(0, -10);
          if (item[field as keyof T] === null || item[field as keyof T] === undefined) return false;
        } else if (key.endsWith('__gt')) {
          const field = key.slice(0, -4);
          if (item[field as keyof T] <= value) return false;
        } else if (key.endsWith('__lt')) {
          const field = key.slice(0, -4);
          if (item[field as keyof T] >= value) return false;
        } else if (key.endsWith('__gte')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] < value) return false;
        } else if (key.endsWith('__lte')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] > value) return false;
        } else {
          if (item[key as keyof T] !== value) return false;
        }
      }
      // in 过滤器
      for (const [key, values] of Object.entries(this.inFilters)) {
        if (!values.includes(item[key as keyof T])) {
          return false;
        }
      }
      return true;
    });

    // 排序
    if (this.orderByField) {
      data.sort((a, b) => {
        const aVal = a[this.orderByField as keyof T];
        const bVal = b[this.orderByField as keyof T];
        if (aVal < bVal) return this.orderDirection === 'asc' ? -1 : 1;
        if (aVal > bVal) return this.orderDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    // 保存总数
    const totalCount = data.length;

    // 范围查询
    if (this.rangeStart !== undefined && this.rangeEnd !== undefined) {
      data = data.slice(this.rangeStart, this.rangeEnd + 1);
    }

    // 限制
    if (this.limitCount) {
      data = data.slice(0, this.limitCount);
    }

    // 处理 single/maybeSingle
    let resultData: T[] | T | null = data;
    if (this.isSingle || this.isMaybeSingle) {
      resultData = data.length > 0 ? data[0] : null;
    }

    const result = { 
      data: resultData, 
      error: null, 
      count: this.countOption ? totalCount : undefined 
    };
    return onfulfilled ? onfulfilled(result) : result;
  }
}

class LocalUpdateBuilder<T extends { id: number }> {
  private table: LocalTable<T>;
  private data: any;
  private filters: { [key: string]: any } = {};
  private inFilters: { [key: string]: any[] } = {};

  constructor(table: LocalTable<T>, data: any) {
    this.table = table;
    this.data = { ...data, updated_at: new Date().toISOString() };
  }

  eq(field: string, value: any) {
    this.filters[`${field}__eq`] = value;
    return this;
  }
  
  in(field: string, values: any[]) {
    this.inFilters[field] = values;
    return this;
  }

  lt(field: string, value: any) {
    this.filters[`${field}__lt`] = value;
    return this;
  }

  lte(field: string, value: any) {
    this.filters[`${field}__lte`] = value;
    return this;
  }

  gt(field: string, value: any) {
    this.filters[`${field}__gt`] = value;
    return this;
  }

  gte(field: string, value: any) {
    this.filters[`${field}__gte`] = value;
    return this;
  }

  select(columns?: string) {
    return this;
  }

  single() {
    // 保存原始 then 方法
    const originalThen = this.then.bind(this);
    
    // 重写 then 方法以返回单个结果
    (this as any).then = async (onfulfilled: any) => {
      const result = await originalThen();
      const data = result.data?.[0] || null;
      return onfulfilled ? onfulfilled({ data, error: null }) : { data, error: null };
    };
    
    return this;
  }

  async then<TResult1 = any>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null | undefined
  ) {
    const tableData = this.table.getTableData();
    const updated: T[] = [];

    tableData.forEach((item, index) => {
      let match = true;
      
      // 普通过滤器
      for (const [key, value] of Object.entries(this.filters)) {
        if (key.endsWith('__neq')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] === value) { match = false; break; }
        } else if (key.endsWith('__not_null')) {
          const field = key.slice(0, -10);
          if (item[field as keyof T] === null || item[field as keyof T] === undefined) { match = false; break; }
        } else if (key.endsWith('__gt')) {
          const field = key.slice(0, -4);
          if (item[field as keyof T] <= value) { match = false; break; }
        } else if (key.endsWith('__lt')) {
          const field = key.slice(0, -4);
          if (item[field as keyof T] >= value) { match = false; break; }
        } else if (key.endsWith('__gte')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] < value) { match = false; break; }
        } else if (key.endsWith('__lte')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] > value) { match = false; break; }
        } else if (key.endsWith('__eq')) {
          const field = key.slice(0, -4);
          if (item[field as keyof T] !== value) { match = false; break; }
        } else {
          if (item[key as keyof T] !== value) { match = false; break; }
        }
      }
      
      // in 过滤器
      if (match) {
        for (const [key, values] of Object.entries(this.inFilters)) {
          if (!values.includes(item[key as keyof T])) {
            match = false;
            break;
          }
        }
      }
      
      if (match) {
        tableData[index] = { ...item, ...this.data };
        updated.push(tableData[index]);
      }
    });

    saveToFile();
    const result = { data: updated, error: null };
    return onfulfilled ? onfulfilled(result) : result;
  }
}

class LocalDeleteBuilder<T extends { id: number }> {
  private table: LocalTable<T>;
  private filters: { [key: string]: any } = {};
  private inFilters: { [key: string]: any[] } = {};

  constructor(table: LocalTable<T>) {
    this.table = table;
  }

  eq(field: string, value: any) {
    this.filters[`${field}__eq`] = value;
    return this;
  }
  
  in(field: string, values: any[]) {
    this.inFilters[field] = values;
    return this;
  }

  lt(field: string, value: any) {
    this.filters[`${field}__lt`] = value;
    return this;
  }

  lte(field: string, value: any) {
    this.filters[`${field}__lte`] = value;
    return this;
  }

  gt(field: string, value: any) {
    this.filters[`${field}__gt`] = value;
    return this;
  }

  gte(field: string, value: any) {
    this.filters[`${field}__gte`] = value;
    return this;
  }

  async then<TResult1 = any>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null | undefined
  ) {
    const tableData = this.table.getTableData() as any[];
    const newData = tableData.filter(item => {
      let match = true;
      for (const [key, value] of Object.entries(this.filters)) {
        if (key.endsWith('__neq')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] === value) { match = false; break; }
        } else if (key.endsWith('__not_null')) {
          const field = key.slice(0, -10);
          if (item[field as keyof T] === null || item[field as keyof T] === undefined) { match = false; break; }
        } else if (key.endsWith('__gt')) {
          const field = key.slice(0, -4);
          if (item[field as keyof T] <= value) { match = false; break; }
        } else if (key.endsWith('__lt')) {
          const field = key.slice(0, -4);
          if (item[field as keyof T] >= value) { match = false; break; }
        } else if (key.endsWith('__gte')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] < value) { match = false; break; }
        } else if (key.endsWith('__lte')) {
          const field = key.slice(0, -5);
          if (item[field as keyof T] > value) { match = false; break; }
        } else if (key.endsWith('__eq')) {
          const field = key.slice(0, -4);
          if (item[field as keyof T] !== value) { match = false; break; }
        } else {
          if (item[key as keyof T] !== value) { match = false; break; }
        }
      }
      
      // in 过滤器
      if (match) {
        for (const [key, values] of Object.entries(this.inFilters)) {
          if (!values.includes(item[key as keyof T])) {
            match = false;
            break;
          }
        }
      }
      
      // 如果 match 为 true，表示符合过滤条件，需要被删除，所以 filter 返回 !match
      return !match;
    });

    (storage as any)[this.table.tableName] = newData;
    saveToFile();
    const result = { data: null, error: null };
    return onfulfilled ? onfulfilled(result) : result;
  }
}

// 导出存储接口
export function getLocalStorage() {
  return {
    from: (tableName: string) => {
      // 转换 snake_case 到 camelCase
      const camelCaseName = tableName.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      return new LocalTable(camelCaseName as keyof typeof storage);
    }
  };
}

// 直接访问存储的辅助函数
export function getStorage() {
  return storage;
}
