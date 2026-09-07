import { Pool, PoolConfig } from 'pg';
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

// Test connection
pool.on('connect', () => {
  console.log('Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('✗ Unexpected error on idle client', err);
  // Don't exit process - let the app handle errors gracefully
  console.error('Database pool error:', err.message);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // Only log query details in development
    if (process.env.NODE_ENV === 'development') {
      console.log('Executed query', { text: text.substring(0, 100), duration, rows: res.rowCount });
    }
    return res;
  } catch (error: any) {
    // Log query errors (sanitize in production)
    if (process.env.NODE_ENV === 'development') {
      console.error('Database query error', { text: text.substring(0, 100), error: error.message });
    } else {
      console.error('Database query error:', error.message);
    }
    throw error;
  }
};

export const getClient = async () => {
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Set a timeout of 5 seconds, after which we will log this client's last query
  const timeout = setTimeout(() => {
    console.error('A client has been checked out for more than 5 seconds!');
  }, 5000);
  
  // Monkey patch the query method to log the last query
  // Create a wrapper that preserves all overloads by using type assertion
  const patchedQuery: typeof client.query = ((...args: any[]) => {
    clearTimeout(timeout);
    // Call original query with all arguments - use any to bypass type checking for overloads
    return (originalQuery as any)(...args);
  }) as typeof client.query;
  
  client.query = patchedQuery;
  
  client.release = () => {
    clearTimeout(timeout);
    return release();
  };
  
  return client;
};

export default pool;
