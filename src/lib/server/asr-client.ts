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
      const audioBuffer = fs.readFileSync(filePath);
      const base64Audio = audioBuffer.toString('base64');
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
