'use client';

import { useEffect, useRef } from 'react';
import type { ChatMessage } from '@/lib/types';
import { MessageBubble } from './MessageBubble';

export function ChatWindow({ messages }: { messages: ChatMessage[] }) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  return (
    <div
      className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      role="log"
      aria-live="polite"
      aria-label="Conversation"
    >
      {messages.length === 0 && (
        <div className="mx-auto mt-8 max-w-sm text-center text-sm text-neutral-500 dark:text-neutral-400">
          <p className="mb-1 text-base font-semibold text-neutral-700 dark:text-neutral-200">
            Namaste! I&apos;m your Mahindra Virtual Assistant.
          </p>
          <p>Ask about a model, check a test drive, track a booking, or log a service request.</p>
        </div>
      )}
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
