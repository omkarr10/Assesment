import fs from 'node:fs';
import path from 'node:path';
import { env } from './env.js';

export type RunLog = {
  request_id: string;
  question: string;
  normalized_intent: string;
  tools_called: string[];
  sanitized_tool_inputs: unknown[];
  tables_read: string[];
  latency_ms: number;
  status: 'success' | 'failure' | 'no_data';
  error_message?: string;
};

export function appendRunLog(entry: RunLog): void {
  try {
    fs.mkdirSync(env.logDir, { recursive: true });
    const filePath = path.join(env.logDir, 'ask.ndjson');
    fs.appendFileSync(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch {
    // Ignore filesystem logging errors in serverless environments.
  }
}

