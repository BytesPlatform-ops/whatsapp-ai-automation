import { ReactNode } from 'react';

type From = 'user' | 'bot';

interface ChatBubbleProps {
  from: From;
  children: ReactNode;
  time?: string;
  tail?: boolean;
}

export function ChatBubble({ from, children, time = '10:24', tail = true }: ChatBubbleProps) {
  const isUser = from === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className={`relative max-w-[78%] rounded-2xl px-3.5 py-2 text-[15px] leading-snug shadow-sm ${
          isUser
            ? 'bg-wa-bubble text-ink-900 rounded-tr-md'
            : 'bg-white text-ink-900 rounded-tl-md'
        }`}
      >
        <div className="whitespace-pre-wrap">{children}</div>
        <div className="mt-0.5 flex items-center justify-end gap-1 text-[10.5px] text-ink-400">
          <span>{time}</span>
          {isUser && (
            <svg viewBox="0 0 16 15" className="h-3 w-auto fill-sky-500" aria-hidden="true">
              <path d="M15.01 3.316l-.478-.372a.365.365 0 0 0-.51.063L8.666 9.879a.32.32 0 0 1-.484.033l-.358-.325a.319.319 0 0 0-.484.032l-.378.483a.418.418 0 0 0 .036.541l1.32 1.266c.143.14.361.125.484-.033l6.272-8.048a.366.366 0 0 0-.064-.512zm-4.1 0l-.478-.372a.365.365 0 0 0-.51.063L4.566 9.879a.32.32 0 0 1-.484.033L1.891 7.769a.366.366 0 0 0-.515.006l-.423.433a.364.364 0 0 0 .006.514l3.258 3.185c.143.14.361.125.484-.033l6.272-8.048a.365.365 0 0 0-.063-.51z" />
            </svg>
          )}
        </div>
        {tail && (
          <span
            aria-hidden="true"
            className={`absolute top-0 h-3 w-3 ${
              isUser
                ? 'right-[-4px] bg-wa-bubble [clip-path:polygon(0_0,100%_0,0_100%)]'
                : 'left-[-4px] bg-white [clip-path:polygon(100%_0,100%_100%,0_0)]'
            }`}
          />
        )}
      </div>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="mb-1.5 flex justify-start">
      <div className="relative rounded-2xl rounded-tl-md bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-1">
          <span className="h-1.5 w-1.5 animate-typing rounded-full bg-ink-400" style={{ animationDelay: '0s' }} />
          <span className="h-1.5 w-1.5 animate-typing rounded-full bg-ink-400" style={{ animationDelay: '0.2s' }} />
          <span className="h-1.5 w-1.5 animate-typing rounded-full bg-ink-400" style={{ animationDelay: '0.4s' }} />
        </div>
      </div>
    </div>
  );
}

interface LinkPreviewProps {
  from?: From;
  title: string;
  description: string;
  url: string;
  thumbColor?: string;
}

export function LinkPreview({
  from = 'bot',
  title,
  description,
  url,
  thumbColor = 'from-wa-teal to-wa-green',
}: LinkPreviewProps) {
  const isUser = from === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-1.5`}>
      <div
        className={`overflow-hidden rounded-2xl shadow-sm ${
          isUser ? 'bg-wa-bubble rounded-tr-md' : 'bg-white rounded-tl-md'
        } max-w-[78%]`}
      >
        <div className={`h-20 w-full bg-gradient-to-br ${thumbColor}`} />
        <div className="px-3 py-2">
          <p className="truncate text-[13px] font-semibold text-ink-900">{title}</p>
          <p className="truncate text-[12px] text-ink-500">{description}</p>
          <p className="truncate text-[11px] text-ink-400">{url}</p>
        </div>
      </div>
    </div>
  );
}
