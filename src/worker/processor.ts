import { globalQueue } from './queue';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export class WorkerProcessor {
  private isRunning = false;
  private currentJob: any = null;
  private pollInterval = 5000; // 5秒轮询一次队列

  async start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log('[WorkerProcessor] Started');
    
    // 异步循环处理任务
    this.processLoop();
  }

  stop() {
    this.isRunning = false;
    console.log('[WorkerProcessor] Stopped');
  }

  private async processLoop() {
    while (this.isRunning) {
      try {
        // 尝试获取任务
        const job = await globalQueue.dequeue();
        
        if (job) {
          this.currentJob = job;
          console.log(`[WorkerProcessor] Processing job ${job.id} of type ${job.job_type}`);
          
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
      switch (job.job_type) {
        case 'monitor':
          const { pollLiveStatus } = await import('@/lib/server/monitor');
          await pollLiveStatus();
          break;
          
        case 'record':
          const { autoStartRecording } = await import('@/lib/server/recorder');
          await autoStartRecording(payload.roomId, job.session_id, payload.roomName);
          break;
          
        case 'transcribe':
          const { transcribeAudio } = await import('@/lib/server/transcribe-worker');
          await transcribeAudio(payload.audioUrl, job.session_id, job.segment_seq);
          break;
          
        case 'analysis':
        case 'final_analysis':
          const { runAnalysis } = await import('@/lib/server/analyzer');
          const isFinal = job.job_type === 'final_analysis' || payload.isFinal;
          result = await runAnalysis(job.session_id, payload.roomId, job.segment_seq, isFinal ? 'final' : 'segment');
          if (isFinal) {
            // 假设我们在终场分析完成后触发知识库质量控制
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
          result = await fetchAllSnapshotData(job.session_id, payload.roomId, job.segment_seq);
          break;
          
        case 'replay_analysis':
          const { runReplayAnalysis } = await import('@/lib/server/replay-monitor');
          // 更新会话状态为分析中
          const client = getSupabaseClient();
          await client.from('live_sessions').update({ status: 'analyzing' }).eq('id', job.session_id);
          
          // 执行录播分析
          await runReplayAnalysis(job.session_id, payload.roomId, payload.liveSpaceId);
          
          // 完成后更新状态
          await client.from('live_sessions').update({ status: 'ended' }).eq('id', job.session_id);
          break;
          
        default:
          throw new Error(`Unknown job type: ${job.job_type}`);
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
