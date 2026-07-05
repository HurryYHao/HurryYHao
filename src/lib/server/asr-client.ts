/**
 * ASR (语音识别) 客户端
 * 使用 coze-coding-dev-sdk 的 ASRClient（豆包语音识别服务）
 *
 * 支持 MP3/WAV/OGG OPUS/M4A，≤2小时、≤100MB
 */
import { ASRClient as CozeASRClient, Config } from 'coze-coding-dev-sdk';
import fs from 'fs';

class ASRService {
  private client: CozeASRClient;

  constructor() {
    const config = new Config();
    this.client = new CozeASRClient(config);
  }

  /**
   * 转录音频文件
   * @param filePath 音频文件路径
   * @returns 转录文本
   */
  async transcribe(filePath: string): Promise<string> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }

    try {
      const audioBuffer = fs.readFileSync(filePath);
      const base64Audio = audioBuffer.toString('base64');

      console.log(`[ASR] 豆包语音识别: file=${filePath}, size=${audioBuffer.length} bytes, base64=${base64Audio.length}`);

      const result = await this.client.recognize({
        uid: 'live-analysis-system',
        base64Data: base64Audio,
      });

      console.log(`[ASR] 转录完成，获得 ${result.text.length} 字符${result.duration ? `，时长 ${Math.round(result.duration / 1000)}秒` : ''}`);

      return result.text;
    } catch (error) {
      console.error('[ASR] 转录失败:', error);
      throw error;
    }
  }

  /**
   * 通过 URL 转录音频
   * @param url 音频文件 URL
   * @returns 转录文本
   */
  async transcribeUrl(url: string): Promise<string> {
    try {
      console.log(`[ASR] 豆包语音识别(URL): ${url}`);

      const result = await this.client.recognize({
        uid: 'live-analysis-system',
        url,
      });

      console.log(`[ASR] 转录完成，获得 ${result.text.length} 字符`);

      return result.text;
    } catch (error) {
      console.error('[ASR] URL转录失败:', error);
      throw error;
    }
  }
}

// 导出单例
export const asrClient = new ASRService();
