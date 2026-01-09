import { z } from 'zod';
import { ChatAnthropic } from '@langchain/anthropic';
import { LLMProvider, LLMProviderConfig, ChatMessage, toBaseMessages } from './LLMProvider';

export class ClaudeProvider implements LLMProvider {
  readonly name = 'claude';
  readonly model: string;
  private client: ChatAnthropic;

  constructor(config: LLMProviderConfig) {
    this.model = config.model;
    this.client = new ChatAnthropic({
      model: config.model,
      anthropicApiKey: config.apiKey || process.env.ANTHROPIC_API_KEY,
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 4096,
    });
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const baseMessages = toBaseMessages(messages);
    const response = await this.client.invoke(baseMessages);
    return typeof response.content === 'string'
      ? response.content
      : response.content.map(c => ('text' in c ? c.text : '')).join('');
  }

  async structuredOutput<T>(
    messages: ChatMessage[],
    schema: z.ZodSchema<T>,
    schemaName: string
  ): Promise<T> {
    // Use withStructuredOutput - cast to any to avoid deep type inference issues
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const structuredClient = (this.client as any).withStructuredOutput(schema, {
      name: schemaName,
    });
    const baseMessages = toBaseMessages(messages);
    const response = await structuredClient.invoke(baseMessages);
    return response as T;
  }
}
