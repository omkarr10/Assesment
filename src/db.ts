import { Pool, type PoolClient } from 'pg';
import { env } from './env.js';

let pool: Pool | null = null;

function getPoolOptions() {
  const databaseUrl = env.databaseUrl;
  const usesHostedSupabase = /supabase\.com(?::\d+)?\/?/.test(databaseUrl);

  if (usesHostedSupabase) {
    return {
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false,
      },
    };
  }

  return {
    connectionString: databaseUrl,
  };
}

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool(getPoolOptions());
  }
  return pool;
}

export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
