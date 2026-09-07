import { useRef, useEffect } from 'react';
import { ChatMessage } from '@/types';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import { TypingIndicator } from './TypingIndicator';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowRight, Loader2, RefreshCw } from 'lucide-react';

export interface ChatSendError {
  message: string;
  onRetry: () => void;
}

interface ChatWindowProps {
  agentName: string;
  messages: ChatMessage[];
  /** Optimistic participant message that is currently being sent. */
  pendingMessage?: ChatMessage | null;
  isAgentTyping: boolean;
  isLocked: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (content: string) => void;
  inputDisabled: boolean;
  inputPlaceholder?: string;
  error?: ChatSendError | null;
  onContinueToSurvey?: () => void;
}

export function ChatWindow({
  agentName,
  messages,
  pendingMessage = null,
  isAgentTyping,
  isLocked,
  draft,
  onDraftChange,
  onSend,
  inputDisabled,
  inputPlaceholder,
  error = null,
  onContinueToSurvey,
}: ChatWindowProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view
  useEffect(() => {
    const el = messagesEndRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, pendingMessage, isAgentTyping, error]);

  const isEmpty = messages.length === 0 && !pendingMessage;

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 scrollbar-thin" aria-live="polite">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
            {isAgentTyping ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin mb-3" aria-hidden="true" />
                <p className="text-sm">Starting your conversation…</p>
              </>
            ) : (
              <p className="text-sm">Preparing your conversation…</p>
            )}
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} agentName={agentName} />
            ))}
            {pendingMessage && <MessageBubble message={pendingMessage} agentName={agentName} pending />}
            {isAgentTyping && <TypingIndicator agentName={agentName} />}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Inline send error with retry (same clientMessageId, draft preserved) */}
      {error && (
        <div
          className="mx-4 sm:mx-6 mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3"
          role="alert"
        >
          <div className="flex items-start gap-2 flex-1">
            <AlertCircle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" aria-hidden="true" />
            <p className="text-sm text-foreground">{error.message}</p>
          </div>
          <Button size="sm" variant="outline" onClick={error.onRetry} disabled={isAgentTyping} className="flex-shrink-0">
            <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {isLocked ? (
        <div className="border-t bg-card p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            The conversation is complete. Please continue to a short questionnaire about your experience.
          </p>
          {onContinueToSurvey && (
            <Button onClick={onContinueToSurvey} className="flex-shrink-0">
              Continue to the questionnaire
              <ArrowRight className="w-4 h-4 ml-2" aria-hidden="true" />
            </Button>
          )}
        </div>
      ) : (
        <MessageInput
          value={draft}
          onChange={onDraftChange}
          onSend={onSend}
          disabled={inputDisabled}
          placeholder={inputPlaceholder ?? `Message ${agentName}...`}
        />
      )}
    </div>
  );
}
