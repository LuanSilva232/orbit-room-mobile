import './env.js';
import { expo } from '@better-auth/expo';
import { betterAuth } from 'better-auth';
import { Pool } from '../node_modules/@types/pg/index.js';
import { optionalEnv, requiredEnv } from './env.js';

const databaseUrl = requiredEnv('DATABASE_URL');
const authSecret = requiredEnv('BETTER_AUTH_SECRET');
const baseURL = requiredEnv('BETTER_AUTH_URL');
const googleClientId = optionalEnv('GOOGLE_CLIENT_ID');
const googleClientSecret = optionalEnv('GOOGLE_CLIENT_SECRET');

if (authSecret.length < 32) {
  throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.');
}

if (Boolean(googleClientId) !== Boolean(googleClientSecret)) {
  throw new Error('Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
}

const parsedDatabaseURL = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsedDatabaseURL.protocol)) {
  throw new Error('DATABASE_URL must be a PostgreSQL connection URL.');
}
parsedDatabaseURL.searchParams.set('sslmode', 'verify-full');

const parsedBaseURL = new URL(baseURL);
if (
  parsedBaseURL.protocol !== 'https:' &&
  !['localhost', '127.0.0.1', '[::1]'].includes(parsedBaseURL.hostname)
) {
  throw new Error('BETTER_AUTH_URL must use HTTPS outside local development.');
}

export const pool = new Pool({
  connectionString: parsedDatabaseURL.toString(),
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

export const googleOAuthConfigured = Boolean(googleClientId && googleClientSecret);
const socialProviders =
  googleClientId && googleClientSecret
    ? {
        google: {
          clientId: googleClientId,
          clientSecret: googleClientSecret,
        },
      }
    : {};

export const auth = betterAuth({
  appName: 'Orbit Room Mobile',
  baseURL,
  secret: authSecret,
  database: pool,
  trustedOrigins: ['orbitroom://'],
  plugins: [expo()],
  socialProviders,
});
