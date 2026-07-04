/**
 * ASR (语音识别) 客户端
 * 使用本地 Whisper 模型 via @xenova/transformers (WebAssembly)
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpeg from 'fluent-ffmpeg';
import { pipeline } from '@xenova/transformers';

export class ASRClient {
  private transcriber: any = null;
  private modelName: string = 'Xenova/whisper-tiny'; // 可以使用 tiny, base, small, medium, large-v2, etc.

  constructor() {
    // 初始化是延迟加载的，首次调用 transcribe 时才会加载模型
  }

  /**
   * 确保转录器已加载
   */
  private async ensureTranscriberLoaded(): Promise<void> {
    if (this.transcriber) {
      return;
    }

    console.log(`[ASR] 正在加载 Whisper 模型: ${this.modelName}`);
    try {
      this.transcriber = await pipeline('automatic-speech-recognition', this.modelName, {
        progress_callback: (progress: any) => {
          if (progress.status === 'downloading') {
            console.log(`[ASR] 下载进度: ${progress.progress}%`);
          } else if (progress.status === 'loading') {
            console.log(`[ASR] 正在加载模型...`);
          }
        }
      });
      console.log(`[ASR] Whisper 模型 ${this.modelName} 加载成功`);
    } catch (error) {
      console.error('[ASR] 加载 Whisper 模型失败:', error);
      throw error;
    }
  }

  /**
   * 转换音频文件为 16kHz WAV 格式
   * @param inputPath 输入音频文件路径
   * @returns 转换后的临时 WAV 文件路径
   */
  private async convertAudio(inputPath: string): Promise<string> {
    const tempDir = os.tmpdir();
    const outputPath = path.join(tempDir, `whisper-convert-${Date.now()}.wav`);

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioFrequency(16000)
        .audioChannels(1)
        .format('wav')
        .on('end', () => {
          console.log(`[ASR] 音频转换完成: ${outputPath}`);
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('[ASR] 音频转换失败:', err);
          reject(err);
        })
        .save(outputPath);
    });
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

    let tempWavPath: string | null = null;
    try {
      // 加载模型
      await this.ensureTranscriberLoaded();

      // 首先将音频转换为 WAV 格式
      console.log(`[ASR] 正在转换音频文件为 WAV 格式: ${filePath}`);
      tempWavPath = await this.convertAudio(filePath);

      console.log(`[ASR] 正在使用 Whisper 模型 ${this.modelName} 转录音频`);
      
      // 使用 @xenova/transformers 进行转录
      const result = await this.transcriber(tempWavPath, {
        language: language,
        task: 'transcribe',
        return_timestamps: false,
      });

      const fullText = result.text;

      console.log(`[ASR] 转录完成，获得 ${fullText.length} 字符`);

      return fullText;
    } catch (error) {
      console.error('[ASR] 转录失败:', error);
      throw error;
    } finally {
      // 清理临时文件
      if (tempWavPath && fs.existsSync(tempWavPath)) {
        try {
          fs.unlinkSync(tempWavPath);
          console.log(`[ASR] 已删除临时文件: ${tempWavPath}`);
        } catch (unlinkError) {
          console.warn(`[ASR] 删除临时文件失败: ${tempWavPath}`, unlinkError);
        }
      }
    }
  }
}

// 导出单例
export const asrClient = new ASRClient();
