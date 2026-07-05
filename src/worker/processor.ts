import { globalQueue } from './queue';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export class WorkerProcessor {
  private isRunning = false;
  private currentJob: any = null;
  private pollInterval = 5000; // 5秒轮询一次队列
  private monitorIntervalMs = 60_000; // 60秒服务端主动轮询直播状态
  private analysisIntervalMs = 30_000; // 30秒服务端检查一次定时分析
  private monitorTimer: NodeJS.Timeout | null = null;
  private analysisTimer: NodeJS.Timeout | null = null;
  private monitorTickRunning = false;
  private analysisTickRunning = false;
  private _backoffWarned = false;

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[WorkerProcessor] Started');

    this.startSchedulers();

    // 异步循环处理任务
    this.processLoop();
  }

  stop() {
    this.isRunning = false;
    if (this.monitorTimer) {
      clearInterval(this.monitorTimer);
      this.monitorTimer = null;
    }
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }
    console.log('[WorkerProcessor] Stopped');
  }

  private startSchedulers() {
    if (!this.monitorTimer) {
      this.monitorTimer = setInterval(() => {
        this.runMonitorTick().catch((error) => {
          console.error('[WorkerProcessor] Monitor scheduler error:', error);
        });
      }, this.monitorIntervalMs);
    }

    if (!this.analysisTimer) {
      this.analysisTimer = setInterval(() => {
        this.runAnalysisTick().catch((error) => {
          console.error('[WorkerProcessor] Analysis scheduler error:', error);
        });
      }, this.analysisIntervalMs);
    }

    this.runMonitorTick().catch((error) => {
      console.error('[WorkerProcessor] Initial monitor tick error:', error);
    });
    this.runAnalysisTick().catch((error) => {
      console.error('[WorkerProcessor] Initial analysis tick error:', error);
    });
  }

  private async runMonitorTick() {
    if (!this.isRunning || this.monitorTickRunning) return;
    this.monitorTickRunning = true;
    try {
      const { pollLiveStatus } = await import('@/lib/server/monitor');
      const result = await pollLiveStatus();
      if (result.newLiveRooms.length > 0 || result.endedRooms.length > 0) {
        console.log(
          `[WorkerProcessor] Monitor tick completed: new=${result.newLiveRooms.length}, ended=${result.endedRooms.length}`
        );
      }
    } catch (error: any) {
      // 登录退避期间只打印一次警告，不刷屏
      if (error?.message?.includes('登录退避中')) {
        if (!this._backoffWarned) {
          console.warn('[WorkerProcessor] Monitor tick skipped: 登录退避中');
          this._backoffWarned = true;
        }
      } else {
        console.error('[WorkerProcessor] Monitor tick failed:', error);
        this._backoffWarned = false; // 非退避错误，重置标志
      }
    } finally {
      this.monitorTickRunning = false;
    }
  }

  private async runAnalysisTick() {
    if (!this.isRunning || this.analysisTickRunning) return;
    this.analysisTickRunning = true;
    try {
      const { checkAndRunScheduledAnalysis } = await import('@/lib/server/monitor');
      const triggered = await checkAndRunScheduledAnalysis();
      if (triggered.length > 0) {
        console.log(`[WorkerProcessor] Analysis tick triggered ${triggered.length} scheduled analyses`);
      }
    } catch (error: any) {
      if (error?.message?.includes('登录退避中')) {
        // 静默跳过，不刷屏
      } else {
        console.error('[WorkerProcessor] Analysis tick failed:', error);
      }
    } finally {
      this.analysisTickRunning = false;
    }
  }

  private async processLoop() {
    while (this.isRunning) {
      try {
        // 尝试获取任务
        const job = await globalQueue.dequeue();
        
        if (job) {
          this.currentJob = job;
          console.log(`[WorkerProcessor] Processing job ${job.id} of type ${job.jobType || job.job_type}`);
          
          await this.executeJob(job);
          
          this.currentJob = null;
        } else {
          // 队列为空，等待一段时间后再试
          await new Promise(resolve => setTimeout(resolve, this.pollInterval));
        }
      } catch (error) {
        console.error('[WorkerProcessor] Error in processing loop:', error);
        await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      }
    }
  }

  private async executeJob(job: any) {
    try {
      const payload = job.payload || {};
      let result = null;

      // 根据任务类型动态导入和执行相应的处理函数
      // 兼容 camelCase（DbQueryBuilder 自动转换）和 snake_case
      const jobType = job.jobType || job.job_type;
      const sessionId = job.sessionId || job.session_id;
      const segmentSeq = job.segmentSeq || job.segment_seq;

      switch (jobType) {
        case 'monitor':
          const { pollLiveStatus } = await import('@/lib/server/monitor');
          await pollLiveStatus();
          break;
          
        case 'record':
          const { autoStartRecording } = await import('@/lib/server/recorder');
          await autoStartRecording(payload.roomId, sessionId, payload.roomName);
          break;
          
        case 'transcribe':
          const { transcribeAudio } = await import('@/lib/server/transcribe-worker');
          await transcribeAudio(payload.audioUrl, sessionId, segmentSeq);
          break;
          
        case 'analysis':
        case 'final_analysis':
          const { runAnalysis } = await import('@/lib/server/analyzer');
          const isFinal = jobType === 'final_analysis' || payload.isFinal;
          result = await runAnalysis(sessionId, payload.roomId, segmentSeq, isFinal ? 'final' : 'segment');
          if (isFinal) {
            const { runKnowledgeQualityControl } = await import('@/lib/server/knowledge-quality');
            await runKnowledgeQualityControl();
          }
          break;
          
        case 'knowledge_quality':
          const { runKnowledgeQualityControl: runKQ } = await import('@/lib/server/knowledge-quality');
          await runKQ();
          result = { message: 'Knowledge quality control completed' };
          break;
          
        case 'snapshot':
          const { fetchAllSnapshotData } = await import('@/lib/server/fetcher');
          result = await fetchAllSnapshotData(sessionId, payload.roomId, segmentSeq);
          break;

        default:
          throw new Error(`Unknown job type: ${jobType}`);
      }

      // 任务成功完成
      await globalQueue.complete(job.id, result);
      console.log(`[WorkerProcessor] Job ${job.id} completed successfully`);
      
    } catch (error) {
      console.error(`[WorkerProcessor] Job ${job.id} failed:`, error);
      await globalQueue.fail(job.id, String(error));
    }
  }
}

// 导出单例处理器
export const processor = new WorkerProcessor();
