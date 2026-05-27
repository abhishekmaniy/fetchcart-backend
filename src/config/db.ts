import './env'; 

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { env } from './env';

if (!env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not defined in environment variables');
}

const sql = neon(env.DATABASE_URL);
const db = drizzle({ client: sql });

export default db;
