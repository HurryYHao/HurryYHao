/**
 * 服务端日志工具 - 同时输出到 console 和日志文件
 * 
 * 日志目录策略:
 * - PROD 环境: 直接用 /tmp/live-analysis-logs
 * - DEV 环境: 优先 /app/work/logs/bypass，不可写则回退 /tmp
 * 格式: JSON (与 coze pino logger 格式一致)
 */

import * as fs from 'fs';
import * as path from 'path';

const IS_PROD = process.env.COZE_PROJECT_ENV === 'PROD';

function resolveLogDir(): string {
  // 生产环境直接用 /tmp，避免任何 /app 权限问题
  if (IS_PROD) {
    const dir = '/tmp/live-analysis-logs';
    try {
      fs.mkdirSync(dir, { recursive: true });
      return dir;
    } catch {
      return '/tmp';
    }
  }
  
  // 开发环境尝试 /app
  const preferredDir = '/app/work/logs/bypass';
  try {
    fs.mkdirSync(preferredDir, { recursive: true });
    const testFile = path.join(preferredDir, '.write_test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
    return preferredDir;
  } catch {
    // /app 不可写，回退到 /tmp
    const fallbackDir = '/tmp/live-analysis-logs';
    try {
      fs.mkdirSync(fallbackDir, { recursive: true });
      return fallbackDir;
    } catch {
      return '/tmp';
    }
  }
}

const LOG_DIR = resolveLogDir();
const LOG_FILE = path.join(LOG_DIR, 'app.log');

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

function writeToFile(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const entry = {
    level,
    message: `${new Date().toISOString().replace('T', ' ').replace('Z', '').slice(0, 19)} ${level}: ${message}`,
    timestamp: Date.now(),
    ...(data ? { data } : {}),
  };
  
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // 无法写入日志文件，忽略
  }
}

function formatArgs(args: unknown[]): string {
  return args.map(arg => {
    if (arg instanceof Error) {
      return `${arg.message}\n${arg.stack}`;
    }
    if (typeof arg === 'object' && arg !== null) {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
}

export const logger = {
  info: (...args: unknown[]) => {
    const msg = formatArgs(args);
    console.log(...args);
    writeToFile('info', msg);
  },

  warn: (...args: unknown[]) => {
    const msg = formatArgs(args);
    console.warn(...args);
    writeToFile('warn', msg);
  },

  error: (...args: unknown[]) => {
    const msg = formatArgs(args);
    console.error(...args);
    writeToFile('error', msg);
  },

  debug: (...args: unknown[]) => {
    const msg = formatArgs(args);
    console.debug(...args);
    writeToFile('debug', msg);
  },
};

/** 获取当前日志目录路径（供其他模块使用） */
export function getLogDir(): string {
  return LOG_DIR;
}
