import cors from '@fastify/cors';
import Fastify from 'fastify';
import { env } from './config/env.js';
import { GroqProvider } from './llm/groq.js';
import { chatRoutes } from './routes/chat.js';
import { healthRoutes } from './routes/health.js';
import { sessionRoutes } from './routes/session.js';
import { createSessionStore } from './session/index.js';
import { createZohoClient } from './zoho/index.js';

async function main() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: process.stdout.isTTY ? { target: 'pino-pretty' } : undefined,
    },
  });

  await app.register(cors, { origin: env.WEB_ORIGIN });

  const { client: zohoClient, tokenManager } = createZohoClient(app.log);
  const sessionStoreHandle = createSessionStore(app.log);
  const provider = new GroqProvider(env.GROQ_API_KEY, app.log);

  await app.register(healthRoutes, { tokenManager, sessionStoreHandle });
  await app.register(sessionRoutes, { sessionStore: sessionStoreHandle.store });
  await app.register(chatRoutes, { zohoClient, sessionStore: sessionStoreHandle.store, provider });

  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' });
    app.log.info(`Mahindra AI Chat Agent server listening on port ${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
