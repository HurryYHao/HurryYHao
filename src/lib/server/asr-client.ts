/**
 * ASR (语音识别) 客户端
 * 使用腾讯云语音识别服务
 */
import fs from 'fs';
import path from 'path';
import { CONFIG } from './config';

// 腾讯云 SDK
const tencentcloud = require('tencentcloud-sdk-nodejs');
const AsrClient = tencentcloud.asr.v20190614.Client;

export class ASRClient {
  private client: any;

  constructor() {
    // 初始化腾讯云客户端
    if (CONFIG.tencentCloud.secretId && CONFIG.tencentCloud.secretKey) {
      const clientConfig = {
        credential: {
          secretId: CONFIG.tencentCloud.secretId,
          secretKey: CONFIG.tencentCloud.secretKey,
        },
        region: CONFIG.tencentCloud.region,
        profile: {
          httpProfile: {
            endpoint: 'asr.tencentcloudapi.com',
          },
        },
      };
      this.client = new AsrClient(clientConfig);
    }
  }

  /**
   * 检查客户端是否已初始化
   */
  isInitialized(): boolean {
    return !!this.client;
  }

  /**
   * 转录音频文件
   * @param filePath 音频文件路径
   * @param language 语言 (可选，默认 'zh' 中文)
   * @returns 转录文本
   */
  async transcribe(filePath: string, language: string = 'zh'): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    if (!this.client) {
      throw new Error('Tencent Cloud ASR is not configured. Please set TENCENTCLOUD_SECRET_ID and TENCENTCLOUD_SECRET_KEY');
    }

    try {
      console.log(`[ASR] 正在调用腾讯云 ASR 转录音频: ${filePath}`);

      // 读取音频文件
      let audioBuffer = fs.readFileSync(filePath);
      let base64Audio = audioBuffer.toString('base64');
      const BASE64_LIMIT = 5242880; // 腾讯云 Data 字段 base64 上限 5MB

      // 如果 base64 后超限，先用 ffmpeg 压缩
      if (base64Audio.length > BASE64_LIMIT) {
        console.log(`[ASR] 音频 base64 长度 ${base64Audio.length} 超过限制 ${BASE64_LIMIT}，开始压缩...`);
        const compressedPath = await this.compressAudio(filePath);
        audioBuffer = fs.readFileSync(compressedPath);
        base64Audio = audioBuffer.toString('base64');
        console.log(`[ASR] 压缩后 base64 长度: ${base64Audio.length}`);

        // 清理临时压缩文件
        try { fs.unlinkSync(compressedPath); } catch {}
      }

      const dataLen = audioBuffer.length;

      console.log(`[ASR] 音频文件读取成功: size=${dataLen} bytes, base64 length=${base64Audio.length}`);

      // 调用腾讯云语音识别 API - 使用录音文件识别
      const params = {
        EngineModelType: '16k_zh', // 16k中文通用
        ChannelNum: 1,
        ResTextFormat: 0,
        SourceType: 1,
        Data: base64Audio,
        DataLen: dataLen,
        ConvertNumMode: 1, // 数字转换模式
      };

      console.log(`[ASR] 发送 CreateRecTask 请求, params keys: ${Object.keys(params).join(', ')}`);

      const response = await this.client.CreateRecTask(params);
      
      // 获取任务ID
      const taskId = response.Data.TaskId;
      if (!taskId) {
        throw new Error('Failed to create ASR task');
      }

      console.log(`[ASR] 语音识别任务已创建，任务ID: ${taskId}`);

      // 轮询任务结果
      let resultText = await this.pollTaskResult(taskId);

      console.log(`[ASR] 转录完成，获得 ${resultText.length} 字符`);

      return resultText;
    } catch (error) {
      console.error('[ASR] 转录失败:', error);
      throw error;
    }
  }

  /**
   * 压缩音频文件以适应 ASR 接口大小限制
   * 逐步降低码率直到 base64 后不超过 5MB
   */
  private async compressAudio(filePath: string): Promise<string> {
    const { execSync } = require('child_process') as typeof import('child_process');
    const os = require('os');
    const BASE64_LIMIT = 5242880;
    // 从低到高尝试不同码率（越低文件越小）
    const bitrates = ['16k', '12k', '8k'];

    for (const bitrate of bitrates) {
      const outputPath = path.join(os.tmpdir(), `asr_compressed_${Date.now()}.mp3`);
      try {
        execSync(
          `ffmpeg -i "${filePath}" -vn -ac 1 -ar 16000 -b:a ${bitrate} -y "${outputPath}"`,
          { stdio: 'pipe', timeout: 30000 }
        );
        const compressed = fs.readFileSync(outputPath);
        const b64len = Math.ceil(compressed.length * 4 / 3);
        console.log(`[ASR] 压缩尝试 bitrate=${bitrate}: base64~${b64len}, 文件=${compressed.length} bytes`);
        if (b64len <= BASE64_LIMIT) {
          console.log(`[ASR] 压缩成功: bitrate=${bitrate}, base64~${b64len}`);
          return outputPath;
        }
        // 仍然超限，清理后尝试更低码率
        try { fs.unlinkSync(outputPath); } catch {}
      } catch (err) {
        console.warn(`[ASR] 压缩失败 bitrate=${bitrate}:`, err instanceof Error ? err.message : err);
        try { fs.unlinkSync(outputPath); } catch {}
      }
    }

    throw new Error('音频文件过大，压缩后仍超过 ASR 接口限制（5MB base64）');
  }

  /**
   * 轮询任务结果
   * @param taskId 任务ID
   * @returns 转录文本
   */
  private async pollTaskResult(taskId: number): Promise<string> {
    const maxRetries = 60; // 最多轮询60次，每次3秒，总共3分钟
    let retries = 0;

    while (retries < maxRetries) {
      retries++;
      
      // 等待3秒
      await new Promise(resolve => setTimeout(resolve, 3000));

      // 查询任务状态
      const response = await this.client.DescribeTaskStatus({ TaskId: taskId });
      const taskStatus = response.Data.Status;

      console.log(`[ASR] 任务状态查询 (${retries}/${maxRetries}): ${taskStatus}`);

      if (taskStatus === 2) {
        // 任务成功完成
        return response.Data.Result || '';
      } else if (taskStatus === 3) {
        // 任务失败
        const errorMsg = response.Data.ErrorMsg || 'Unknown error';
        throw new Error(`ASR task failed: ${errorMsg}`);
      }
      // 其他状态继续轮询 (0:等待处理, 1:处理中)
    }

    throw new Error('ASR task timed out');
  }
}

// 导出单例
export const asrClient = new ASRClient();
