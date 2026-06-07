import express from 'express';
import { env } from './env.js';
import { answerQuestion } from './ask.js';

const app = express();

app.use(express.json({ limit: '1mb' }));

app.get('/healthz', (_req, res) => {
  res.json({ ok: true });
});

app.post('/ask', async (req, res) => {
  const question = typeof req.body?.question === 'string' ? req.body.question.trim() : '';

  if (!question) {
    res.status(400).json({ error: 'question is required' });
    return;
  }

  try {
    const { answer } = await answerQuestion(question);
    res.json({ answer });
  } catch (error) {
    res.status(500).json({
      error: 'failed to answer question',
    });
  }
});

app.listen(env.port, () => {
  console.log(`Tara listening on http://localhost:${env.port}`);
});
