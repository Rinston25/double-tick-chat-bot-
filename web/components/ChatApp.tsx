'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { checkHealth, deleteSession, fetchSessionDetails } from '@/lib/api';
import { getOrCreateSessionId, resetSessionId } from '@/lib/session';
import { streamChat } from '@/lib/sse';
import type { ChatMessage, CrmActivityEntry, SessionDetails, Stage } from '@/lib/types';
import { ChatInput } from './ChatInput';
import { ChatWindow } from './ChatWindow';
import { ErrorBanner } from './ErrorBanner';
import { QuickStartChips } from './QuickStartChips';
import { SidePanel } from './SidePanel';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export function ChatApp() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [stage, setStage] = useState<Stage>('GENERAL');
  const [confidence, setConfidence] = useState(0);
  const [activity, setActivity] = useState<CrmActivityEntry[]>([]);
  const [details, setDetails] = useState<SessionDetails | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [serverUnreachable, setServerUnreachable] = useState(false);
  const [turnError, setTurnError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const id = getOrCreateSessionId();
    setSessionId(id);
    checkHealth(API_URL).then((ok) => setServerUnreachable(!ok));
    fetchSessionDetails(API_URL, id)
      .then((d) => {
        if (d) {
          setDetails(d);
          setStage(d.stage);
          setConfidence(d.stageConfidence);
        }
      })
      .catch(() => {
        /* no existing session yet — fine */
      });
  }, []);

  const refreshDetails = useCallback((id: string) => {
    fetchSessionDetails(API_URL, id)
      .then((d) => setDetails(d))
      .catch(() => {
        /* best-effort */
      });
  }, []);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || isStreaming) return;

      setTurnError(null);
      setLastFailedMessage(null);
      const userMessageId = crypto.randomUUID();
      const assistantMessageId = crypto.randomUUID();

      setMessages((prev) => [
        ...prev,
        { id: userMessageId, role: 'user', content: text },
        { id: assistantMessageId, role: 'assistant', content: '', streaming: true },
      ]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await streamChat({
          apiUrl: API_URL,
          sessionId,
          message: text,
          signal: controller.signal,
          onEvent: (event) => {
            switch (event.type) {
              case 'stage':
                setStage(event.data.stage);
                setConfidence(event.data.confidence);
                break;
              case 'token':
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: m.content + event.data.text }
                      : m,
                  ),
                );
                break;
              case 'tool_start':
                setActivity((prev) => [
                  ...prev,
                  {
                    id: event.data.id,
                    name: event.data.name,
                    args: event.data.args,
                    status: 'pending',
                  },
                ]);
                break;
              case 'tool_end':
                setActivity((prev) =>
                  prev.map((a) =>
                    a.id === event.data.id
                      ? {
                          ...a,
                          status: event.data.ok ? 'ok' : 'error',
                          summary: event.data.summary,
                        }
                      : a,
                  ),
                );
                break;
              case 'error':
                setTurnError(event.data.message);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMessageId
                      ? { ...m, content: event.data.message, streaming: false, isError: true }
                      : m,
                  ),
                );
                break;
              case 'done':
                setMessages((prev) =>
                  prev.map((m) => (m.id === assistantMessageId ? { ...m, streaming: false } : m)),
                );
                break;
            }
          },
        });
        setServerUnreachable(false);
        refreshDetails(sessionId);
      } catch (err) {
        if (controller.signal.aborted) return;
        setServerUnreachable(true);
        setLastFailedMessage(text);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessageId
              ? {
                  ...m,
                  content: "Couldn't reach the server. Please check your connection and retry.",
                  streaming: false,
                  isError: true,
                }
              : m,
          ),
        );
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [sessionId, isStreaming, refreshDetails],
  );

  const handleNewConversation = useCallback(async () => {
    abortRef.current?.abort();
    if (sessionId) {
      await deleteSession(API_URL, sessionId).catch(() => {});
    }
    const newId = resetSessionId();
    setSessionId(newId);
    setMessages([]);
    setStage('GENERAL');
    setConfidence(0);
    setActivity([]);
    setDetails(null);
    setTurnError(null);
    setLastFailedMessage(null);
  }, [sessionId]);

  const handleRetry = useCallback(() => {
    checkHealth(API_URL).then((ok) => {
      setServerUnreachable(!ok);
      if (ok && lastFailedMessage) {
        const text = lastFailedMessage;
        setLastFailedMessage(null);
        sendMessage(text);
      }
    });
  }, [lastFailedMessage, sendMessage]);

  return (
    <div className="flex h-dvh flex-col bg-neutral-50 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-950">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">
            M
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight text-neutral-900 dark:text-neutral-100">
              Mahindra Virtual Assistant
            </h1>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Models · Test drives · Bookings · Service
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewConversation}
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            New conversation
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open session details"
            className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 md:hidden dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            Details
          </button>
        </div>
      </header>

      {serverUnreachable && (
        <ErrorBanner
          message={
            lastFailedMessage
              ? "Couldn't reach the server. Check your connection and retry."
              : 'The server appears to be unreachable right now.'
          }
          onRetry={handleRetry}
        />
      )}
      {turnError && !serverUnreachable && <ErrorBanner message={turnError} />}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 flex-col overflow-hidden">
          <ChatWindow messages={messages} />
          <QuickStartChips onPick={sendMessage} disabled={isStreaming || !sessionId} />
          <ChatInput onSend={sendMessage} disabled={isStreaming || !sessionId} />
        </div>

        <SidePanel
          stage={stage}
          confidence={confidence}
          activity={activity}
          details={details}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
      </div>
    </div>
  );
}
