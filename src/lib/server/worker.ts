/**
 * 后台任务 Worker 服务
 * 无人值守执行：监控、录制、转写、分析、重试
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

const WORKER_ID = `worker-${process.pid || Math.random().toString(36).slice(2, 8)}`;
const LOCK_DURATION_MS = 10 * 60 * 1000; // 10分钟锁过期
const POLL_INTERVAL_MS = 15 * 1000; // 15秒轮询
const MAX_CONCURRENT = 3; // 最大并发任务数

let workerRunning = false;
let pollTimer: ReturnType<typeof setInterval> | null = null;

// ============ 任务调度 ============

type JobHandler = (job: BackgroundJob) => Promise<void>;

interface BackgroundJob {
  id: number;
  job_type: string;
  session_id: number | null;
  segment_seq: number | null;
  status: string;
  payload: Record<string, unknown> | null;
  retry_count: number;
  max_retry: number;
}

const jobHandlers: Record<string, JobHandler> = {};

/** 注册任务处理器 */
export function registerJobHandler(jobType: string, handler: JobHandler) {
  jobHandlers[jobType] = handler;
}

/** 创建后台任务 */
export async function enqueueJob(
  jobType: string,
  payload: Record<string, unknown> = {},
  options: { sessionId?: number; segmentSeq?: number; maxRetry?: number } = {}
): Promise<number> {
  const db = getSupabaseClient();
  const { data, error } = await db
    .from('background_jobs')
    .insert({
      job_type: jobType,
      session_id: options.sessionId ?? null,
      segment_seq: options.segmentSeq ?? null,
      payload,
      status: 'pending',
      max_retry: options.maxRetry ?? 3,
    })
    .select('id')
    .single();

  if (error) throw new Error(`创建任务失败: ${error.message}`);
  console.log(`[Worker] 任务已入队: type=${jobType}, id=${data.id}`);
  return data.id;
}

/** 尝试获取并锁定一个待执行任务 */
async function acquireJob(): Promise<BackgroundJob | null> {
  const db = getSupabaseClient();

  // 获取一个 pending 且未过期的任务
  const { data: jobs, error } = await db
    .from('background_jobs')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (error || !jobs || jobs.length === 0) return null;

  const job = jobs[0] as BackgroundJob;

  // 尝试锁定（CAS操作防止并发竞争）
  const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString();
  const { data: updated, error: lockError } = await db
    .from('background_jobs')
    .update({
      status: 'running',
      locked_by: WORKER_ID,
      locked_until: lockedUntil,
      started_at: new Date().toISOString(),
    })
    .eq('id', job.id)
    .eq('status', 'pending') // CAS条件
    .select()
    .single();

  if (lockError || !updated) {
    // 另一个worker已经抢到了
    return null;
  }

  return updated as BackgroundJob;
}

/** 标记任务成功 */
async function completeJob(jobId: number, result?: Record<string, unknown>) {
  const db = getSupabaseClient();
  await db
    .from('background_jobs')
    .update({
      status: 'success',
      result: result ?? null,
      finished_at: new Date().toISOString(),
      locked_by: null,
      locked_until: null,
    })
    .eq('id', jobId);
  console.log(`[Worker] 任务完成: id=${jobId}`);
}

/** 标记任务失败，判断是否重试 */
async function failJob(jobId: number, errorMsg: string, job: BackgroundJob) {
  const db = getSupabaseClient();
  const shouldRetry = job.retry_count < job.max_retry;

  if (shouldRetry) {
    // 退避重试：1min, 5min, 15min
    const delays = [60000, 300000, 900000];
    const delay = delays[Math.min(job.retry_count, delays.length - 1)];
    const retryAt = new Date(Date.now() + delay).toISOString();

    await db
      .from('background_jobs')
      .update({
        status: 'pending',
        error_message: errorMsg,
        retry_count: job.retry_count + 1,
        locked_by: null,
        locked_until: null,
        started_at: null,
        // 用 payload 记录下次执行时间
        payload: { ...((job.payload as Record<string, unknown>) ?? {}), _retry_after: retryAt },
      })
      .eq('id', jobId);
    console.log(`[Worker] 任务将重试: id=${jobId}, retry=${job.retry_count + 1}/${job.max_retry}, after=${delay / 1000}s`);
  } else {
    await db
      .from('background_jobs')
      .update({
        status: 'failed',
        error_message: errorMsg,
        finished_at: new Date().toISOString(),
        locked_by: null,
        locked_until: null,
      })
      .eq('id', jobId);
    console.log(`[Worker] 任务失败(已耗尽重试): id=${jobId}`);
  }
}

/** 执行单个任务 */
async function executeJob(job: BackgroundJob) {
  const handler = jobHandlers[job.job_type];
  if (!handler) {
    await failJob(job.id, `未注册的处理器: ${job.job_type}`, job);
    return;
  }

  try {
    // 检查重试延迟
    const payload = job.payload as Record<string, unknown> | null;
    if (payload?._retry_after) {
      const retryAfter = new Date(payload._retry_after as string).getTime();
      if (Date.now() < retryAfter) {
        // 还没到重试时间，释放回pending
        const db = getSupabaseClient();
        await db
          .from('background_jobs')
          .update({ status: 'pending', locked_by: null, locked_until: null, started_at: null })
          .eq('id', job.id);
        return;
      }
    }

    console.log(`[Worker] 开始执行: type=${job.job_type}, id=${job.id}, session=${job.session_id}`);
    await handler(job);
    await completeJob(job.id);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Worker] 执行出错: id=${job.id}, error=${msg}`);
    await failJob(job.id, msg, job);
  }
}

/** 回收超时的任务（Worker崩溃后恢复） */
async function recoverTimedOutJobs() {
  const db = getSupabaseClient();
  const now = new Date().toISOString();

  const { data, error } = await db
    .from('background_jobs')
    .update({
      status: 'pending',
      locked_by: null,
      locked_until: null,
      started_at: null,
    })
    .eq('status', 'running')
    .lt('locked_until', now)
    .select('id');

  if (!error && data && data.length > 0) {
    console.log(`[Worker] 回收超时任务: ${data.length}个`);
  }
}

/** 获取当前运行中的任务数 */
async function getRunningCount(): Promise<number> {
  const db = getSupabaseClient();
  const { count, error } = await db
    .from('background_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'running')
    .eq('locked_by', WORKER_ID);

  return error ? 0 : (count ?? 0);
}

/** 单次轮询 */
async function poll() {
  try {
    // 回收超时任务
    await recoverTimedOutJobs();

    // 检查并发限制
    const running = await getRunningCount();
    if (running >= MAX_CONCURRENT) return;

    // 获取并执行任务
    const job = await acquireJob();
    if (job) {
      // 异步执行，不阻塞轮询
      executeJob(job).catch((err) => {
        console.error(`[Worker] 任务执行异常: ${err}`);
      });
    }
  } catch (err) {
    console.error(`[Worker] 轮询出错: ${err}`);
  }
}

/** 启动 Worker */
export function startWorker() {
  if (workerRunning) return;
  workerRunning = true;

  console.log(`[Worker] 启动: id=${WORKER_ID}, interval=${POLL_INTERVAL_MS / 1000}s`);
  // 首次立即执行
  poll();
  pollTimer = setInterval(poll, POLL_INTERVAL_MS);
}

/** 停止 Worker */
export function stopWorker() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
  workerRunning = false;
  console.log(`[Worker] 已停止: id=${WORKER_ID}`);
}

/** 获取Worker状态 */
export function getWorkerStatus() {
  return {
    workerId: WORKER_ID,
    running: workerRunning,
    pollInterval: POLL_INTERVAL_MS,
    maxConcurrent: MAX_CONCURRENT,
  };
}
