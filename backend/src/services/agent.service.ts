import { AgentCondition, IntelligenceLevel } from '../models/AgentCondition';
import { Context } from '../models/Context';
import { GlobalGuardrail } from '../models/GlobalGuardrail';
import { SessionMessage } from '../models/SessionMessage';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Prompt assembly (contract §6):
 *
 *   [condition.system_prompt_template]
 *   ## Your Intelligence Profile      <- EI block (low|high) + CI block (low|high)
 *   ## Global Guidelines              <- global_guardrails.content
 *   ## Reference Information          <- context.agent_policy
 *   ## Conversation Guidelines        <- stay within context.title; first message = the situation;
 *                                        2-4 sentences; never say you cannot help
 */
export class AgentService {
  static buildSystemPrompt(
    condition: AgentCondition,
    context: Context,
    guardrails: GlobalGuardrail | null
  ): string {
    let prompt = condition.system_prompt_template.trim();

    prompt += `\n\n## Your Intelligence Profile\n`;
    prompt += `You have ${condition.emotional_intelligence} emotional intelligence and ${condition.cognitive_intelligence} cognitive intelligence.\n\n`;
    prompt += `${this.getEmotionalIntelligenceGuidance(condition.emotional_intelligence)}\n\n`;
    prompt += `${this.getCognitiveIntelligenceGuidance(condition.cognitive_intelligence)}\n\n`;

    if (guardrails) {
      prompt += `## Global Guidelines\n${guardrails.content.trim()}\n\n`;
    }

    prompt += `## Reference Information\n${context.agent_policy.trim()}\n\n`;

    prompt += `## Conversation Guidelines\n`;
    prompt += `- Stay within the scope of the current situation: "${context.title}"\n`;
    prompt += `- The customer's first message describes their situation; treat it as the context for the entire conversation and respond to it directly\n`;
    prompt += `- Rely on the Reference Information above for every policy, record, or remedy you mention; do not invent details that are not supported by it\n`;
    prompt += `- If the customer raises something unrelated to this situation, politely steer the conversation back to it\n`;
    prompt += `- Keep responses concise but complete (aim for 2-4 sentences)\n`;
    prompt += `- Always provide actionable next steps when possible\n`;
    prompt += `- You MUST respond to every customer message; be conversational and natural, matching your intelligence profile\n`;
    prompt += `- Never say you cannot help or that you don't know — always provide a helpful response within the scope of this situation\n`;

    return prompt;
  }

  /**
   * Full OpenAI message list: system prompt, the whole transcript so far
   * (agent -> assistant), then the new participant message.
   */
  static buildMessages(
    systemPrompt: string,
    history: SessionMessage[],
    newUserMessage: string
  ): ChatMessage[] {
    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }];
    for (const message of history) {
      messages.push({
        role: message.role === 'user' ? 'user' : 'assistant',
        content: message.content,
      });
    }
    messages.push({ role: 'user', content: newUserMessage });
    return messages;
  }

  private static getEmotionalIntelligenceGuidance(level: IntelligenceLevel): string {
    switch (level) {
      case 'low':
        return `**Emotional Intelligence: Low**
- You are direct and factual in your communication
- Focus on solving problems efficiently rather than emotional support
- You may come across as less warm or empathetic
- Prioritize accuracy and speed over emotional connection
- Use straightforward language without emotional nuance`;
      case 'high':
        return `**Emotional Intelligence: High**
- You are warm, empathetic, and emotionally attuned
- Focus on understanding and validating customer feelings
- Use emotionally intelligent language and show genuine care
- Adapt your communication style to match the customer's emotional state
- Prioritize making customers feel heard and valued`;
      default:
        return '';
    }
  }

  private static getCognitiveIntelligenceGuidance(level: IntelligenceLevel): string {
    switch (level) {
      case 'low':
        return `**Cognitive Intelligence: Low**
- Provide simple, straightforward responses
- Stick to basic scripts and standard responses
- You may need to ask clarifying questions for complex issues
- Focus on fundamental solutions rather than advanced problem-solving
- Use simple language and avoid technical jargon`;
      case 'high':
        return `**Cognitive Intelligence: High**
- You excel at understanding complex issues and providing detailed solutions
- Provide precise, data-driven, and analytical responses
- You can handle technical details and advanced problem-solving
- Use sophisticated reasoning and comprehensive analysis
- Offer detailed explanations and multiple solution approaches`;
      default:
        return '';
    }
  }
}
