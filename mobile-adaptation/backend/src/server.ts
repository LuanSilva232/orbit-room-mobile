import './env.js';
import { fromNodeHeaders, toNodeHandler } from 'better-auth/node';
import express from 'express';
import { auth, googleOAuthConfigured, pool } from './auth.js';

const app = express();
const port = Number(process.env.PORT ?? 3000);

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error('PORT must be a valid TCP port.');
}

const health = async (_request: express.Request, response: express.Response) => {
  try {
    await pool.query('SELECT 1');
    response.json({
      status: 'ok',
      database: 'connected',
      googleOAuthConfigured,
    });
  } catch (error) {
    console.error('Neon database health check failed.', error);
    response.status(503).json({ status: 'unavailable', database: 'unavailable' });
  }
};

app.get('/health', health);
app.get('/api/health', health);
app.all('/api/auth/*', toNodeHandler(auth));

app.get('/api/me', async (request, response, next) => {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });
    if (!session) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    response.json({ user: session.user });
  } catch (error) {
    next(error);
  }
});

app.use(express.json());

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Orbit Room backend listening on port ${port}.`);
});

process.on('SIGTERM', () => {
  server.close((error) => {
    if (error) {
      console.error('Backend shutdown failed.', error);
      process.exitCode = 1;
    }
    void pool.end();
  });
});
