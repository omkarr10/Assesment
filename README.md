# Provue Tara

Finance-research agent built with Mastra, Express 5, and Postgres.

API contract:

- Request: `POST /ask` with `{ "question": "..." }`
- Response: `{ "answer": "..." }`

## What it does

- Ingests a snapshot folder of JSON into Postgres.
- Answers grounded finance questions from the database.
- Logs each `/ask` request to `logs/ask.ndjson`.

## Setup

1. Install dependencies.
2. Copy `.env.example` to `.env` and set `DATABASE_URL` and `OPENAI_API_KEY`.
3. Start Postgres and create the `provue_tara` database.
4. Ingest a snapshot:

```bash
DATA_DIR=./data/sample_a npm run ingest
```

5. Start the server:

```bash
npm run dev
```

6. Ask a question:

```bash
curl -X POST http://localhost:3000/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"What was my biggest expense?"}'
```

## Evaluation

Keep the API server running and execute:

```bash
npm run eval
```

The eval script sends 12 questions to `POST /ask`, checks expected facts in the answer, and runs each case twice to flag non-deterministic behavior.

## Environment variables

- `DATABASE_URL`: Required Postgres connection string.
- `OPENAI_API_KEY`: Required by Mastra/OpenAI model routing.
- `ENABLE_MODEL_PARAPHRASE`: Optional. Set to `true` only if you want LLM paraphrasing on top of the deterministic finance answer.
- `PORT`: Server port, defaults to `3000`.

Local env file:

1. Create or edit [.env](.env).
2. Set `DATABASE_URL` and `OPENAI_API_KEY` locally on your machine.

Note: Do not commit `.env` and do not paste secrets into source control.

## Notes

- Relative date phrases are resolved against the latest transaction date in the ingested snapshot.
- The implementation intentionally avoids reading JSON at request time; only Postgres is queried for answers.
- Async background jobs are not implemented. All tools run synchronously and the decision is documented in `DESIGN.md`.

## Vercel Deployment

The project is wired for Vercel with serverless routes:

- `POST /ask` via rewrite to [api/ask.ts](api/ask.ts)
- `GET /healthz` via rewrite to [api/healthz.ts](api/healthz.ts)

Deployment steps:

1. `npm i -g vercel`
2. `vercel login`
3. `vercel` (for preview deploy)
4. In Vercel project settings, add env vars:
   - `DATABASE_URL`
   - `OPENAI_API_KEY`
5. In your managed Postgres, run ingestion from your local machine against the hosted `DATABASE_URL`:

```bash
DATABASE_URL='your-hosted-db-url' npm run ingest -- ./data/sample_a
```

6. Validate deployed endpoint:

```bash
curl -X POST https://<your-vercel-domain>/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"What was my single biggest expense?"}'
```

## Deployed URL

- Base URL: https://provue-tara-nine.vercel.app
- Ask endpoint: https://provue-tara-nine.vercel.app/ask
- Health endpoint: https://provue-tara-nine.vercel.app/healthz

This is the live deployment used for evaluation. After you submit, rotate any secrets used during testing.

## Observability Evidence

This project writes one JSON line per request to `logs/ask.ndjson` with:

- request id
- question
- normalized intent
- tools called
- sanitized tool inputs
- tables read
- latency
- status
- error reason (if any)

To capture evidence for submission:

1. Start the API server and run one successful request:

```bash
curl -X POST http://localhost:3000/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"What was my single biggest expense?"}'
```

2. Run one handled no-data request:

```bash
curl -X POST http://localhost:3000/ask \
  -H 'Content-Type: application/json' \
  -d '{"question":"Do I have any data for rent in April 2025?"}'
```

3. Inspect the last two log lines:

```bash
tail -n 2 logs/ask.ndjson
```

Include these lines (or screenshots) in your submission notes as observability evidence.

## Submission Checklist

- `/ask` contract preserved: request `{ "question": "..." }`, response `{ "answer": "..." }`.
- Ingestion is snapshot-driven and path-based: `npm run ingest -- ./data/sample_x`.
- Tools read from Postgres, never from JSON at request time.
- `npm run eval` passes and reports summary.
- `logs/ask.ndjson` contains both success and no-data/failure traces.
- `DESIGN.md` documents schema, indexes, formulas, tradeoffs, and risks.
- README contains setup, run, eval, and deploy instructions.
- README includes your final public deployed URL.
# Assesment
