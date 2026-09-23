import type { FastifyInstance } from 'fastify';
import type { SessionStoreHandle } from '../session/index.js';
import type { ZohoTokenManager } from '../zoho/auth.js';

export interface HealthRouteOptions {
  tokenManager: ZohoTokenManager;
  sessionStoreHandle: SessionStoreHandle;
}

export async function healthRoutes(app: FastifyInstance, opts: HealthRouteOptions): Promise<void> {
  app.get('/api/health', async (_req, reply) => {
    const [zohoOk, sessionStoreOk] = await Promise.all([
      opts.tokenManager
        .getAccessToken()
        .then(() => true)
        .catch(() => false),
      opts.sessionStoreHandle.ping(),
    ]);

    const healthy = zohoOk && sessionStoreOk;

    reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      checks: {
        zoho: zohoOk ? 'ok' : 'error',
        sessionStore: {
          kind: opts.sessionStoreHandle.kind,
          status: sessionStoreOk ? 'ok' : 'error',
        },
      },
    });
  });
}
