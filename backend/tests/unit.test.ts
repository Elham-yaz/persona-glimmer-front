import { createHash } from 'crypto';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { AgentService } from '../src/services/agent.service';
import { OpenAIService } from '../src/services/openai.service';
import { AgentUnavailableError } from '../src/utils/errors';
import { csvField, csvLine } from '../src/controllers/admin.controller';
import { chooseBalancedCell, chooseRandomCell } from '../src/services/assignment.service';
import { parseDatabaseTarget } from '../src/migrations/reset-database';
import { generateCompletionCode } from '../src/utils/completionCode';
import { agentConditions, SHARED_SYSTEM_PROMPT_TEMPLATE } from '../src/seeds/agent_conditions.seed';
import { contexts, INFORMATIONAL_CONTEXT_PLACEHOLDER_NOTE } from '../src/seeds/contexts.seed';
import { surveyQuestions } from '../src/seeds/survey_questions.seed';

// Fake OpenAI SDK so the non-mock code path can be exercised without network access.
const createMock = vi.fn();
const clientOptions: unknown[] = [];
vi.mock('openai', () => ({
  default: class FakeOpenAI {
    chat = { completions: { create: createMock } };
    constructor(options: unknown) {
      clientOptions.push(options);
    }
  },
}));

afterEach(() => {
  process.env.MOCK_OPENAI = 'true';
  delete process.env.OPENAI_API_KEY;
  createMock.mockReset();
});

const condition = (ei: 'low' | 'high', ci: 'low' | 'high') => ({
  id: 1,
  code: 'x',
  emotional_intelligence: ei,
  cognitive_intelligence: ci,
  display_name: 'Alex',
  system_prompt_template: SHARED_SYSTEM_PROMPT_TEMPLATE,
  created_at: new Date(),
  updated_at: new Date(),
});

const context = { ...contexts[0], created_at: new Date(), updated_at: new Date() };
const guardrails = { id: 1, title: 'G', content: 'GUARDRAIL CONTENT', created_at: new Date(), updated_at: new Date() };

describe('AgentService.buildSystemPrompt', () => {
  it('assembles the sections in contract order', () => {
    const prompt = AgentService.buildSystemPrompt(condition('high', 'low'), context, guardrails);
    const order = [
      SHARED_SYSTEM_PROMPT_TEMPLATE,
      '## Your Intelligence Profile',
      '**Emotional Intelligence: High**',
      '**Cognitive Intelligence: Low**',
      '## Global Guidelines',
      'GUARDRAIL CONTENT',
      '## Reference Information',
      context.agent_policy,
      '## Conversation Guidelines',
      `"${context.title}"`,
      '2-4 sentences',
      'Never say you cannot help',
    ];
    let position = -1;
    for (const marker of order) {
      const next = prompt.indexOf(marker, position + 1);
      expect(next, `missing or out of order: ${marker}`).toBeGreaterThan(position);
      position = next;
    }
    expect(prompt).not.toMatch(/medium/i);
    expect(prompt).not.toContain('Topic-Specific Policy');
  });

  it('uses the right guidance block for each of the four conditions', () => {
    for (const c of agentConditions) {
      const prompt = AgentService.buildSystemPrompt(
        condition(c.emotional_intelligence, c.cognitive_intelligence),
        context,
        guardrails
      );
      const ei = c.emotional_intelligence === 'high' ? 'High' : 'Low';
      const ci = c.cognitive_intelligence === 'high' ? 'High' : 'Low';
      expect(prompt).toContain(`**Emotional Intelligence: ${ei}**`);
      expect(prompt).toContain(`**Cognitive Intelligence: ${ci}**`);
    }
  });

  it('shared template contains no EI/CI wording (manipulation lives in the guidance blocks only)', () => {
    expect(SHARED_SYSTEM_PROMPT_TEMPLATE).not.toMatch(/emotional|cognitive|empath|analytical|warm/i);
  });

  it('builds the message list with the full transcript, agent -> assistant', () => {
    const history = [
      { role: 'user', content: 'u1' },
      { role: 'agent', content: 'a1' },
    ] as any[];
    const messages = AgentService.buildMessages('SYS', history, 'u2');
    expect(messages).toEqual([
      { role: 'system', content: 'SYS' },
      { role: 'user', content: 'u1' },
      { role: 'assistant', content: 'a1' },
      { role: 'user', content: 'u2' },
    ]);
  });
});

describe('OpenAIService', () => {
  it('returns the deterministic mock reply when MOCK_OPENAI=true', async () => {
    const long = 'x'.repeat(100);
    const reply = await OpenAIService.generateReply([
      { role: 'system', content: 's' },
      { role: 'user', content: long },
    ]);
    expect(reply).toEqual({ content: `[mock reply to: ${'x'.repeat(60)}]`, model: 'mock' });
    expect(OpenAIService.getModelName()).toBe('mock');
  });

  it('stamps the configured model name when not mocked', () => {
    process.env.MOCK_OPENAI = 'false';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    expect(OpenAIService.getModelName()).toBe('gpt-4o-mini');
    delete process.env.OPENAI_MODEL;
  });

  it('treats an empty completion as AGENT_UNAVAILABLE and applies no output filter', async () => {
    process.env.MOCK_OPENAI = 'false';
    process.env.OPENAI_API_KEY = 'sk-test';
    const messages = [{ role: 'user' as const, content: 'hello' }];

    createMock.mockResolvedValueOnce({ choices: [{ message: { content: '   ' } }], model: 'gpt-4o-mini' });
    await expect(OpenAIService.generateReply(messages)).rejects.toBeInstanceOf(AgentUnavailableError);

    createMock.mockRejectedValueOnce(Object.assign(new Error('rate limited'), { status: 429 }));
    await expect(OpenAIService.generateReply(messages)).rejects.toBeInstanceOf(AgentUnavailableError);

    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: 'We take hacking and illegal use seriously.' } }],
      model: 'gpt-4o-mini-2024',
    });
    const ok = await OpenAIService.generateReply(messages);
    expect(ok).toEqual({ content: 'We take hacking and illegal use seriously.', model: 'gpt-4o-mini-2024' });

    const [params, options] = createMock.mock.calls[2];
    expect(params).toMatchObject({ temperature: 0.7, max_tokens: 500, presence_penalty: 0.1, frequency_penalty: 0.1 });
    // A single attempt bounded by the 30 s contract timeout: the SDK's default of two
    // retries would otherwise stretch a failing call past the frontend's 60 s timeout.
    expect(options).toEqual({ timeout: 30000, maxRetries: 0 });
    expect(clientOptions.at(-1)).toMatchObject({ apiKey: 'sk-test', timeout: 30000, maxRetries: 0 });
  });
});

describe('assignment helpers', () => {
  const cells = [
    { agent_condition_id: 1, context_id: 1, started: 3 },
    { agent_condition_id: 1, context_id: 2, started: 1 },
    { agent_condition_id: 2, context_id: 1, started: 1 },
    { agent_condition_id: 2, context_id: 2, started: 5 },
  ];

  it('balanced picks only among the least-populated cells', () => {
    for (let i = 0; i < 50; i++) {
      const chosen = chooseBalancedCell(cells);
      expect([
        { agentConditionId: 1, contextId: 2 },
        { agentConditionId: 2, contextId: 1 },
      ]).toContainEqual(chosen);
    }
  });

  it('random picks any cell', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const c = chooseRandomCell(cells);
      seen.add(`${c.agentConditionId}-${c.contextId}`);
    }
    expect(seen.size).toBe(4);
  });
});

describe('small utilities', () => {
  it('csv quoting follows RFC 4180', () => {
    expect(csvField('plain')).toBe('plain');
    expect(csvField('a,b')).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField(null)).toBe('');
    expect(csvField(true)).toBe('true');
    expect(csvField(new Date('2026-01-02T03:04:05.000Z'))).toBe('2026-01-02T03:04:05.000Z');
    expect(csvLine(['a', 1, null])).toBe('a,1,\r\n');
  });

  it('csv neutralizes spreadsheet formulas in strings (OWASP CSV injection)', () => {
    expect(csvField('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    expect(csvField('+1-2')).toBe(`"'+1-2"`);
    expect(csvField('-1')).toBe(`"'-1"`);
    expect(csvField('@SUM(1)')).toBe(`"'@SUM(1)"`);
    expect(csvField('\tcmd')).toBe(`"'\tcmd"`);
    expect(csvField('\rcmd')).toBe(`"'\rcmd"`);
    // Only a leading trigger character is neutralized; other text is untouched.
    expect(csvField('a=b')).toBe('a=b');
    expect(csvField(' =1')).toBe(' =1');
    expect(csvField('R_2abc-def')).toBe('R_2abc-def');
    // Non-strings cannot carry formulas and keep their exact value.
    expect(csvField(-1)).toBe('-1');
    expect(csvField(0)).toBe('0');
    expect(csvField(false)).toBe('false');
    expect(csvLine(['=cmd', -3, 'plain'])).toBe(`"'=cmd",-3,plain\r\n`);
  });

  it('completion codes are 5-digit integers', () => {
    for (let i = 0; i < 1000; i++) {
      const code = generateCompletionCode();
      expect(code).toBeGreaterThanOrEqual(10000);
      expect(code).toBeLessThanOrEqual(99999);
      expect(Number.isInteger(code)).toBe(true);
    }
  });

  it('parses the reset target from DATABASE_URL', () => {
    expect(parseDatabaseTarget('postgresql://user:pw@db.example.com:5432/prod_db?sslmode=require')).toEqual({
      host: 'db.example.com',
      database: 'prod_db',
    });
    expect(parseDatabaseTarget('postgresql://localhost:5432/persona_glimmer_test')).toEqual({
      host: 'localhost',
      database: 'persona_glimmer_test',
    });
    expect(() => parseDatabaseTarget(undefined)).toThrow();
    expect(() => parseDatabaseTarget('postgresql://localhost:5432/')).toThrow();
  });

  it('informational context is a placeholder in code only, and its policy is purely factual', () => {
    const info = contexts.find((c) => c.code === 'food_informational')!;
    expect(INFORMATIONAL_CONTEXT_PLACEHOLDER_NOTE).toMatch(/^PLACEHOLDER — replace with the team's document/);

    // agent_policy is pasted verbatim into the system prompt and participant_scenario is shown
    // to the participant: neither may tell the model (or the participant) that the material
    // is a placeholder, or the agent can break role and reveal the study artifice.
    const meta = /placeholder|fabricated|fictional|pilot test/i;
    expect(info.agent_policy).not.toMatch(meta);
    expect(info.participant_scenario).not.toMatch(meta);
    expect(info.title).not.toMatch(meta);

    // Reference-document shape, anchored on the order number — never on a customer name.
    expect(info.agent_policy.startsWith('FOOD DELIVERY SUPPORT — ORDER INFORMATION REFERENCE')).toBe(true);
    expect(info.agent_policy).toContain('FD-83921');
    expect(info.participant_scenario).toContain('FD-83921');
    expect(info.agent_policy).not.toMatch(/\bname\b/i);
    expect(info.scenario_type).toBe('informational');
    expect(info.participant_scenario).toMatch(/^You /);

    // The control context has no service failure, and the EI manipulation lives ONLY in the
    // condition guidance blocks: the policy must carry no emotional-support directives and no
    // complaint-remediation vocabulary.
    expect(info.agent_policy).not.toMatch(/acknowledge|validate|empathi|reassur|apolog|refund|credit/i);

    // Times of day and relative times only — no weekdays or absolute calendar dates
    // (the earlier control-context placeholder shipped with wrong weekdays).
    const weekday = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
    const month = /\b(january|february|march|april|june|july|august|september|october|november|december)\b/i; // 'may' omitted: modal verb
    const year = /\b\d{4}\b/;
    for (const text of [info.agent_policy, info.participant_scenario]) {
      expect(text).not.toMatch(weekday);
      expect(text).not.toMatch(month);
      expect(text).not.toMatch(year);
    }

    const infoContext = { ...info, created_at: new Date(), updated_at: new Date() };
    for (const c of agentConditions) {
      const prompt = AgentService.buildSystemPrompt(
        condition(c.emotional_intelligence, c.cognitive_intelligence),
        infoContext,
        guardrails
      );
      expect(prompt).not.toMatch(meta);
      expect(prompt).toContain('## Reference Information\nFOOD DELIVERY SUPPORT — ORDER INFORMATION REFERENCE');
    }
  });

  it('food contexts 1-2 and the 16 survey items are verbatim copies of the baseline (commit 4116767)', () => {
    // sha256 over JSON of the baseline fields, computed from
    //   git show 4116767:backend/src/seeds/topics.seed.ts   (ids 1-2: title, domain, scenario_type,
    //     stimulus_text -> participant_scenario, topic_specific_policy -> agent_policy)
    //   git show 4116767:src/data/mockData.ts               (postTopicSurveyQuestions: id, text, category)
    // Regenerate the constants only if the research team deliberately changes the content.
    const sha = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
    const snapshot = (id: number) => {
      const c = contexts.find((x) => x.id === id)!;
      return {
        title: c.title,
        domain: c.domain,
        scenario_type: c.scenario_type,
        participant_scenario: c.participant_scenario,
        agent_policy: c.agent_policy,
      };
    };
    expect(contexts.map((c) => [c.id, c.code])).toEqual([
      [1, 'food_utilitarian'],
      [2, 'food_hedonic'],
      [3, 'food_informational'],
    ]);
    expect(sha(snapshot(1))).toBe('4a3120270e89aec49425adc9fd7af3ffff2dfccb9a3b44e82ae1ffd9046a4df7');
    expect(sha(snapshot(2))).toBe('d5661b19582d52bc8ab453bae8c2c92b15d35c2b8df65ce8b8fb1bbe835b484e');

    const items = surveyQuestions.map((q) => ({ id: q.id, text: q.text, category: q.category }));
    expect(items.map((q) => q.id)).toEqual(Array.from({ length: 16 }, (_, i) => `post-${i + 1}`));
    expect(sha(items)).toBe('2ab7bc61c497a6d10fd392e107c2cd374651a0df6714e5e49f42e8a6dedc7d7f');
  });
});
