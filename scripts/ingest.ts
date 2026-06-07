import fs from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { closePool, withTransaction } from '../src/db.js';
import { env } from '../src/env.js';
import { ensureSchema } from '../src/schema.js';
import { looksLikeRefund, looksLikeTransfer, merchantKey, normalizeText } from '../src/finance/merchant.js';

type Snapshot = {
  transactions: Array<Record<string, string | number | null>>;
  funds: Array<Record<string, string | number | null | Array<{ date: string; nav: number }>>>;
  holdings: Array<Record<string, string | number | null>>;
};

function readJson(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function snapshotName(snapshotPath: string): string {
  return path.basename(path.resolve(snapshotPath));
}

const BATCH_SIZE = 250;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function insertBatch(
  client: PoolClient,
  sqlPrefix: string,
  values: unknown[][],
  columnsPerRow: number,
  sqlSuffix = '',
): Promise<void> {
  for (const batch of chunk(values, BATCH_SIZE)) {
    const params = batch.flat();
    const placeholders = batch
      .map((row, rowIndex) => {
        const offset = rowIndex * columnsPerRow;
        const slots = row.map((_, columnIndex) => `$${offset + columnIndex + 1}`);
        return `(${slots.join(',')})`;
      })
      .join(',');

    await client.query(`${sqlPrefix} ${placeholders}${sqlSuffix}`, params);
  }
}

async function main(): Promise<void> {
  const snapshotDir = process.argv[2] ?? process.env.DATA_DIR;
  if (!snapshotDir) {
    throw new Error('Provide a snapshot directory, e.g. DATA_DIR=./data/sample_a npm run ingest');
  }

  const resolved = path.resolve(snapshotDir);
  const snapshot: Snapshot = {
    transactions: readJson(path.join(resolved, 'transactions.json')) as Snapshot['transactions'],
    funds: readJson(path.join(resolved, 'funds.json')) as Snapshot['funds'],
    holdings: readJson(path.join(resolved, 'holdings.json')) as Snapshot['holdings'],
  };

  await ensureSchema();

  const sourceSnapshot = snapshotName(resolved);

  const transactionValues = snapshot.transactions.map(tx => {
    const merchant = String(tx.merchant ?? '');
    const memo = tx.memo == null ? null : String(tx.memo);
    const category = String(tx.category ?? 'uncategorized');
    const amount = Number(tx.amount ?? 0);

    return [
      String(tx.id),
      sourceSnapshot,
      String(tx.date),
      merchant,
      merchantKey(merchant, memo),
      category,
      amount,
      String(tx.currency ?? 'INR'),
      memo,
      normalizeText(memo ?? ''),
      looksLikeTransfer(category, merchant, memo),
      looksLikeRefund(amount),
    ];
  });

  const fundValues = snapshot.funds.map(fund => [
    String(fund.id),
    String(fund.name ?? fund.id),
    fund.category == null ? null : String(fund.category),
    sourceSnapshot,
  ]);

  const navValues = snapshot.funds.flatMap(fund => {
    const navPoints = Array.isArray(fund.nav) ? fund.nav : [];
    return (navPoints as Array<{ date: string; nav?: number; value?: number }>).map(point => [
      String(fund.id),
      String(point.date),
      Number(point.nav ?? point.value ?? 0),
    ]);
  });

  const holdingValues = snapshot.holdings.map(holding => [
    sourceSnapshot,
    String(holding.fund_id),
    String(holding.fund_name ?? holding.fund_id),
    Number(holding.units ?? 0),
    String(holding.purchase_date),
    Number(holding.purchase_nav ?? 0),
  ]);

  await withTransaction(async client => {
    await client.query('TRUNCATE TABLE holdings, fund_nav, funds, transactions RESTART IDENTITY CASCADE');

    await insertBatch(
      client,
      'INSERT INTO transactions (id, source_snapshot, txn_date, merchant_raw, merchant_key, category, amount, currency, memo, memo_norm, is_transfer, is_refund) VALUES',
      transactionValues,
      12,
      ' ON CONFLICT (id) DO NOTHING',
    );

    await insertBatch(
      client,
      'INSERT INTO funds (id, name, category, source_snapshot) VALUES',
      fundValues,
      4,
      ' ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category, source_snapshot = EXCLUDED.source_snapshot',
    );

    await insertBatch(
      client,
      'INSERT INTO fund_nav (fund_id, nav_date, nav) VALUES',
      navValues,
      3,
      ' ON CONFLICT (fund_id, nav_date) DO UPDATE SET nav = EXCLUDED.nav',
    );

    await insertBatch(
      client,
      'INSERT INTO holdings (source_snapshot, fund_id, fund_name, units, purchase_date, purchase_nav) VALUES',
      holdingValues,
      6,
    );
  });

  console.log(`Ingested ${snapshot.transactions.length} transactions, ${snapshot.funds.length} funds, and ${snapshot.holdings.length} holdings from ${resolved}`);
  await closePool();
}

main().catch(async error => {
  console.error(error instanceof Error ? error.message : error);
  await closePool();
  process.exit(1);
});
