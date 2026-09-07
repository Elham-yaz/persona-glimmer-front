import { Bot } from 'lucide-react';

interface TypingIndicatorProps {
  agentName?: string;
}

export function TypingIndicator({ agentName = 'Agent' }: TypingIndicatorProps) {
  return (
    <div className="flex gap-3 max-w-[85%] mr-auto animate-slide-in-left" role="status" aria-live="polite">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
        <Bot className="w-4 h-4 text-secondary-foreground" />
      </div>
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">{agentName} is typing</p>
        <div className="chat-bubble-agent">
          <div className="flex items-center gap-1 px-2 py-1">
            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    </div>
  );
}
