import { Pool } from "pg";

// Singleton pool — reused across requests in the same Node.js process
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL env var is not set");

    // Neon and other cloud Postgres providers require SSL
    const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
    pool = new Pool({
      connectionString,
      max: 5, // keep low for serverless — Vercel functions are short-lived
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
  }
  return pool;
}

/** Run a parameterised query and return rows. */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const client = await getPool().connect();
  try {
    const result = await client.query(sql, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

/** Run a query and return the first row (or null). */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}
