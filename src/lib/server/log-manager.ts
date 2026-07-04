import { getSupabaseClient } from '@/storage/database/supabase-client';

interface LogOptions {
  log_level?: 'debug' | 'info' | 'warn' | 'error' | 'fatal';
  log_type?: string;
  source?: string;
  context?: any;
  session_id?: number;
  job_id?: number;
  duration_ms?: number;
  memory_usage?: number;
  error_stack?: string;
}

class LogManager {
  private static instance: LogManager;
  private client: any;

  private constructor() {
    this.client = getSupabaseClient();
  }

  public static getInstance(): LogManager {
    if (!LogManager.instance) {
      LogManager.instance = new LogManager();
    }
    return LogManager.instance;
  }

  async log(
    message: string,
    options: LogOptions = {}
  ) {
    try {
      const {
        log_level = 'info', log_type = 'system', source = 'unknown', ...rest } = options;
      
      await this.client.from('runtime_logs').insert({
        log_level,
        log_type,
        source,
        message,
        ...rest
      });
      
      // Also log to console for debugging
      const consoleMethod = log_level === 'error' || log_level === 'fatal' 
        ? console.error 
        : log_level === 'warn' 
          ? console.warn 
          : log_level === 'debug' 
            ? console.debug 
            : console.info;
      consoleMethod(`[${log_level.toUpperCase()}] [${log_type}] [${source}] ${message}`);
    } catch (error) {
      console.error('[LogManager] Failed to log:', error);
    }
  }

  async info(message: string, options: Omit<LogOptions, 'log_level'> = {}) {
    return this.log(message, { ...options, log_level: 'info' });
  }

  async warn(message: string, options: Omit<LogOptions, 'log_level'> = {}) {
    return this.log(message, { ...options, log_level: 'warn' });
  }

  async error(message: string, error?: any, options: Omit<LogOptions, 'log_level'> = {}) {
    return this.log(message, {
      ...options,
      log_level: 'error',
      error_stack: error?.stack || error?.message || String(error)
    });
  }

  async debug(message: string, options: Omit<LogOptions, 'log_level'> = {}) {
    return this.log(message, { ...options, log_level: 'debug' });
  }

  async logOperation(
    operation_type: string,
    options: {
      user_id?: string;
      username?: string;
      resource_type?: string;
      resource_id?: string;
      action?: string;
      description?: string;
      old_value?: any;
      new_value?: any;
      ip_address?: string;
      user_agent?: string;
      status?: 'success' | 'failed' | 'partial';
      error_message?: string;
    } = {}
  ) {
    try {
      await this.client.from('system_operation_logs').insert({
        operation_type,
        ...options
      });
      
      console.log(`[Operation] ${operation_type} - ${options.description || ''}`);
    } catch (error) {
      console.error('[LogManager] Failed to log operation:', error);
    }
  }

  async getRuntimeLogs(options: {
    limit?: number;
    level?: string;
    type?: string;
  } = {}) {
    try {
      let query = this.client.from('runtime_logs').select('*');
      
      if (options.level) {
        query = query.eq('log_level', options.level);
      }
      if (options.type) {
        query = query.eq('log_type', options.type);
      }
      
      query = query.order('created_at', { ascending: false });
      
      const { data } = await query;
      
      return data?.slice(0, options.limit || 100) || [];
    } catch (error) {
      console.error('[LogManager] Failed to get runtime logs:', error);
      return [];
    }
  }

  async getOperationLogs(options: {
    limit?: number;
    operation_type?: string;
  } = {}) {
    try {
      let query = this.client.from('system_operation_logs').select('*');
      
      if (options.operation_type) {
        query = query.eq('operation_type', options.operation_type);
      }
      
      query = query.order('created_at', { ascending: false });
      
      const { data } = await query;
      
      return data?.slice(0, options.limit || 100) || [];
    } catch (error) {
      console.error('[LogManager] Failed to get operation logs:', error);
      return [];
    }
  }
}

export const logManager = LogManager.getInstance();
