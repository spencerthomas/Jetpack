import { z } from 'zod';
import { BaseMessage, HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProviderConfig {
  model: string;
  apiKey?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;

  /**
   * Send a chat completion request
   */
  chat(messages: ChatMessage[]): Promise<string>;

  /**
   * Get structured output using a Zod schema
   */
  structuredOutput<T>(
    messages: ChatMessage[],
    schema: z.ZodSchema<T>,
    schemaName: string
  ): Promise<T>;
}

/**
 * Convert ChatMessage array to LangChain BaseMessage array
 */
export function toBaseMessages(messages: ChatMessage[]): BaseMessage[] {
  return messages.map(msg => {
    switch (msg.role) {
      case 'system':
        return new SystemMessage(msg.content);
      case 'user':
        return new HumanMessage(msg.content);
      case 'assistant':
        return new AIMessage(msg.content);
    }
  });
}

export const LLMProviderConfigSchema = z.object({
  provider: z.enum(['claude', 'openai', 'ollama']),
  model: z.string(),
  apiKey: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().positive().optional(),
});

export type LLMProviderConfigInput = z.infer<typeof LLMProviderConfigSchema>;
