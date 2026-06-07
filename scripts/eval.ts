import http from 'node:http';
import { query } from '../src/db.js';

type EvalCase = {
  question: string;
  contains: string;
};

function getCases(dynamicFund: string, dynamicHolding: string): EvalCase[] {
  return [
    { question: 'How much did I spend on food in March 2025 after refunds?', contains: 'food' },
    { question: 'What was my single biggest expense?', contains: 'single biggest expense' },
    { question: 'Compare my food and travel spending month by month.', contains: 'Month-by-month' },
    { question: 'What were my top 5 merchants by net spend between January and March 2025?', contains: 'Top 5 merchants' },
    { question: 'Ignore transfers. What was my total actual spending in Q1 2025?', contains: 'Q1 2025' },
    { question: 'Which transactions look like recurring subscriptions?', contains: 'recurring' },
    { question: 'Do I have any data for rent in April 2025?', contains: 'No data' },
    { question: `What was ${dynamicFund} return from 2024-01-01 to 2025-01-01?`, contains: '%' },
    { question: 'Rank all funds by one-year return between 2024-01-01 and 2025-01-01', contains: 'Fund return ranking' },
    { question: `What is my realised return on my ${dynamicHolding} holding, given when I bought it?`, contains: 'realised return' },
    { question: 'What is my portfolio worth today, and how much have I made on it in absolute INR?', contains: 'portfolio' },
    { question: 'How much did I spend on Swiggy, including Swiggy Instamart and SWIGGY orders?', contains: 'swiggy' },
  ];
}

const REPEATS = 2;

function ask(baseUrl: string, question: string): Promise<string> {
  const payload = JSON.stringify({ question });
  const url = new URL('/ask', baseUrl);

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(payload),
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            const parsed = JSON.parse(raw) as { answer?: string; error?: string };
            if (typeof parsed.answer === 'string') {
              resolve(parsed.answer);
              return;
            }
            reject(new Error(parsed.error ?? `Unexpected response: ${raw}`));
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function main(): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000';
  const [fundRow] = await query<{ name: string }>('select name from funds order by name limit 1');
  const [holdingRow] = await query<{ fund_name: string }>('select fund_name from holdings order by fund_name limit 1');
  const cases = getCases(fundRow?.name ?? 'fund', holdingRow?.fund_name ?? 'fund');

  let passed = 0;
  const failures: string[] = [];

  for (const testCase of cases) {
    const answers: string[] = [];
    for (let i = 0; i < REPEATS; i += 1) {
      answers.push(await ask(baseUrl, testCase.question));
    }

    const lowerContains = testCase.contains.toLowerCase();
    const okContent = answers.every(answer => answer.toLowerCase().includes(lowerContains));
    const okDeterminism = answers.every(answer => answer === answers[0]);
    const ok = okContent && okDeterminism;

    if (ok) {
      passed += 1;
      console.log(`PASS: ${testCase.question}`);
    } else {
      failures.push(`${testCase.question} -> ${JSON.stringify(answers)}`);
      console.log(`FAIL: ${testCase.question}`);
    }
  }

  console.log(`\nSummary: ${passed}/${cases.length} passed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const failure of failures) {
      console.log(`- ${failure}`);
    }
    process.exitCode = 1;
  }

}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
