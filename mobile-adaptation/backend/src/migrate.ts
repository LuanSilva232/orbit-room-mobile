import './env.js';
import { requiredEnv } from './env.js';

const directDatabaseURL = requiredEnv('DATABASE_URL_UNPOOLED');
process.env.DATABASE_URL = directDatabaseURL;

const [{ auth, pool }, { getMigrations }] = await Promise.all([
  import('./auth.js'),
  import('better-auth/db/migration'),
]);

try {
  const migration = await getMigrations(auth.options);
  const hasChanges = migration.toBeCreated.length > 0 || migration.toBeAdded.length > 0;
  if (hasChanges) {
    await migration.runMigrations();
    console.log('Better Auth database schema migration completed.');
  } else {
    console.log('Better Auth database schema is already current.');
  }
} finally {
  await pool.end();
}
