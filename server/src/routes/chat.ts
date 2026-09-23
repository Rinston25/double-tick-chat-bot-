import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { env } from '../config/env.js';
import { applyClassification, classifyTurn } from '../agent/classifier.js';
import { runTurn, type OrchestratorEvent } from '../agent/orchestrator.js';
import type { LLMProvider } from '../llm/provider.js';
import { createEmptySession, type SessionStore } from '../session/store.js';
import type { ZohoClient } from '../zoho/client.js';

export interface ChatRouteOptions {
  sessionStore: SessionStore;
  provider: LLMProvider;
  zohoClient: ZohoClient;
}

const bodySchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(2000),
});

const HEARTBEAT_INTERVAL_MS = 15_000;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_MESSAGES = 20;

/** Simple in-memory sliding-window limiter, keyed by session id. */
class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  allow(key: string): boolean {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    const existing = (this.hits.get(key) ?? []).filter((t) => t > windowStart);
    if (existing.length >= RATE_LIMIT_MAX_MESSAGES) {
      this.hits.set(key, existing);
      return false;
    }
    existing.push(now);
    this.hits.set(key, existing);
    return true;
  }
}

function sendSseEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function chatRoutes(app: FastifyInstance, opts: ChatRouteOptions): Promise<void> {
  const rateLimiter = new RateLimiter();

  app.post('/api/chat', async (req, reply) => {
    const parsedBody = bodySchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply
        .code(400)
        .send({ message: 'Invalid request body', issues: parsedBody.error.issues });
    }
    const { sessionId, message } = parsedBody.data;

    if (!rateLimiter.allow(sessionId)) {
      return reply
        .code(429)
        .send({ message: 'Too many messages. Please wait a moment and try again.' });
    }

    const logger = req.log.child({ sessionId });

    // Writing directly to reply.raw bypasses Fastify's onSend hook chain, so
    // @fastify/cors never gets a chance to add its headers to this response
    // (only to the preflight OPTIONS request) — set it explicitly here too.
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': env.WEB_ORIGIN,
      Vary: 'Origin',
    });

    const abortController = new AbortController();
    const onClose = () => abortController.abort();
    // Note: listen on the RESPONSE socket, not req.raw — req.raw fires 'close'
    // as soon as the (tiny) request body has been fully read, which is almost
    // immediately, long before the client actually disconnects. reply.raw
    // only closes when the underlying connection actually goes away.
    reply.raw.on('close', onClose);

    const heartbeat = setInterval(() => {
      reply.raw.write(': heartbeat\n\n');
    }, HEARTBEAT_INTERVAL_MS);

    let session = (await opts.sessionStore.get(sessionId)) ?? createEmptySession(sessionId);

    try {
      const classification = await classifyTurn({
        provider: opts.provider,
        model: env.GROQ_MODEL_CLASSIFIER,
        recentMessages: session.messages.slice(-6),
        session,
        logger,
      });
      applyClassification(session, classification);
      sendSseEvent(reply, 'stage', { stage: session.stage, confidence: session.stageConfidence });

      session = await runTurn({
        provider: opts.provider,
        model: env.GROQ_MODEL_AGENT,
        session,
        userMessage: message,
        toolContext: { zohoClient: opts.zohoClient, logger, sessionId },
        onEvent: (event: OrchestratorEvent) => {
          if (abortController.signal.aborted) return;
          switch (event.type) {
            case 'token':
              sendSseEvent(reply, 'token', { text: event.text });
              break;
            case 'tool_start':
              sendSseEvent(reply, 'tool_start', {
                id: event.id,
                name: event.name,
                args: event.args,
              });
              break;
            case 'tool_end':
              sendSseEvent(reply, 'tool_end', {
                id: event.id,
                name: event.name,
                ok: event.ok,
                summary: event.summary,
              });
              break;
            case 'error':
              sendSseEvent(reply, 'error', { message: event.message });
              break;
            case 'done':
              sendSseEvent(reply, 'done', {});
              break;
          }
        },
        logger,
        signal: abortController.signal,
      });
    } catch (err) {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'Unhandled error in chat turn',
      );
      if (!abortController.signal.aborted) {
        sendSseEvent(reply, 'error', {
          message: "I'm having trouble responding right now, please try again in a moment.",
        });
        sendSseEvent(reply, 'done', {});
      }
    } finally {
      clearInterval(heartbeat);
      reply.raw.off('close', onClose);
      await opts.sessionStore.set(session);
      reply.raw.end();
    }
  });
}
