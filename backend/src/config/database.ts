import { Pool, PoolClient, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Render databases require SSL for external connections
const requiresSSL = process.env.DATABASE_URL?.includes('render.com') ||
                    process.env.NODE_ENV === 'production';

// Certificate verification is ON by default. If the provider's certificate does not
// validate against the system CA bundle, either supply the CA via DATABASE_CA_CERT
// (PEM contents) or — as a last resort — set DATABASE_SSL_NO_VERIFY=true to restore
// the old unverified behavior.
const sslNoVerify = process.env.DATABASE_SSL_NO_VERIFY === 'true';
const caCert = process.env.DATABASE_CA_CERT;

const poolConfig: PoolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: requiresSSL
    ? { rejectUnauthorized: !sslNoVerify, ...(caCert ? { ca: caCert } : {}) }
    : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Increased to 10 seconds for Render database
};

const pool = new Pool(poolConfig);

let announcedConnection = false;
pool.on('connect', () => {
  if (!announcedConnection && process.env.NODE_ENV !== 'test') {
    announcedConnection = true;
    console.log('Connected to PostgreSQL database');
  }
});

pool.on('error', (err) => {
  // Don't exit process - let the app handle errors gracefully
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

/**
 * Run a parameterized query on the shared pool.
 */
export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV === 'development') {
      const duration = Date.now() - start;
      console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
    }
    return res;
  } catch (error: any) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Database query error', { text: text.substring(0, 100), error: error.message });
    } else {
      console.error('Database query error:', error.message);
    }
    throw error;
  }
};

/**
 * Run `fn` inside a single transaction on a dedicated client.
 * COMMIT on success, ROLLBACK on any thrown error (which is re-thrown).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError: any) {
      console.error('Transaction rollback failed:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Close the pool (CLI scripts and tests). Safe to call more than once.
 */
export async function closePool(): Promise<void> {
  if (!pool.ended) {
    await pool.end();
  }
}

export default pool;
