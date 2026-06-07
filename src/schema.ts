import { query } from './db.js';

export async function ensureSchema(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS transactions (
      id text PRIMARY KEY,
      source_snapshot text NOT NULL,
      txn_date date NOT NULL,
      merchant_raw text NOT NULL,
      merchant_key text NOT NULL,
      category text NOT NULL,
      amount numeric(14,2) NOT NULL,
      currency text NOT NULL,
      memo text,
      memo_norm text,
      is_transfer boolean NOT NULL DEFAULT false,
      is_refund boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (txn_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_category_date ON transactions (category, txn_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_merchant_key_date ON transactions (merchant_key, txn_date);
    CREATE INDEX IF NOT EXISTS idx_transactions_transfer ON transactions (is_transfer, txn_date);

    CREATE TABLE IF NOT EXISTS funds (
      id text PRIMARY KEY,
      name text NOT NULL,
      category text,
      source_snapshot text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS fund_nav (
      fund_id text NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      nav_date date NOT NULL,
      nav numeric(14,6) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (fund_id, nav_date)
    );

    CREATE INDEX IF NOT EXISTS idx_fund_nav_date ON fund_nav (nav_date);

    CREATE TABLE IF NOT EXISTS holdings (
      id bigserial PRIMARY KEY,
      source_snapshot text NOT NULL,
      fund_id text NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      fund_name text NOT NULL,
      units numeric(18,6) NOT NULL,
      purchase_date date NOT NULL,
      purchase_nav numeric(14,6) NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE INDEX IF NOT EXISTS idx_holdings_fund_id ON holdings (fund_id);
  `);
}
