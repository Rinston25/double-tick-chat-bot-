import ReactMarkdown from 'react-markdown';
import type { ChatMessage } from '@/lib/types';

export function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed shadow-sm sm:max-w-[75%] ${
          isUser
            ? 'bg-brand text-white'
            : message.isError
              ? 'border border-red-300 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300'
              : 'border border-neutral-200 bg-white text-neutral-900 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100'
        }`}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="markdown-content">
            <ReactMarkdown>{message.content || (message.streaming ? '' : ' ')}</ReactMarkdown>
          </div>
        )}
        {message.streaming && message.content.length === 0 && (
          <span className="flex gap-1 py-1" aria-hidden>
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
            <span className="typing-dot h-1.5 w-1.5 rounded-full bg-neutral-400 dark:bg-neutral-500" />
          </span>
        )}
      </div>
    </div>
  );
}
