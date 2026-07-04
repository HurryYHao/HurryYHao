// LLM客户端 - 使用 coze-coding-dev-sdk
import { LLMClient as CozeLLMClient, Config as CozeConfig } from 'coze-coding-dev-sdk';

// 使用SDK的Message类型定义
type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: 'text' | 'image_url' | 'video_url'; text?: string; image_url?: { url: string; detail?: 'high' | 'low' }; video_url?: { url: string; fps?: number | null } }>;
};

type InvokeOptions = {
  model?: string;
  temperature?: number;
  thinking?: 'enabled' | 'disabled';
};

// 支持的模型列表
const AVAILABLE_MODELS = [
  'doubao-seed-2-0-pro-260215',
  'doubao-seed-2-0-lite-260215',
  'doubao-seed-2-0-mini-260215',
  'doubao-seed-1-8-251228',
  'deepseek-v3-2-251201',
  'kimi-k2-5-260127',
  'glm-5-0-260211',
  'glm-5-turbo-260316',
  'glm-4-7-251222',
  'minimax-m2-5-260212',
  'minimax-m2-7-260318',
  'qwen-3-5-plus-260215',
] as const;

/**
 * LLM客户端 - 基于 coze-coding-dev-sdk
 */
class UniversalLLMClient {
  private client: CozeLLMClient;
  private currentModel?: string;

  constructor() {
    const config = new CozeConfig();
    this.client = new CozeLLMClient(config);
  }

  async initFromDb() {
    // 从数据库加载配置的功能暂时保留，但不再使用
    // coze-coding-dev-sdk的配置由环境变量自动管理
    return this;
  }

  /**
   * 强制指定模型
   */
  setForceModel(_provider: string, model: string) {
    this.currentModel = model;
    return this;
  }

  /**
   * 调用LLM（非流式）
   */
  async invoke(messages: Message[], options: InvokeOptions = {}): Promise<string> {
    const model = this.currentModel || options.model || 'doubao-seed-2-0-pro-260215';
    const temperature = options.temperature ?? 0.7;

    try {
      console.log(`[LLM] 调用模型: ${model}, temperature: ${temperature}`);
      
      const response = await this.client.invoke(messages, {
        model,
        temperature,
        thinking: options.thinking || 'disabled',
      });

      if (!response || !response.content) {
        throw new Error('返回了空响应');
      }

      console.log(`[LLM] 成功返回，长度: ${response.content.length}`);
      return response.content;
    } catch (e) {
      console.error('[LLM] 调用失败:', e);
      throw new Error(`LLM调用失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 调用LLM（流式）
   */
  async *stream(messages: Message[], options: InvokeOptions = {}): AsyncGenerator<{ content: string }> {
    const model = this.currentModel || options.model || 'doubao-seed-2-0-pro-260215';
    const temperature = options.temperature ?? 0.7;

    try {
      console.log(`[LLM] 流式调用模型: ${model}, temperature: ${temperature}`);
      
      const streamGenerator = this.client.stream(messages, {
        model,
        temperature,
        thinking: options.thinking || 'disabled',
      });

      for await (const chunk of streamGenerator) {
        if (chunk && chunk.content) {
          yield { content: chunk.content.toString() };
        }
      }

      console.log(`[LLM] 流式调用完成`);
    } catch (e) {
      console.error('[LLM] 流式调用失败:', e);
      throw new Error(`LLM流式调用失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * 获取可用模型列表
   */
  getAvailableModels(): readonly string[] {
    return AVAILABLE_MODELS;
  }

  /**
   * 获取支持的provider列表（现在只有一个）
   */
  static getProviders(): string[] {
    return ['coze'];
  }
}

// 导出AI_PROVIDERS兼容性常量（废弃，只保留COZE）
const AI_PROVIDERS = {
  COZE: 'coze',
};

export { UniversalLLMClient, AI_PROVIDERS, AVAILABLE_MODELS };
export type { Message, InvokeOptions };