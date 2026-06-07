import crypto from 'node:crypto';
import { appendRunLog } from './observability.js';
import { env } from './env.js';
import { taraAgent } from './mastra/index.js';
import { researchFinance } from './analysis.js';

export async function answerQuestion(question: string): Promise<{ answer: string }> {
  const start = Date.now();
  const requestId = crypto.randomUUID();

  try {
    const toolResult = await researchFinance(question);
    let answer = toolResult.answer;

    if (env.openAiApiKey && env.enableModelParaphrase) {
      try {
        const response = await taraAgent.generate([
          {
            role: 'system',
            content: 'Return a concise answer grounded only in the provided finance data. Do not add any numbers that are not in the tool result.',
          },
          {
            role: 'user',
            content: JSON.stringify({ question, toolResult }),
          },
        ]);
        answer = response.text?.trim() || toolResult.answer;
      } catch {
        answer = toolResult.answer;
      }
    }

    appendRunLog({
      request_id: requestId,
      question,
      normalized_intent: toolResult.intent,
      tools_called: ['financeResearchTool', 'taraAgent.generate'],
      sanitized_tool_inputs: [{ question }],
      tables_read: toolResult.tablesRead,
      latency_ms: Date.now() - start,
      status: toolResult.intent === 'no_data' ? 'no_data' : 'success',
    });

    return { answer };
  } catch (error) {
    appendRunLog({
      request_id: requestId,
      question,
      normalized_intent: 'error',
      tools_called: ['financeResearchTool'],
      sanitized_tool_inputs: [{ question }],
      tables_read: [],
      latency_ms: Date.now() - start,
      status: 'failure',
      error_message: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
