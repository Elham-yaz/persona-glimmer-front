import pool, { closePool, query } from './src/config/database';

async function tableExists(name: string): Promise<boolean> {
  const result = await query(
    `SELECT EXISTS (
       SELECT FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    [name]
  );
  return result.rows[0].exists === true;
}

async function testConnection() {
  try {
    console.log('Testing database connection...');
    const result = await query('SELECT NOW() AS current_time');
    console.log('Database connection successful. Server time:', result.rows[0].current_time);

    for (const table of ['schema_migrations', 'agent_conditions', 'contexts', 'sessions', 'session_messages']) {
      console.log(`Table ${table}:`, (await tableExists(table)) ? 'present' : 'MISSING (run npm run migrate)');
    }

    if (await tableExists('agent_conditions')) {
      const counts = await query(
        `SELECT (SELECT COUNT(*) FROM agent_conditions) AS conditions,
                (SELECT COUNT(*) FROM contexts) AS contexts,
                (SELECT COUNT(*) FROM sessions) AS sessions`
      );
      console.log('Rows:', counts.rows[0]);
    }

    await closePool();
    process.exit(0);
  } catch (error: any) {
    console.error('Database connection failed:', error.message);
    await closePool().catch(() => undefined);
    process.exit(1);
  }
}

void pool;
testConnection();
