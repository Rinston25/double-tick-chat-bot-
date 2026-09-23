import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SessionStore } from '../session/store.js';

export interface SessionRouteOptions {
  sessionStore: SessionStore;
}

const paramsSchema = z.object({ id: z.string().uuid() });

export async function sessionRoutes(
  app: FastifyInstance,
  opts: SessionRouteOptions,
): Promise<void> {
  app.get('/api/session/:id', async (req, reply) => {
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ message: 'Invalid session id' });
    }

    const session = await opts.sessionStore.get(parsedParams.data.id);
    if (!session) {
      return reply.code(404).send({ message: 'Session not found' });
    }

    return reply.send({
      sessionId: session.sessionId,
      stage: session.stage,
      stageConfidence: session.stageConfidence,
      identity: session.identity,
      knownIds: session.knownIds,
      messageCount: session.messages.length,
      updatedAt: session.updatedAt,
    });
  });

  app.delete('/api/session/:id', async (req, reply) => {
    const parsedParams = paramsSchema.safeParse(req.params);
    if (!parsedParams.success) {
      return reply.code(400).send({ message: 'Invalid session id' });
    }

    await opts.sessionStore.delete(parsedParams.data.id);
    return reply.code(204).send();
  });
}
