/**
 * 服务端日志工具 - 同时输出到 console 和日志文件
 * 
 * 日志文件路径: /app/work/logs/bypass/app.log
 * 格式: JSON (与 coze pino logger 格式一致)
 */

import * as fs from 'fs';
import * as path from 'path';

const LOG_DIR = '/app/work/logs/bypass';
const LOG_FILE = path.join(LOG_DIR, 'app.log');

// 确保日志目录存在
try {
  fs.mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // 目录已存在或无法创建，忽略
}

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
