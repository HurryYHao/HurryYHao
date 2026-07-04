// 系统监控管理器
import { getSupabaseClient } from "@/storage/database/supabase-client";
import os from 'os';
import fs from 'fs';
import path from 'path';

// 监控配置
const MONITOR_CONFIG = {
  healthCheckInterval: 60000, // 健康检查间隔 1分钟
  resourceUsageInterval: 30000, // 资源使用记录间隔 30秒
  testRunInterval: 300000, // 测试运行间隔 5分钟
  thresholds: {
    cpu: {
      warning: 70,
      error: 90
    },
    memory: {
      warning: 80,
      error: 95
    },
    disk: {
      warning: 85,
      error: 95
    },
    apiResponseTime: {
      warning: 3000, // 3秒
      error: 10000 // 10秒
    }
  }
};

// 系统环境信息
function getEnvironmentInfo() {
  return {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    env: process.env.NODE_ENV || 'development',
    host: os.hostname()
  };
}

// 获取资源使用情况
export function getResourceUsage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const loadAvgs = os.loadavg();

  // 计算磁盘使用（简单版）
  let diskUsed = 0;
  let diskTotal = 0;
  try {
    const stats = fs.statfsSync('/');
    diskTotal = stats.bsize * stats.blocks;
    diskUsed = diskTotal - (stats.bsize * stats.bfree);
  } catch {
    // 忽略
  }

  return {
    cpu_usage_percent: (loadAvgs[0] * 100 / os.cpus().length).toFixed(2),
    cpu_load_avg_1m: loadAvgs[0].toFixed(2),
    cpu_load_avg_5m: loadAvgs[1].toFixed(2),
    cpu_load_avg_15m: loadAvgs[2].toFixed(2),
    memory_used_bytes: BigInt(usedMemory),
    memory_total_bytes: BigInt(totalMemory),
    memory_usage_percent: ((usedMemory / totalMemory) * 100).toFixed(2),
    disk_used_bytes: BigInt(diskUsed),
    disk_total_bytes: BigInt(diskTotal),
    disk_usage_percent: diskTotal > 0 ? ((diskUsed / diskTotal) * 100).toFixed(2) : '0',
    process_count: process.pid, // 简化版本
    active_connections: 0, // 需要从实际连接池获取
    created_at: new Date().toISOString()
  };
}

// 测试用例定义
const TEST_CASES = [
  // ==================== 正常业务流程 ====================
  {
    id: 'api-sessions-list',
    name: '获取会话列表API',
    type: 'normal',
    module: 'sessions',
    test: async () => {
      const response = await fetch('http://localhost:3001/api/sessions');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    }
  },
  {
    id: 'api-logs-list',
    name: '获取日志列表API',
    type: 'normal',
    module: 'logs',
    test: async () => {
      const response = await fetch('http://localhost:3001/api/logs');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    }
  },
  {
    id: 'api-products-list',
    name: '获取商品列表API',
    type: 'normal',
    module: 'products',
    test: async () => {
      const response = await fetch('http://localhost:3001/api/products');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    }
  },
  // ==================== 异常场景 ====================
  {
    id: 'api-invalid-endpoint',
    name: '无效API端点',
    type: 'exception',
    module: 'api',
    test: async () => {
      const response = await fetch('http://localhost:3001/api/nonexistent');
      if (response.status === 404) {
        return { expected: true };
      }
      throw new Error(`Expected 404, got ${response.status}`);
    }
  },
  {
    id: 'api-empty-request',
    name: '空请求测试',
    type: 'exception',
    module: 'api',
    test: async () => {
      const response = await fetch('http://localhost:3001/api/products', {
        method: 'POST',
        body: JSON.stringify({})
      });
      return { status: response.status };
    }
  },
  // ==================== 边界条件 ====================
  {
    id: 'api-pagination-large',
    name: '大数据量分页',
    type: 'boundary',
    module: 'sessions',
    test: async () => {
      const response = await fetch('http://localhost:3001/api/sessions?page=1000&pageSize=1000');
      return { status: response.status };
    }
  }
];

// 问题类型分类
export type IssueType = 'api_error' | 'business_error' | 'resource_overload' | 'timeout' | 'unknown';
export type IssueSeverity = 'info' | 'warning' | 'error' | 'critical';
export type IssueStatus = 'open' | 'investigating' | 'resolved' | 'ignored';

// 记录问题
export async function recordIssue(data: {
  issue_type: IssueType;
  severity: IssueSeverity;
  module: string;
  title: string;
  description?: string;
  error_details?: any;
  log_snippet?: string;
  environment?: any;
  reproduction_steps?: string[];
}) {
  const client = getSupabaseClient();
  const now = new Date().toISOString();
  
  // 检查是否是重复问题（通过标题和模块去重）
  const { data: existing } = await client
    .from('monitor_issues')
    .select('id, occurrence_count, last_occurred_at')
    .eq('title', data.title)
    .eq('module', data.module)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1);

  if (existing && existing.length > 0) {
    // 更新现有问题
    const existingIssue = existing[0];
    const { error } = await client
      .from('monitor_issues')
      .update({
        occurrence_count: existingIssue.occurrence_count + 1,
        last_occurred_at: now,
        updated_at: now
      })
      .eq('id', existingIssue.id);

    if (error) {
      console.error('Failed to update issue:', error);
    }

    return existingIssue.id;
  }

  // 创建新问题
  const { data: result, error } = await client
    .from('monitor_issues')
    .insert({
      ...data,
      environment: data.environment || getEnvironmentInfo(),
      first_occurred_at: now,
      last_occurred_at: now,
      status: 'open',
      occurrence_count: 1,
      created_at: now,
      updated_at: now
    })
    .select('id');

  if (error) {
    console.error('Failed to record issue:', error);
    return null;
  }

  // 触发即时告警
  if (data.severity === 'error' || data.severity === 'critical') {
    await triggerAlert(data);
  }

  return result?.[0]?.id;
}

// 触发告警
async function triggerAlert(issue: any) {
  const client = getSupabaseClient();
  
  const { error } = await client
    .from('monitor_alerts')
    .insert({
      alert_type: 'instant',
      alert_level: issue.severity,
      title: `[${issue.severity.toUpperCase()}] ${issue.title}`,
      content: `模块: ${issue.module}\n描述: ${issue.description || '无描述'}\n类型: ${issue.issue_type}`,
      status: 'pending',
      created_at: new Date().toISOString()
    });

  if (error) {
    console.error('Failed to create alert:', error);
  }

  // 打印到控制台作为告警
  console.log(`🚨 [${issue.severity.toUpperCase()}] ALERT: ${issue.title}`);
  console.log(`   Module: ${issue.module}`);
  console.log(`   Type: ${issue.issue_type}`);
}

// 健康检查
export async function runHealthCheck(checkType: string = 'all') {
  const client = getSupabaseClient();
  const checks = [];

  // API健康检查
  if (checkType === 'all' || checkType === 'api') {
    const apiChecks = ['/api/sessions', '/api/logs', '/api/products'];
    
    for (const endpoint of apiChecks) {
      const startTime = Date.now();
      let status = 'healthy';
      let errorMsg: string | undefined = undefined;
      let responseTime = 0;

      try {
        const response = await fetch(`http://localhost:3001${endpoint}`);
        responseTime = Date.now() - startTime;
        
        if (!response.ok) {
          status = 'unhealthy';
          errorMsg = `HTTP ${response.status}`;
        } else if (responseTime > MONITOR_CONFIG.thresholds.apiResponseTime.warning) {
          status = 'degraded';
        }
      } catch (error) {
        status = 'unhealthy';
        errorMsg = error instanceof Error ? error.message : 'Unknown error';
      }

      const checkData = {
        check_type: 'api',
        check_name: endpoint,
        status,
        details: { endpoint, error: errorMsg },
        response_time_ms: responseTime,
        threshold_warning: { response_time_ms: MONITOR_CONFIG.thresholds.apiResponseTime.warning },
        threshold_error: { response_time_ms: MONITOR_CONFIG.thresholds.apiResponseTime.error },
        created_at: new Date().toISOString()
      };

      // 保存健康检查记录
      await client.from('health_checks').insert(checkData);
      checks.push(checkData);

      // 记录问题
      if (status === 'unhealthy') {
        await recordIssue({
          issue_type: 'api_error',
          severity: 'error',
          module: 'api',
          title: `API端点不可用: ${endpoint}`,
          description: errorMsg,
          error_details: { endpoint, error: errorMsg, response_time: responseTime }
        });
      } else if (status === 'degraded') {
        await recordIssue({
          issue_type: 'timeout',
          severity: 'warning',
          module: 'api',
          title: `API响应慢: ${endpoint}`,
          description: `响应时间 ${responseTime}ms`,
          error_details: { endpoint, response_time: responseTime }
        });
      }
    }
  }

  // 数据库健康检查
  if (checkType === 'all' || checkType === 'database') {
    const startTime = Date.now();
    let status = 'healthy';
    let errorMsg: string | undefined = undefined;

    try {
      await client.from('system_config').select('count').limit(1);
    } catch (error) {
      status = 'unhealthy';
      errorMsg = error instanceof Error ? error.message : 'Database connection error';
    }

    const checkData = {
      check_type: 'database',
      check_name: 'Database Connection',
      status,
      details: { error: errorMsg },
      response_time_ms: Date.now() - startTime,
      created_at: new Date().toISOString()
    };

    await client.from('health_checks').insert(checkData);
    checks.push(checkData);

    if (status === 'unhealthy') {
      await recordIssue({
        issue_type: 'api_error',
        severity: 'critical',
        module: 'database',
        title: '数据库连接失败',
        description: errorMsg
      });
    }
  }

  // 资源使用检查
  if (checkType === 'all' || checkType === 'resource') {
    const usage = getResourceUsage();
    
    await client.from('resource_usage').insert(usage);
    checks.push({
      check_type: 'resource',
      check_name: 'System Resources',
      status: 'healthy',
      details: usage,
      created_at: new Date().toISOString()
    });

    // 检查资源使用是否超过阈值
    const memoryUsage = parseFloat(usage.memory_usage_percent || '0');
    if (memoryUsage >= MONITOR_CONFIG.thresholds.memory.error) {
      await recordIssue({
        issue_type: 'resource_overload',
        severity: 'critical',
        module: 'resource',
        title: '内存使用率过高',
        description: `当前使用率: ${memoryUsage}%`,
        error_details: usage
      });
    } else if (memoryUsage >= MONITOR_CONFIG.thresholds.memory.warning) {
      await recordIssue({
        issue_type: 'resource_overload',
        severity: 'warning',
        module: 'resource',
        title: '内存使用率偏高',
        description: `当前使用率: ${memoryUsage}%`,
        error_details: usage
      });
    }

    const diskUsage = parseFloat(usage.disk_usage_percent || '0');
    if (diskUsage >= MONITOR_CONFIG.thresholds.disk.error) {
      await recordIssue({
        issue_type: 'resource_overload',
        severity: 'critical',
        module: 'resource',
        title: '磁盘使用率过高',
        description: `当前使用率: ${diskUsage}%`,
        error_details: usage
      });
    } else if (diskUsage >= MONITOR_CONFIG.thresholds.disk.warning) {
      await recordIssue({
        issue_type: 'resource_overload',
        severity: 'warning',
        module: 'resource',
        title: '磁盘使用率偏高',
        description: `当前使用率: ${diskUsage}%`,
        error_details: usage
      });
    }
  }

  return checks;
}

// 运行测试用例
export async function runTestCases() {
  const client = getSupabaseClient();
  const results = [];

  for (const testCase of TEST_CASES) {
    const startTime = new Date();
    let status = 'passed';
    let result = null;
    let errorMessage = null;

    try {
      result = await testCase.test();
    } catch (error) {
      status = 'failed';
      errorMessage = error instanceof Error ? error.message : 'Test failed';
      
      // 记录问题
      await recordIssue({
        issue_type: testCase.type === 'exception' ? 'business_error' : 'api_error',
        severity: 'error',
        module: testCase.module,
        title: `测试用例失败: ${testCase.name}`,
        description: errorMessage,
        error_details: { test_case_id: testCase.id, type: testCase.type },
        reproduction_steps: [
          '访问API端点',
          '执行测试操作',
          '验证响应结果'
        ]
      });
    }

    const testRunData = {
      test_case_id: testCase.id,
      test_name: testCase.name,
      test_type: testCase.type,
      test_module: testCase.module,
      status,
      start_time: startTime.toISOString(),
      end_time: new Date().toISOString(),
      duration_ms: Date.now() - startTime.getTime(),
      result,
      error_message: errorMessage,
      created_at: new Date().toISOString()
    };

    await client.from('monitor_test_runs').insert(testRunData);
    results.push(testRunData);
  }

  return results;
}

// 生成监控报告
export async function generateReport(reportType: string = 'daily', startTime?: Date, endTime?: Date) {
  const client = getSupabaseClient();
  const now = new Date();
  
  const start = startTime || new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const end = endTime || now;

  // 获取问题统计
  const { data: issues } = await client
    .from('monitor_issues')
    .select('*')
    .gte('last_occurred_at', start.toISOString())
    .lte('last_occurred_at', end.toISOString());

  // 获取测试结果统计
  const { data: testRuns } = await client
    .from('monitor_test_runs')
    .select('*')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  // 获取健康检查数据
  const { data: healthChecks } = await client
    .from('health_checks')
    .select('*')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString());

  // 获取资源使用趋势
  const { data: resourceUsages } = await client
    .from('resource_usage')
    .select('*')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  // 统计分析
  const issuesBySeverity = {
    critical: (issues || []).filter((i: any) => i.severity === 'critical').length,
    error: (issues || []).filter((i: any) => i.severity === 'error').length,
    warning: (issues || []).filter((i: any) => i.severity === 'warning').length,
    info: (issues || []).filter((i: any) => i.severity === 'info').length
  };

  const issuesByType = (issues || []).reduce((acc: any, issue: any) => {
    acc[issue.issue_type] = (acc[issue.issue_type] || 0) + 1;
    return acc;
  }, {} as any);

  const testStats = {
    total: testRuns?.length || 0,
    passed: (testRuns || []).filter((t: any) => t.status === 'passed').length,
    failed: (testRuns || []).filter((t: any) => t.status === 'failed').length,
    skipped: (testRuns || []).filter((t: any) => t.status === 'skipped').length
  };

  // 生成建议
  const recommendations = [];
  if (issuesBySeverity.critical > 0) {
    recommendations.push('优先处理严重级别问题');
  }
  if (testStats.failed > 0) {
    recommendations.push('修复失败的测试用例');
  }

  // 保存报告
  const { data: report } = await client
    .from('monitor_reports')
    .insert({
      report_type: reportType,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      summary: {
        total_issues: issues?.length || 0,
        issues_by_severity: issuesBySeverity,
        issues_by_type: issuesByType,
        test_stats: testStats
      },
      issues_summary: {
        open: (issues || []).filter((i: any) => i.status === 'open').length,
        investigating: (issues || []).filter((i: any) => i.status === 'investigating').length,
        resolved: (issues || []).filter((i: any) => i.status === 'resolved').length
      },
      test_results: testStats,
      health_trends: healthChecks,
      resource_trends: resourceUsages,
      recommendations,
      created_at: new Date().toISOString()
    })
    .select('id');

  return report?.[0];
}

// 监控管理器类
export class MonitorManager {
  private intervals: NodeJS.Timeout[] = [];
  private isRunning = false;

  // 启动监控
  start() {
    if (this.isRunning) {
      console.log('Monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Starting system monitor...');

    // 立即运行一次
    this.runAllChecks();

    // 设置定时任务
    this.intervals.push(
      setInterval(() => runHealthCheck(), MONITOR_CONFIG.healthCheckInterval)
    );
    this.intervals.push(
      setInterval(() => this.recordResourceUsage(), MONITOR_CONFIG.resourceUsageInterval)
    );
    this.intervals.push(
      setInterval(() => runTestCases(), MONITOR_CONFIG.testRunInterval)
    );

    console.log('✅ System monitor started successfully');
  }

  // 停止监控
  stop() {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    console.log('Stopping system monitor...');

    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];

    console.log('System monitor stopped');
  }

  // 运行所有检查
  private async runAllChecks() {
    try {
      await Promise.all([
        runHealthCheck(),
        this.recordResourceUsage(),
        runTestCases()
      ]);
    } catch (error) {
      console.error('Error running checks:', error);
    }
  }

  // 记录资源使用
  private async recordResourceUsage() {
    const client = getSupabaseClient();
    const usage = getResourceUsage();
    await client.from('resource_usage').insert(usage);
  }
}

// 单例实例
let monitorInstance: MonitorManager | null = null;

export function getMonitorManager(): MonitorManager {
  if (!monitorInstance) {
    monitorInstance = new MonitorManager();
  }
  return monitorInstance;
}
