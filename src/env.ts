import 'dotenv/config';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required. Set it in .env or the environment.');
}

export const env = {
  databaseUrl,
  openAiApiKey: process.env.OPENAI_API_KEY ?? '',
  enableModelParaphrase: process.env.ENABLE_MODEL_PARAPHRASE === 'true',
  port: Number(process.env.PORT ?? '3000'),
  logDir: process.env.LOG_DIR ?? 'logs',
};
