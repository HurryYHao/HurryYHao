import { CONFIG, AI_PROVIDERS, AVAILABLE_MODELS } from './config';
import { LLMClient as CozeLLMClient, Config as CozeConfig } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string; detail?: string } }>;
};

type InvokeOptions = {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
};

class UniversalLLMClient {
  private provider: string;
  private config: any;

  constructor(provider?: string) {
    this.provider = provider || CONFIG.ai.defaultProvider;
    this.config = CONFIG.ai;
  }

  async initFromDb() {
    try {
      const client = getSupabaseClient();
      const { data } = await client
        .from('system_config')
        .select('config_value')
        .eq('config_key', 'ai_settings')
        .maybeSingle();
      
      if (data?.config_value) {
        const settings = JSON.parse(data.config_value);
        if (settings.provider) this.provider = settings.provider;
        if (settings.model) {
          if (!this.config[this.provider]) this.config[this.provider] = {};
          this.config[this.provider].model = settings.model;
        }
      }
    } catch (e) {
      console.warn('Failed to load AI settings from DB', e);
    }
    return this;
  }

  async invoke(messages: Message[], options: InvokeOptions = {}): Promise<string> {
    switch (this.provider) {
      case AI_PROVIDERS.ZHENJING:
        return this.invokeZhenjing(messages, options);
      case AI_PROVIDERS.COZE:
        return this.invokeCoze(messages, options);
      case AI_PROVIDERS.OPENAI:
        return this.invokeOpenAI(messages, options);
      default:
        throw new Error(`Unsupported AI provider: ${this.provider}`);
    }
  }

  private async invokeZhenjing(messages: Message[], options: InvokeOptions = {}): Promise<string> {
    const { apiKey, baseUrl, model: defaultModel } = this.config.zhenjing;
    
    if (!apiKey) {
      throw new Error('Zhenjing API key is not configured');
    }

    const model = options.model || defaultModel;
    const url = `${baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens,
        stream: options.stream || false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`Zhenjing API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  private async invokeCoze(messages: Message[], options: InvokeOptions = {}): Promise<string> {
    const config = new CozeConfig();
    const client = new CozeLLMClient(config);

    const response = await client.invoke(messages as any, {
      model: options.model || this.config.coze.model,
      temperature: options.temperature || 0.7,
    });

    return response.content?.trim() || '';
  }

  private async invokeOpenAI(messages: Message[], options: InvokeOptions = {}): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';

    if (!apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const url = `${baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens,
        stream: options.stream || false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || '';
  }

  getAvailableModels(): readonly string[] {
    return AVAILABLE_MODELS[this.provider as keyof typeof AVAILABLE_MODELS] || [];
  }

  static getProviders(): string[] {
    return Object.values(AI_PROVIDERS);
  }

  async *stream(messages: Message[], options: InvokeOptions = {}): AsyncGenerator<{ content: string }> {
    switch (this.provider) {
      case AI_PROVIDERS.ZHENJING:
        yield* this.streamZhenjing(messages, options);
        break;
      case AI_PROVIDERS.COZE:
        yield* this.streamCoze(messages, options);
        break;
      case AI_PROVIDERS.OPENAI:
        yield* this.streamOpenAI(messages, options);
        break;
      default:
        throw new Error(`Unsupported AI provider: ${this.provider}`);
    }
  }

  private async *streamOpenAICompatible(url: string, apiKey: string, model: string, messages: Message[], options: InvokeOptions = {}): AsyncGenerator<{ content: string }> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`API error: ${response.status} - ${errorText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim() === '') continue;
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices[0]?.delta?.content;
            if (content) {
              yield { content };
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
    }
  }

  private async *streamZhenjing(messages: Message[], options: InvokeOptions = {}): AsyncGenerator<{ content: string }> {
    const { apiKey, baseUrl, model: defaultModel } = this.config.zhenjing;
    if (!apiKey) throw new Error('Zhenjing API key is not configured');
    const model = options.model || defaultModel;
    const url = `${baseUrl}/chat/completions`;
    yield* this.streamOpenAICompatible(url, apiKey, model, messages, options);
  }

  private async *streamOpenAI(messages: Message[], options: InvokeOptions = {}): AsyncGenerator<{ content: string }> {
    const apiKey = process.env.OPENAI_API_KEY || '';
    const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
    const model = options.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
    if (!apiKey) throw new Error('OpenAI API key is not configured');
    const url = `${baseUrl}/chat/completions`;
    yield* this.streamOpenAICompatible(url, apiKey, model, messages, options);
  }

  private async *streamCoze(messages: Message[], options: InvokeOptions = {}): AsyncGenerator<{ content: string }> {
    const config = new CozeConfig();
    const client = new CozeLLMClient(config);
    const stream = await client.stream(messages as any, {
      model: options.model || this.config.coze.model,
      temperature: options.temperature || 0.7,
    });
    for await (const chunk of stream) {
      if (chunk.content) {
        yield { content: chunk.content.toString() };
      }
    }
  }
}

export { UniversalLLMClient, AI_PROVIDERS, AVAILABLE_MODELS };
export type { Message, InvokeOptions };
