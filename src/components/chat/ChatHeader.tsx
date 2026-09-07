import { Bot, MessageSquare } from 'lucide-react';

interface ChatHeaderProps {
  /** `agent.displayName` from the API — the only agent attribute shown. */
  agentName: string;
  interactionCount: number;
  maxInteractions: number;
}

export function ChatHeader({ agentName, interactionCount, maxInteractions }: ChatHeaderProps) {
  const safeMax = Math.max(maxInteractions, 1);
  const progress = Math.min(100, Math.round((interactionCount / safeMax) * 100));
  const remaining = Math.max(safeMax - interactionCount, 0);

  return (
    <header className="border-b bg-card px-4 sm:px-6 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center flex-shrink-0" aria-hidden="true">
            <Bot className="w-5 h-5 text-secondary-foreground" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{agentName}</p>
            <p className="text-xs text-muted-foreground">Customer Service</p>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="flex items-center gap-1.5 text-sm justify-end">
            <MessageSquare className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <span className="text-muted-foreground">Interactions:</span>
            <span className="font-medium" data-testid="interaction-counter">
              {interactionCount} / {maxInteractions}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {remaining === 0 ? 'Conversation complete' : `${remaining} remaining`}
          </p>
        </div>
      </div>
      <div
        className="progress-track mt-3"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={maxInteractions}
        aria-valuenow={interactionCount}
        aria-label="Conversation progress"
      >
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
    </header>
  );
}
