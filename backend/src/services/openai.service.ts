import { getOpenAIClient, OPENAI_MAX_RETRIES, OPENAI_TIMEOUT_MS } from '../config/openai';
import { getOpenAIModel, isMockOpenAI } from '../config/study';
import { AgentUnavailableError } from '../utils/errors';
import { ChatMessage } from './agent.service';

export const MOCK_MODEL_NAME = 'mock';

export interface AgentReply {
  content: string;
  model: string;
}

export class OpenAIService {
  /** Model name stamped onto sessions: the configured model, or 'mock' when MOCK_OPENAI=true. */
  static getModelName(): string {
    return isMockOpenAI() ? MOCK_MODEL_NAME : getOpenAIModel();
  }

  /**
   * Generate the agent's reply for an assembled message list.
   * Any failure (network, API error, timeout, empty completion) throws AgentUnavailableError;
   * the caller persists nothing in that case. There is no output substring filter.
   */
  static async generateReply(messages: ChatMessage[]): Promise<AgentReply> {
    if (isMockOpenAI()) {
      return { content: OpenAIService.mockReply(messages), model: MOCK_MODEL_NAME };
    }

    const model = getOpenAIModel();
    try {
      const completion = await getOpenAIClient().chat.completions.create(
        {
          model,
          messages,
          temperature: 0.7,
          max_tokens: 500,
          presence_penalty: 0.1,
          frequency_penalty: 0.1,
        },
        // Explicit per-request options: a single attempt bounded by the 30 s contract timeout.
        { timeout: OPENAI_TIMEOUT_MS, maxRetries: OPENAI_MAX_RETRIES }
      );

      const content = completion.choices[0]?.message?.content?.trim();
      if (!content) {
        console.error('OpenAI returned an empty completion', { model });
        throw new AgentUnavailableError();
      }

      return { content, model: completion.model || model };
    } catch (error: any) {
      if (error instanceof AgentUnavailableError) {
        throw error;
      }
      if (process.env.NODE_ENV === 'development') {
        console.error('OpenAI API error:', {
          name: error.name,
          message: error.message,
          status: error.status,
          code: error.code,
        });
      } else {
        console.error('OpenAI API error:', error.name, error.status || error.code || error.message);
      }
      throw new AgentUnavailableError();
    }
  }

  /** Deterministic reply used by tests and local development: "[mock reply to: <first 60 chars>]". */
  static mockReply(messages: ChatMessage[]): string {
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const snippet = (lastUser?.content ?? '').slice(0, 60);
    return `[mock reply to: ${snippet}]`;
  }
}
