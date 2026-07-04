#!/usr/bin/env ts-node

/**
 * 系统监控服务
 * 用于持续监控系统运行状态、执行健康检查、运行测试用例等
 */

import { getMonitorManager, recordIssue, getResourceUsage, runHealthCheck, runTestCases } from '../src/lib/server/monitor-manager';
import { getSupabaseClient } from '../src/storage/database/supabase-client';

// 监控配置
const MONITOR_CONFIG = {
  healthCheckInterval: 60000, // 健康检查间隔 1 分钟
  resourceUsageInterval: 30000, // 资源使用记录间隔 30 秒
  testRunInterval: 300000, // 测试用例运行间隔 5 分钟
  reportInterval: 86400000, // 日报生成间隔 24 小时
  alertThresholds: {
    cpuWarning: 70,
    cpuCritical: 90,
    memoryWarning: 80,
    memoryCritical: 95,
    diskWarning: 85,
    diskCritical: 95
  }
};

class MonitorServer {
  private intervals: NodeJS.Timeout[] = [];
  private isRunning = false;
  private startTime: Date = new Date();

  async start() {
    if (this.isRunning) {
      console.log('⚠️ 监控服务已经在运行中');
      return;
    }

    this.isRunning = true;
    this.startTime = new Date();
    console.log('🚀 系统监控服务启动');
    console.log(`📅 启动时间: ${this.startTime.toLocaleString('zh-CN')}`);
    console.log('');

    // 立即执行一次检查
    await this.runAllChecks();

    // 设置定时任务
    this.intervals.push(setInterval(() => this.runHealthCheck(), MONITOR_CONFIG.healthCheckInterval));
    this.intervals.push(setInterval(() => this.recordResourceUsage(), MONITOR_CONFIG.resourceUsageInterval));
    this.intervals.push(setInterval(() => this.runTestCases(), MONITOR_CONFIG.testRunInterval));

    // 监控进程退出信号
    process.on('SIGINT', () => this.stop());
    process.on('SIGTERM', () => this.stop());

    console.log('✅ 监控服务已就绪，正在持续监控...');
  }

  stop() {
    console.log('⏹️ 正在停止监控服务...');
    this.isRunning = false;

    for (const interval of this.intervals) {
      clearInterval(interval);
    }
    this.intervals = [];

    console.log('👋 监控服务已停止');
    process.exit(0);
  }

  private async runAllChecks() {
    try {
      await Promise.all([
        this.runHealthCheck(),
        this.recordResourceUsage(),
        this.runTestCases()
      ]);
    } catch (error) {
      console.error('❌ 执行检查时出错:', error);
    }
  }

  private async runHealthCheck() {
    try {
      console.log('🔍 执行健康检查...');
      const checks = await runHealthCheck();
      console.log(`✅ 健康检查完成: ${checks.length} 项检查`);
    } catch (error) {
      console.error('❌ 健康检查失败:', error);
      await recordIssue({
        issue_type: 'api_error',
        severity: 'error',
        module: 'monitor',
        title: '健康检查执行失败',
        description: error instanceof Error ? error.message : '未知错误'
      });
    }
  }

  private async recordResourceUsage() {
    try {
      const usage = getResourceUsage();
      const client = getSupabaseClient();
      await client.from('resourceUsages').insert(usage);
      
      // 检查资源使用是否超过阈值
      const memoryPercent = parseFloat(usage.memory_usage_percent || '0');
      const diskPercent = parseFloat(usage.disk_usage_percent || '0');

      if (memoryPercent >= MONITOR_CONFIG.alertThresholds.memoryCritical) {
        await recordIssue({
          issue_type: 'resource_overload',
          severity: 'critical',
          module: 'resource',
          title: '内存使用率严重告警',
          description: `当前内存使用率: ${memoryPercent}%`,
          error_details: usage
        });
      } else if (memoryPercent >= MONITOR_CONFIG.alertThresholds.memoryWarning) {
        await recordIssue({
          issue_type: 'resource_overload',
          severity: 'warning',
          module: 'resource',
          title: '内存使用率偏高',
          description: `当前内存使用率: ${memoryPercent}%`,
          error_details: usage
        });
      }

      if (diskPercent >= MONITOR_CONFIG.alertThresholds.diskCritical) {
        await recordIssue({
          issue_type: 'resource_overload',
          severity: 'critical',
          module: 'resource',
          title: '磁盘使用率严重告警',
          description: `当前磁盘使用率: ${diskPercent}%`,
          error_details: usage
        });
      } else if (diskPercent >= MONITOR_CONFIG.alertThresholds.diskWarning) {
        await recordIssue({
          issue_type: 'resource_overload',
          severity: 'warning',
          module: 'resource',
          title: '磁盘使用率偏高',
          description: `当前磁盘使用率: ${diskPercent}%`,
          error_details: usage
        });
      }
    } catch (error) {
      console.error('❌ 记录资源使用时出错:', error);
    }
  }

  private async runTestCases() {
    try {
      console.log('🧪 运行测试用例...');
      const results = await runTestCases();
      const passed = results.filter(r => r.status === 'passed').length;
      const failed = results.filter(r => r.status === 'failed').length;
      console.log(`✅ 测试完成: ${passed} 通过, ${failed} 失败`);
    } catch (error) {
      console.error('❌ 测试执行失败:', error);
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      startTime: this.startTime.toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      config: MONITOR_CONFIG
    };
  }
}

// 创建并启动监控服务
const monitorServer = new MonitorServer();

// 导出供其他模块使用
export { monitorServer, MONITOR_CONFIG };

// 如果直接运行此脚本，则启动监控服务
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1].endsWith('monitor-server.ts')) {
  monitorServer.start();
}
