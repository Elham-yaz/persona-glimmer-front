import { ChatMessage } from '@/types';
import { User, Bot } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatTimestamp(iso: string): string {
  const messageTime = new Date(iso);
  if (Number.isNaN(messageTime.getTime())) return '';
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - messageTime.getTime()) / 1000);

  if (diffInSeconds < 60) return 'just now';
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
  if (messageTime.toDateString() === now.toDateString()) {
    return messageTime.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  return messageTime.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

interface MessageBubbleProps {
  message: ChatMessage;
  agentName?: string;
  /** Optimistic message awaiting the server's confirmation. */
  pending?: boolean;
}

export function MessageBubble({ message, agentName = 'Agent', pending = false }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={cn(
        'flex gap-3 max-w-[85%]',
        isUser ? 'ml-auto flex-row-reverse animate-slide-in-right' : 'mr-auto animate-slide-in-left',
        pending && 'opacity-70'
      )}
      data-testid={`message-${message.role}`}
    >
      {/* Avatar */}
      <div
        className={cn(
          'flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center',
          isUser ? 'bg-primary' : 'bg-secondary'
        )}
        aria-hidden="true"
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-secondary-foreground" />
        )}
      </div>

      <div className="space-y-1 min-w-0">
        {/* Sender name and timestamp */}
        <div className={cn('flex items-center gap-2', isUser && 'flex-row-reverse')}>
          <p className="text-xs text-muted-foreground">{isUser ? 'You' : agentName}</p>
          <span className="text-xs text-muted-foreground/70">
            {pending ? 'sending…' : formatTimestamp(message.createdAt)}
          </span>
        </div>

        {/* Message bubble */}
        <div className={cn(isUser ? 'chat-bubble-user' : 'chat-bubble-agent')}>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </div>
    </div>
  );
}
