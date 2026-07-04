
import { logManager } from './src/lib/server/log-manager';

async function generateSampleLogs() {
  console.log('Generating sample logs...\n');

  // Generate 5 runtime logs
  const runtimeLogs = [
    {
      message: '系统启动成功',
      options: {
        log_level: 'info' as const,
        log_type: 'system',
        source: 'server',
      }
    },
    {
      message: '开始监控直播数据',
      options: {
        log_level: 'info' as const,
        log_type: 'monitor',
        source: 'monitor-worker',
        session_id: 1
      }
    },
    {
      message: '获取商品数据超时，正在重试...',
      options: {
        log_level: 'warn' as const,
        log_type: 'api',
        source: 'data-fetcher',
        duration_ms: 5000
      }
    },
    {
      message: '分析报告生成成功',
      options: {
        log_level: 'info' as const,
        log_type: 'analysis',
        source: 'analyzer',
        session_id: 1,
        duration_ms: 3200,
        memory_usage: 2048
      }
    },
    {
      message: '数据库连接错误',
      options: {
        log_level: 'error' as const,
        log_type: 'database',
        source: 'db-connector',
        error: new Error('Connection timeout')
      }
    }
  ];

  // Generate 5 operation logs
  const operationLogs = [
    {
      operation_type: 'system_init',
      options: {
        description: '系统初始化完成',
        status: 'success' as const
      }
    },
    {
      operation_type: 'user_login',
      options: {
        user_id: 'user_001',
        username: '管理员',
        description: '用户登录成功',
        ip_address: '192.168.1.1',
        status: 'success' as const
      }
    },
    {
      operation_type: 'monitor_start',
      options: {
        description: '启动直播监控',
        resource_type: 'session',
        resource_id: 'room_123',
        status: 'success' as const
      }
    },
    {
      operation_type: 'config_update',
      options: {
        username: '管理员',
        resource_type: 'config',
        resource_id: 'system_settings',
        action: 'update',
        description: '更新系统配置',
        old_value: { polling_interval: 30 },
        new_value: { polling_interval: 60 },
        status: 'success' as const
      }
    },
    {
      operation_type: 'analysis_generate',
      options: {
        resource_type: 'report',
        resource_id: 'report_456',
        action: 'create',
        description: '生成分析报告',
        session_id: 1,
        status: 'success' as const
      }
    }
  ];

  // Insert runtime logs
  for (const log of runtimeLogs) {
    await logManager.log(log.message, log.options);
    console.log(`✅ Runtime log: ${log.message}`);
  }

  console.log();

  // Insert operation logs
  for (const log of operationLogs) {
    await logManager.logOperation(log.operation_type, log.options);
    console.log(`✅ Operation log: ${log.operation_type}`);
  }

  console.log('\n✅ All sample logs generated successfully!');

  // Verify logs were created
  console.log('\n📋 Retrieving logs...');
  const runtimeLogsResult = await logManager.getRuntimeLogs({ limit: 10 });
  console.log(`\nRuntime logs found: ${runtimeLogsResult.length}`);
  
  const operationLogsResult = await logManager.getOperationLogs({ limit: 10 });
  console.log(`Operation logs found: ${operationLogsResult.length}`);
}

generateSampleLogs()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error generating logs:', error);
    process.exit(1);
  });
