import { getSupabaseClient } from '@/storage/database/supabase-client';
import { randomUUID } from 'crypto';

export type JobType = 'monitor' | 'snapshot' | 'record' | 'transcribe' | 'analysis' | 'final_analysis' | 'replay_analysis';

export interface JobPayload {
  sessionId?: number;
  segmentSeq?: number;
  roomId?: string;
  [key: string]: any;
}

export class JobQueue {
  private workerId: string;
  private workerType: string;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(workerType: string = 'general') {
    this.workerId = `${workerType}-${randomUUID()}`;
    this.workerType = workerType;
  }

  // 启动 Worker，开始心跳
  async start() {
    console.log(`[Worker ${this.workerId}] Starting...`);
    await this.updateHeartbeat();
    this.heartbeatInterval = setInterval(() => this.updateHeartbeat(), 30000); // 30秒心跳
  }

  // 停止 Worker
  async stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    const client = getSupabaseClient();
    await client.from('worker_heartbeats').upsert({
      worker_id: this.workerId,
      status: 'offline',
      last_seen_at: new Date().toISOString()
    });
    
    console.log(`[Worker ${this.workerId}] Stopped.`);
  }

  // 更新心跳
  private async updateHeartbeat(currentJobId?: number) {
    try {
      const client = getSupabaseClient();
      await client.from('worker_heartbeats').upsert({
        worker_id: this.workerId,
        worker_type: this.workerType,
        status: 'online',
        last_seen_at: new Date().toISOString(),
        current_job_id: currentJobId
      }, { onConflict: 'worker_id' });
    } catch (e) {
      console.error(`[Worker ${this.workerId}] Failed to update heartbeat:`, e);
    }
  }

  // 添加任务到队列
  async enqueue(jobType: JobType, payload: JobPayload, maxRetry = 3): Promise<number | null> {
    try {
      const client = getSupabaseClient();
      const { data, error } = await client.from('background_jobs').insert({
        job_type: jobType,
        session_id: payload.sessionId,
        segment_seq: payload.segmentSeq,
        status: 'pending',
        payload: payload,
        max_retry: maxRetry
      }).select('id').single();

      if (error) throw error;
      return data?.id || null;
    } catch (e) {
      console.error(`[JobQueue] Failed to enqueue job ${jobType}:`, e);
      return null;
    }
  }

  // 获取并锁定下一个任务
  async dequeue(supportedTypes?: JobType[]): Promise<any | null> {
    try {
      const client = getSupabaseClient();
      
      // 注意：在真实的 PostgreSQL 中，应该使用 SELECT FOR UPDATE SKIP LOCKED
      // 由于这里可能使用本地存储，我们模拟锁定机制
      
      // 1. 查找待处理任务
      let query = client.from('background_jobs')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(10);
        
      if (supportedTypes && supportedTypes.length > 0) {
        query = query.in('job_type', supportedTypes);
      }
      
      const { data: pendingJobs, error } = await query;
      if (error || !pendingJobs || pendingJobs.length === 0) {
        
        // 查找失败但可重试的任务
        let retryQuery = client.from('background_jobs')
          .select('*')
          .eq('status', 'failed')
          // DbQueryBuilder 不支持列间比较，改用本地过滤（下方 line 121）
          .order('updated_at', { ascending: true })
          .limit(5);
          
        if (supportedTypes && supportedTypes.length > 0) {
          retryQuery = retryQuery.in('job_type', supportedTypes);
        }
        
        const { data: retryJobs } = await retryQuery;
        
        // 合并并寻找可以重试的任务 (本地过滤)
        const validRetryJobs = (retryJobs || []).filter((j: any) => j.retry_count < j.max_retry);
        
        if (validRetryJobs.length === 0) return null;
        
        // 尝试锁定重试任务
        for (const job of validRetryJobs) {
          const locked = await this.tryLockJob(job.id);
          if (locked) return job;
        }
        
        return null;
      }
      
      // 2. 尝试锁定其中一个任务
      for (const job of pendingJobs) {
        const locked = await this.tryLockJob(job.id);
        if (locked) return job;
      }
      
      return null;
    } catch (e) {
      console.error(`[JobQueue] Failed to dequeue:`, e);
      return null;
    }
  }

  // 尝试锁定任务
  private async tryLockJob(jobId: number): Promise<boolean> {
    const client = getSupabaseClient();
    
    // 设置锁定时间为 30 分钟后
    const lockUntil = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    
    const { data, error } = await client.from('background_jobs')
      .update({
        status: 'running',
        locked_by: this.workerId,
        locked_until: lockUntil,
        started_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .in('status', ['pending', 'failed']) // 只有 pending 或 failed 才能锁定
      .select('id')
      .single();
      
    return !error && !!data;
  }

  // 完成任务
  async complete(jobId: number, result?: any) {
    const client = getSupabaseClient();
    await client.from('background_jobs')
      .update({
        status: 'success',
        result: result,
        finished_at: new Date().toISOString(),
        locked_by: null,
        locked_until: null
      })
      .eq('id', jobId)
      .eq('locked_by', this.workerId);
  }

  // 任务失败
  async fail(jobId: number, errorMessage: string) {
    const client = getSupabaseClient();
    
    // 先获取当前重试次数
    const { data } = await client.from('background_jobs')
      .select('retry_count')
      .eq('id', jobId)
      .single();
      
    const currentRetry = ((data?.retryCount ?? data?.retry_count) || 0) + 1;
    
    await client.from('background_jobs')
      .update({
        status: 'failed',
        error_message: errorMessage,
        retry_count: currentRetry,
        finished_at: new Date().toISOString(),
        locked_by: null,
        locked_until: null
      })
      .eq('id', jobId)
      .eq('locked_by', this.workerId);
  }
}

// 单例队列实例
export const globalQueue = new JobQueue('api-worker');
