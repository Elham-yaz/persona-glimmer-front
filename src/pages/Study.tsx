import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { ScenarioPanel } from '@/components/layout/ScenarioPanel';
import { SurveyScreen } from '@/components/survey/SurveyScreen';
import { postChatSurveyQuestions } from '@/data/surveyQuestions';
import { readEntryParams } from '@/lib/entryParams';
import {
  clearSessionId,
  createClientMessageId,
  getErrorMessage,
  getSessionId,
  hasErrorCode,
  sessionApi,
} from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import type { ChatMessage, SessionState, SurveyResponse } from '@/types';
import { AlertTriangle, Check, CheckCircle2, Copy, Loader2, MessageSquareText } from 'lucide-react';

/** Idempotency key for the auto-sent stimulus (docs/STUDY2_API.md §1). */
const OPENING_CLIENT_MESSAGE_ID = 'opening';

type View = 'loading' | 'landing' | 'chat' | 'survey' | 'completion' | 'error';

interface PendingSend {
  clientMessageId: string;
  content: string;
  isOpening: boolean;
}

function sortBySequence(messages: ChatMessage[]): ChatMessage[] {
  return [...messages].sort((a, b) => a.sequence - b.sequence);
}

export default function Study() {
  const { toast } = useToast();
  const entryParams = useMemo(() => readEntryParams(), []);

  const [view, setView] = useState<View>('loading');
  const [session, setSession] = useState<SessionState | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [completionCode, setCompletionCode] = useState<number | null>(null);

  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const [isStarting, setIsStarting] = useState(false);
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);
  const [fatalError, setFatalError] = useState<string | null>(null);

  // Guards against StrictMode double-invocation / re-renders firing side effects twice.
  const bootstrappedRef = useRef(false);
  const openingSentRef = useRef(false);

  // ---------------------------------------------------------------------------
  // Session state → view
  // ---------------------------------------------------------------------------

  const applySession = useCallback((state: SessionState) => {
    setSession(state);
    setMessages(sortBySequence(state.messages ?? []));
    setCompletionCode(state.completionCode ?? null);
    if (state.surveyCompleted) {
      setView('completion');
    } else if (state.isLocked) {
      setView('survey');
    } else {
      setView('chat');
    }
  }, []);

  const resetToLanding = useCallback(
    (reason?: string) => {
      clearSessionId();
      setSession(null);
      setMessages([]);
      setCompletionCode(null);
      setPendingSend(null);
      setSendError(null);
      setDraft('');
      openingSentRef.current = false;
      setView('landing');
      if (reason) {
        toast({ title: 'Session not found', description: reason, variant: 'destructive' });
      }
    },
    [toast]
  );

  const refreshSession = useCallback(async () => {
    try {
      const state = await sessionApi.get();
      applySession(state);
    } catch (error: unknown) {
      if (hasErrorCode(error, 'SESSION_INVALID')) {
        resetToLanding(getErrorMessage(error));
        return;
      }
      toast({ title: 'Could not refresh your session', description: getErrorMessage(error), variant: 'destructive' });
    }
  }, [applySession, resetToLanding, toast]);

  // ---------------------------------------------------------------------------
  // Bootstrap: resume a stored session or show the landing page
  // ---------------------------------------------------------------------------

  const bootstrap = useCallback(async () => {
    const storedId = getSessionId();
    if (!storedId) {
      setView('landing');
      return;
    }
    setView('loading');
    setFatalError(null);
    try {
      const state = await sessionApi.get();
      applySession(state);
    } catch (error: unknown) {
      if (hasErrorCode(error, 'SESSION_INVALID')) {
        resetToLanding('Your previous session could not be found. Please begin again.');
        return;
      }
      setFatalError(getErrorMessage(error));
      setView('error');
    }
  }, [applySession, resetToLanding]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;
    void bootstrap();
  }, [bootstrap]);

  // ---------------------------------------------------------------------------
  // Landing → create session
  // ---------------------------------------------------------------------------

  const handleBegin = async () => {
    if (isStarting) return;
    setIsStarting(true);
    try {
      const state = await sessionApi.create({
        externalId: entryParams.externalId,
        force: entryParams.force,
      });
      openingSentRef.current = false;
      applySession(state);
    } catch (error: unknown) {
      toast({ title: 'Could not start the study', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsStarting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  const performSend = useCallback(
    async (clientMessageId: string, content: string, isOpening: boolean) => {
      setIsSending(true);
      setSendError(null);
      setPendingSend({ clientMessageId, content, isOpening });
      try {
        const result = await sessionApi.sendMessage({ clientMessageId, content });
        setMessages((prev) => {
          const ids = new Set([result.userMessage.id, result.agentMessage.id]);
          return sortBySequence([...prev.filter((m) => !ids.has(m.id)), result.userMessage, result.agentMessage]);
        });
        setSession((prev) =>
          prev ? { ...prev, interactionCount: result.interactionCount, isLocked: result.isLocked } : prev
        );
        setPendingSend(null);
        if (!isOpening) setDraft('');
      } catch (error: unknown) {
        if (hasErrorCode(error, 'SESSION_INVALID')) {
          resetToLanding(getErrorMessage(error));
          return;
        }
        if (hasErrorCode(error, 'SESSION_LOCKED') || hasErrorCode(error, 'SESSION_COMPLETED')) {
          // Our local state is stale — the server knows best.
          setPendingSend(null);
          await refreshSession();
          return;
        }
        // AGENT_UNAVAILABLE (nothing was persisted) or a transport failure:
        // keep the draft and the clientMessageId so a retry is idempotent.
        if (!isOpening) setDraft(content);
        setSendError(
          hasErrorCode(error, 'AGENT_UNAVAILABLE')
            ? getErrorMessage(error, 'The agent is temporarily unavailable. Please try sending your message again.')
            : getErrorMessage(error, 'Your message could not be sent. Please try again.')
        );
      } finally {
        setIsSending(false);
      }
    },
    [refreshSession, resetToLanding]
  );

  // Auto-send the scenario as the participant's first message exactly once (D4).
  useEffect(() => {
    if (view !== 'chat' || !session) return;
    if (session.isLocked || session.surveyCompleted) return;
    if (messages.length > 0 || openingSentRef.current) return;
    openingSentRef.current = true;
    const opening = (session.openingMessage || session.context.participantScenario || '').trim();
    if (!opening) return;
    void performSend(OPENING_CLIENT_MESSAGE_ID, opening, true);
  }, [view, session, messages.length, performSend]);

  const handleSend = (content: string) => {
    if (!session || isSending || session.isLocked) return;
    // A failed send keeps its id so the retry (even after editing) is idempotent.
    const clientMessageId =
      pendingSend && !pendingSend.isOpening ? pendingSend.clientMessageId : createClientMessageId();
    void performSend(clientMessageId, content, false);
  };

  const handleRetry = () => {
    if (!pendingSend || isSending) return;
    const content = pendingSend.isOpening ? pendingSend.content : draft.trim() || pendingSend.content;
    void performSend(pendingSend.clientMessageId, content, pendingSend.isOpening);
  };

  // ---------------------------------------------------------------------------
  // Survey
  // ---------------------------------------------------------------------------

  const handleSurveySubmit = async (responses: SurveyResponse[]) => {
    if (isSubmittingSurvey) return;
    setIsSubmittingSurvey(true);
    try {
      const result = await sessionApi.submitSurvey(responses);
      setCompletionCode(result.completionCode);
      setSession((prev) => (prev ? { ...prev, surveyCompleted: true, completionCode: result.completionCode } : prev));
      setView('completion');
    } catch (error: unknown) {
      if (hasErrorCode(error, 'SESSION_INVALID')) {
        resetToLanding(getErrorMessage(error));
        return;
      }
      if (hasErrorCode(error, 'SESSION_NOT_LOCKED') || hasErrorCode(error, 'SESSION_COMPLETED')) {
        await refreshSession();
        return;
      }
      toast({ title: 'Could not submit the questionnaire', description: getErrorMessage(error), variant: 'destructive' });
    } finally {
      setIsSubmittingSurvey(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" aria-hidden="true" />
          <p className="text-muted-foreground">Loading…</p>
        </div>
      </div>
    );
  }

  if (view === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" aria-hidden="true" />
              Connection problem
            </CardTitle>
            <CardDescription>{fatalError || 'The study could not be loaded.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => void bootstrap()} className="w-full">
              Try again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === 'landing') {
    return <LandingScreen onBegin={handleBegin} isStarting={isStarting} />;
  }

  if (view === 'completion') {
    return <CompletionScreen code={completionCode} onRefresh={() => void refreshSession()} />;
  }

  if (!session) {
    // Defensive: chat/survey views always have a session.
    return <LandingScreen onBegin={handleBegin} isStarting={isStarting} />;
  }

  if (view === 'survey') {
    return (
      <SurveyScreen
        title="About your conversation"
        description={`Please rate your experience with ${session.agent.displayName}. There are ${postChatSurveyQuestions.length} statements; indicate how much you agree with each.`}
        questions={postChatSurveyQuestions}
        onSubmit={handleSurveySubmit}
        isSubmitting={isSubmittingSurvey}
      />
    );
  }

  const isLocked = session.isLocked && !session.surveyCompleted;
  const openingPending = messages.length === 0 && !isLocked;
  const pendingMessage: ChatMessage | null =
    isSending && pendingSend
      ? {
          id: `pending-${pendingSend.clientMessageId}`,
          sequence: Number.MAX_SAFE_INTEGER,
          role: 'user',
          content: pendingSend.content,
          createdAt: new Date().toISOString(),
        }
      : null;

  return (
    <div className="h-screen flex flex-col bg-background">
      <ChatHeader
        agentName={session.agent.displayName}
        interactionCount={session.interactionCount}
        maxInteractions={session.maxInteractions}
      />

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <aside className="lg:w-80 xl:w-96 flex-shrink-0 border-b lg:border-b-0 lg:border-r bg-panel p-3 lg:p-4 overflow-y-auto max-h-[40vh] lg:max-h-none">
          <ScenarioPanel title={session.context.title} scenario={session.context.participantScenario} />
        </aside>

        <main className="flex-1 flex flex-col min-w-0 min-h-0">
          <ChatWindow
            agentName={session.agent.displayName}
            messages={messages}
            pendingMessage={pendingMessage}
            isAgentTyping={isSending}
            isLocked={isLocked}
            draft={draft}
            onDraftChange={setDraft}
            onSend={handleSend}
            inputDisabled={isSending || isLocked || openingPending}
            inputPlaceholder={
              openingPending ? 'Please wait for the conversation to start…' : `Message ${session.agent.displayName}...`
            }
            error={sendError ? { message: sendError, onRetry: handleRetry } : null}
            onContinueToSurvey={() => setView('survey')}
          />
        </main>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Landing
// -----------------------------------------------------------------------------

interface LandingScreenProps {
  onBegin: () => void;
  isStarting: boolean;
}

function LandingScreen({ onBegin, isStarting }: LandingScreenProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg shadow-card animate-fade-in">
        <CardHeader className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mx-auto mb-3" aria-hidden="true">
            <MessageSquareText className="w-7 h-7 text-primary" />
          </div>
          <CardTitle className="text-2xl">Customer Service Conversation Study</CardTitle>
          <CardDescription>Thank you for taking part.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ul className="space-y-3 text-sm text-foreground list-disc pl-5">
            <li>You will chat with a customer service agent about a situation that will be described to you.</li>
            <li>Read the situation, then respond to the agent as you naturally would. The conversation has a fixed number of exchanges, shown at the top of the screen.</li>
            <li>Afterwards you will answer a short questionnaire about the conversation.</li>
            <li>At the end you will receive a completion code to enter in the survey. Please keep this window open until you have it.</li>
          </ul>
          <Button onClick={onBegin} disabled={isStarting} size="lg" className="w-full">
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                Starting…
              </>
            ) : (
              'Begin'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Completion
// -----------------------------------------------------------------------------

interface CompletionScreenProps {
  code: number | null;
  onRefresh: () => void;
}

function CompletionScreen({ code, onRefresh }: CompletionScreenProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const codeText = code !== null ? String(code) : '';

  const handleCopy = async () => {
    if (!codeText) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({
        title: 'Could not copy automatically',
        description: 'Please write the code down or select it and copy it manually.',
      });
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-lg text-center shadow-card animate-fade-in">
        <CardHeader>
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent/20 mx-auto mb-3" aria-hidden="true">
            <CheckCircle2 className="w-9 h-9 text-accent" />
          </div>
          <CardTitle className="text-2xl">Thank you!</CardTitle>
          <CardDescription>You have completed the conversation and the questionnaire.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <p className="text-sm text-muted-foreground mb-2">Your completion code</p>
            {code !== null ? (
              <p
                className="text-5xl sm:text-6xl font-bold tracking-[0.25em] text-primary font-mono select-all"
                data-testid="completion-code"
                aria-label={`Completion code ${codeText}`}
              >
                {codeText}
              </p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Your code is being retrieved…</p>
                <Button variant="outline" size="sm" onClick={onRefresh}>
                  Reload code
                </Button>
              </div>
            )}
          </div>

          {code !== null && (
            <Button variant="outline" onClick={() => void handleCopy()} className="min-w-[160px]">
              {copied ? (
                <>
                  <Check className="w-4 h-4 mr-2" aria-hidden="true" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4 mr-2" aria-hidden="true" />
                  Copy code
                </>
              )}
            </Button>
          )}

          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Please return to the Qualtrics survey and enter this code where asked.
            </p>
            <p>You may now close this window. If you reopen it, the same code will be shown again.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
