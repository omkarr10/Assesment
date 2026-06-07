import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { openai } from '@ai-sdk/openai';
import { financeResearchTool } from './finance-tool.js';

export const taraAgent = new Agent({
  name: 'Tara',
  model: openai('gpt-5.4-mini') as any,
  instructions:
    'You are Tara, a finance-research assistant. Always call the finance-research tool first for every user question. Never invent or estimate numbers. Use the tool output verbatim for the answer content. If the tool says no data, answer honestly that no matching data was found.',
  tools: {
    financeResearchTool,
  },
});

export const mastra = new Mastra({
  agents: {
    taraAgent,
  },
});
