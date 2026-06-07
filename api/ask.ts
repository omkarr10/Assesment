import type { IncomingMessage, ServerResponse } from 'node:http';
import { answerQuestion } from '../src/ask.js';

type AskBody = {
  question?: unknown;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'method not allowed' }));
    return;
  }

  try {
    const raw = await readBody(req);
    const parsed = (raw ? JSON.parse(raw) : {}) as AskBody;
    const question = typeof parsed.question === 'string' ? parsed.question.trim() : '';

    if (!question) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'question is required' }));
      return;
    }

    const result = await answerQuestion(question);
    res.statusCode = 200;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(result));
  } catch {
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'failed to answer question' }));
  }
}
