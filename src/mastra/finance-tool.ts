import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { researchFinance } from '../analysis.js';

export const financeResearchTool = createTool({
  id: 'finance-research',
  description: 'Grounded finance research across transactions, funds, and holdings. Always use this for user finance questions.',
  inputSchema: z.object({
    question: z.string().min(3),
  }),
  outputSchema: z.object({
    intent: z.string(),
    answer: z.string(),
    tablesRead: z.array(z.string()),
    toolName: z.string(),
    inputSummary: z.record(z.string(), z.unknown()),
  }),
  execute: async context => researchFinance(context.context.question),
});
