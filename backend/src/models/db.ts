import { Pool, PoolClient } from 'pg';
import pool from '../config/database';

/** Anything that can run a parameterized query: the shared pool or a checked-out client. */
export type Queryable = Pool | PoolClient;

export function db(client?: Queryable): Queryable {
  return client ?? pool;
}
