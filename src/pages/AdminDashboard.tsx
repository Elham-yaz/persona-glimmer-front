import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { adminApi, getAdminKey, setAdminKey, clearAdminKey, getErrorMessage, hasErrorCode } from '@/lib/api';
import { postChatSurveyQuestions } from '@/data/surveyQuestions';
import { useToast } from '@/hooks/use-toast';
import type {
  AdminCellCount,
  AdminDashboardData,
  AdminExportType,
  AdminMessage,
  AdminSession,
  AdminSessionDetail,
  AdminSurveyResponse,
  SessionStatus,
} from '@/types';
import {
  BarChart3,
  CheckCircle2,
  Download,
  KeyRound,
  Loader2,
  Lock,
  LogOut,
  MessageSquare,
  RefreshCw,
  Users,
} from 'lucide-react';

const PAGE_SIZE = 100;

// The 4 × 3 design (docs/STUDY2_API.md §0). Codes are taken from the
// dashboard payload so nothing about the conditions is hardcoded in the bundle.
const AGENT_CONDITION_IDS = [1, 2, 3, 4] as const;
const CONTEXT_IDS = [1, 2, 3] as const;

interface CellAxis {
  id: number;
  code: string;
}

function axisFromCells(
  ids: readonly number[],
  cells: AdminCellCount[] | undefined,
  pick: (c: AdminCellCount) => [number, string],
  fallbackLabel: string
): CellAxis[] {
  const codes = new Map<number, string>();
  for (const cell of cells ?? []) {
    const [id, code] = pick(cell);
    if (!codes.has(id)) codes.set(id, code);
  }
  return ids.map((id) => ({ id, code: codes.get(id) ?? `${fallbackLabel} ${id}` }));
}

const QUESTION_TEXT: Record<string, string> = Object.fromEntries(
  postChatSurveyQuestions.map((q) => [q.id, q.text])
);

function sessionStatus(s: Pick<AdminSession, 'isLocked' | 'surveyCompleted'>): SessionStatus {
  if (s.surveyCompleted) return 'completed';
  if (s.isLocked) return 'locked';
  return 'in_progress';
}

function StatusBadge({ status }: { status: SessionStatus }) {
  const styles: Record<SessionStatus, string> = {
    in_progress: 'bg-blue-100 text-blue-800',
    locked: 'bg-amber-100 text-amber-800',
    completed: 'bg-green-100 text-green-800',
  };
  const labels: Record<SessionStatus, string> = {
    in_progress: 'In progress',
    locked: 'Locked',
    completed: 'Completed',
  };
  return <span className={`px-2 py-1 rounded text-xs whitespace-nowrap ${styles[status]}`}>{labels[status]}</span>;
}

function RoleBadge({ role }: { role: 'user' | 'agent' }) {
  return (
    <span className={`px-2 py-1 rounded text-xs ${role === 'user' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
      {role}
    </span>
  );
}

function shortId(id: string): string {
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

const selectClass =
  'h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring';

interface SessionFilters {
  agentConditionId: string;
  contextId: string;
  status: string;
}

interface MessageFilters {
  sessionId: string;
  agentConditionId: string;
  contextId: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => !!getAdminKey());
  const [keyInput, setKeyInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);

  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [sessionsTotal, setSessionsTotal] = useState(0);
  const [sessionsOffset, setSessionsOffset] = useState(0);
  const [sessionFilters, setSessionFilters] = useState<SessionFilters>({ agentConditionId: '', contextId: '', status: '' });
  const [sessionsLoading, setSessionsLoading] = useState(false);

  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [messagesTotal, setMessagesTotal] = useState(0);
  const [messagesOffset, setMessagesOffset] = useState(0);
  const [messageFilters, setMessageFilters] = useState<MessageFilters>({ sessionId: '', agentConditionId: '', contextId: '' });
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [surveys, setSurveys] = useState<AdminSurveyResponse[]>([]);
  const [surveysTotal, setSurveysTotal] = useState(0);
  const [surveysOffset, setSurveysOffset] = useState(0);
  const [surveySessionFilter, setSurveySessionFilter] = useState('');
  const [surveysLoading, setSurveysLoading] = useState(false);

  const [selectedSession, setSelectedSession] = useState<AdminSessionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [exporting, setExporting] = useState<AdminExportType | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Snapshot of the filters/pages currently shown, kept current after every
  // render so "Refresh" reloads the view the researcher is actually looking at
  // (a plain closure would capture the first render's empty filters).
  const currentView = useRef({
    sessionFilters,
    sessionsOffset,
    messageFilters,
    messagesOffset,
    surveySessionFilter,
    surveysOffset,
  });
  useEffect(() => {
    currentView.current = {
      sessionFilters,
      sessionsOffset,
      messageFilters,
      messagesOffset,
      surveySessionFilter,
      surveysOffset,
    };
  });

  const handleApiError = useCallback(
    (error: unknown, title: string) => {
      if (hasErrorCode(error, 'ADMIN_UNAUTHORIZED')) {
        clearAdminKey();
        setIsAuthorized(false);
        toast({ title: 'Admin key rejected', description: 'Please enter the admin API key again.', variant: 'destructive' });
        return;
      }
      toast({ title, description: getErrorMessage(error), variant: 'destructive' });
    },
    [toast]
  );

  // ---------------------------------------------------------------------------
  // Loaders
  // ---------------------------------------------------------------------------

  const loadDashboard = useCallback(async () => {
    try {
      const data = await adminApi.getDashboard();
      setDashboard(data);
    } catch (error: unknown) {
      handleApiError(error, 'Could not load dashboard');
    }
  }, [handleApiError]);

  const loadSessions = useCallback(
    async (offset: number, filters: SessionFilters) => {
      setSessionsLoading(true);
      try {
        const data = await adminApi.getSessions({
          limit: PAGE_SIZE,
          offset,
          agentConditionId: filters.agentConditionId ? Number(filters.agentConditionId) : undefined,
          contextId: filters.contextId ? Number(filters.contextId) : undefined,
          status: (filters.status || undefined) as SessionStatus | undefined,
        });
        setSessions(data.sessions);
        setSessionsTotal(data.total);
        setSessionsOffset(offset);
      } catch (error: unknown) {
        handleApiError(error, 'Could not load sessions');
      } finally {
        setSessionsLoading(false);
      }
    },
    [handleApiError]
  );

  const loadMessages = useCallback(
    async (offset: number, filters: MessageFilters) => {
      setMessagesLoading(true);
      try {
        const data = await adminApi.getMessages({
          limit: PAGE_SIZE,
          offset,
          sessionId: filters.sessionId.trim() || undefined,
          agentConditionId: filters.agentConditionId ? Number(filters.agentConditionId) : undefined,
          contextId: filters.contextId ? Number(filters.contextId) : undefined,
        });
        setMessages(data.messages);
        setMessagesTotal(data.total);
        setMessagesOffset(offset);
      } catch (error: unknown) {
        handleApiError(error, 'Could not load messages');
      } finally {
        setMessagesLoading(false);
      }
    },
    [handleApiError]
  );

  const loadSurveys = useCallback(
    async (offset: number, sessionId: string) => {
      setSurveysLoading(true);
      try {
        const data = await adminApi.getSurveys({
          limit: PAGE_SIZE,
          offset,
          sessionId: sessionId.trim() || undefined,
        });
        setSurveys(data.responses);
        setSurveysTotal(data.total);
        setSurveysOffset(offset);
      } catch (error: unknown) {
        handleApiError(error, 'Could not load survey responses');
      } finally {
        setSurveysLoading(false);
      }
    },
    [handleApiError]
  );

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      await loadDashboard();
      if (!getAdminKey()) return; // key was rejected
      const view = currentView.current;
      await Promise.all([
        loadSessions(view.sessionsOffset, view.sessionFilters),
        loadMessages(view.messagesOffset, view.messageFilters),
        loadSurveys(view.surveysOffset, view.surveySessionFilter),
      ]);
    } finally {
      setIsLoading(false);
    }
  }, [loadDashboard, loadSessions, loadMessages, loadSurveys]);

  useEffect(() => {
    if (isAuthorized) {
      void loadAll();
    } else {
      setIsLoading(false);
    }
  }, [isAuthorized, loadAll]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = keyInput.trim();
    if (!key) return;
    try {
      setIsVerifying(true);
      await adminApi.verifyKey(key);
      setAdminKey(key);
      setKeyInput('');
      setIsAuthorized(true);
    } catch (error: unknown) {
      toast({
        title: 'Access denied',
        description: getErrorMessage(error, 'The admin key was rejected by the server.'),
        variant: 'destructive',
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogout = () => {
    clearAdminKey();
    setIsAuthorized(false);
    navigate('/');
  };

  const handleViewSession = async (id: string) => {
    setDetailLoading(true);
    try {
      const detail = await adminApi.getSession(id);
      setSelectedSession(detail);
    } catch (error: unknown) {
      handleApiError(error, 'Could not load session');
    } finally {
      setDetailLoading(false);
    }
  };

  const handleExport = async (type: AdminExportType) => {
    setExporting(type);
    try {
      await adminApi.exportCsv(type);
    } catch (error: unknown) {
      handleApiError(error, `Could not export ${type}`);
    } finally {
      setExporting(null);
    }
  };

  const cellGrid = useMemo(() => {
    const map = new Map<string, AdminCellCount>();
    for (const cell of dashboard?.cells ?? []) {
      map.set(`${cell.agentConditionId}-${cell.contextId}`, cell);
    }
    return map;
  }, [dashboard]);

  const AGENT_CONDITIONS = useMemo(
    () => axisFromCells(AGENT_CONDITION_IDS, dashboard?.cells, (c) => [c.agentConditionId, c.agentCode], 'Agent'),
    [dashboard]
  );
  const CONTEXTS = useMemo(
    () => axisFromCells(CONTEXT_IDS, dashboard?.cells, (c) => [c.contextId, c.contextCode], 'Context'),
    [dashboard]
  );

  // ---------------------------------------------------------------------------
  // Render: key gate
  // ---------------------------------------------------------------------------

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="w-5 h-5" />
              Admin Access
            </CardTitle>
            <CardDescription>Enter the admin API key to access the research dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <Input
                type="password"
                placeholder="Admin API key"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                autoFocus
              />
              <Button type="submit" className="w-full" disabled={isVerifying || !keyInput.trim()}>
                {isVerifying ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'Access Dashboard'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
          <p className="text-muted-foreground">Connecting to backend...</p>
          <p className="text-sm text-muted-foreground/70">This may take a moment if the service is starting up</p>
        </div>
      </div>
    );
  }

  const totals = dashboard?.totals;

  const ExportButton = ({ type, label }: { type: AdminExportType; label: string }) => (
    <Button onClick={() => void handleExport(type)} variant="outline" size="sm" disabled={exporting !== null}>
      {exporting === type ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
      {label}
    </Button>
  );

  const Pager = ({
    offset,
    total,
    loading,
    onPage,
  }: {
    offset: number;
    total: number;
    loading: boolean;
    onPage: (offset: number) => void;
  }) => (
    <div className="flex items-center justify-between text-sm text-muted-foreground pt-3">
      <span>
        {total === 0 ? 'No rows' : `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total}`}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={loading || offset === 0} onClick={() => onPage(Math.max(0, offset - PAGE_SIZE))}>
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || offset + PAGE_SIZE >= total}
          onClick={() => onPage(offset + PAGE_SIZE)}
        >
          Next
        </Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Study 2 · single-session data
              {dashboard?.assignmentMode ? ` · assignment: ${dashboard.assignmentMode}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => void loadAll()} variant="ghost" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button onClick={handleLogout} variant="outline">
              <LogOut className="w-4 h-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="sessions">Sessions ({sessionsTotal})</TabsTrigger>
            <TabsTrigger value="messages">Messages ({messagesTotal})</TabsTrigger>
            <TabsTrigger value="surveys">Surveys ({surveysTotal})</TabsTrigger>
          </TabsList>

          {/* ------------------------------------------------------------ */}
          {/* Dashboard                                                     */}
          {/* ------------------------------------------------------------ */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
              <StatCard title="Sessions" value={totals?.sessions ?? 0} icon={<Users className="h-4 w-4 text-muted-foreground" />} />
              <StatCard title="In progress" value={totals?.inProgress ?? 0} icon={<Loader2 className="h-4 w-4 text-muted-foreground" />} />
              <StatCard title="Locked" value={totals?.locked ?? 0} icon={<Lock className="h-4 w-4 text-muted-foreground" />} />
              <StatCard title="Completed" value={totals?.completed ?? 0} icon={<CheckCircle2 className="h-4 w-4 text-muted-foreground" />} />
              <StatCard title="Messages" value={totals?.messages ?? 0} icon={<MessageSquare className="h-4 w-4 text-muted-foreground" />} />
              <StatCard title="Survey responses" value={totals?.surveyResponses ?? 0} icon={<BarChart3 className="h-4 w-4 text-muted-foreground" />} />
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle>Cell distribution</CardTitle>
                    <CardDescription>Agent condition × context — started / completed sessions</CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <ExportButton type="sessions" label="Export sessions" />
                    <ExportButton type="messages" label="Export messages" />
                    <ExportButton type="surveys" label="Export surveys" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Agent condition</TableHead>
                        {CONTEXTS.map((ctx) => (
                          <TableHead key={ctx.id} className="text-center">
                            {ctx.code}
                          </TableHead>
                        ))}
                        <TableHead className="text-center">Row total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {AGENT_CONDITIONS.map((agent) => {
                        let rowStarted = 0;
                        let rowCompleted = 0;
                        const cells = CONTEXTS.map((ctx) => {
                          const cell = cellGrid.get(`${agent.id}-${ctx.id}`);
                          const started = cell?.started ?? 0;
                          const completed = cell?.completed ?? 0;
                          rowStarted += started;
                          rowCompleted += completed;
                          return (
                            <TableCell key={ctx.id} className="text-center font-mono">
                              <span className="font-semibold">{started}</span>
                              <span className="text-muted-foreground"> / {completed}</span>
                            </TableCell>
                          );
                        });
                        return (
                          <TableRow key={agent.id}>
                            <TableCell className="font-medium">
                              {agent.id} · {agent.code}
                            </TableCell>
                            {cells}
                            <TableCell className="text-center font-mono text-muted-foreground">
                              {rowStarted} / {rowCompleted}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Each cell shows started / completed.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------------ */}
          {/* Sessions                                                      */}
          {/* ------------------------------------------------------------ */}
          <TabsContent value="sessions" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle>Sessions</CardTitle>
                    <CardDescription>Click a row for the transcript, survey responses and completion code</CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap items-center">
                    <select
                      className={selectClass}
                      aria-label="Filter by agent condition"
                      value={sessionFilters.agentConditionId}
                      onChange={(e) => {
                        const next = { ...sessionFilters, agentConditionId: e.target.value };
                        setSessionFilters(next);
                        void loadSessions(0, next);
                      }}
                    >
                      <option value="">All agents</option>
                      {AGENT_CONDITIONS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id} · {a.code}
                        </option>
                      ))}
                    </select>
                    <select
                      className={selectClass}
                      aria-label="Filter by context"
                      value={sessionFilters.contextId}
                      onChange={(e) => {
                        const next = { ...sessionFilters, contextId: e.target.value };
                        setSessionFilters(next);
                        void loadSessions(0, next);
                      }}
                    >
                      <option value="">All contexts</option>
                      {CONTEXTS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id} · {c.code}
                        </option>
                      ))}
                    </select>
                    <select
                      className={selectClass}
                      aria-label="Filter by status"
                      value={sessionFilters.status}
                      onChange={(e) => {
                        const next = { ...sessionFilters, status: e.target.value };
                        setSessionFilters(next);
                        void loadSessions(0, next);
                      }}
                    >
                      <option value="">All statuses</option>
                      <option value="in_progress">In progress</option>
                      <option value="locked">Locked</option>
                      <option value="completed">Completed</option>
                    </select>
                    <ExportButton type="sessions" label="Export CSV" />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>External id</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Context</TableHead>
                        <TableHead>Interactions</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Code</TableHead>
                        <TableHead>Model</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sessionsLoading ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            Loading…
                          </TableCell>
                        </TableRow>
                      ) : sessions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground">
                            No sessions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        sessions.map((s) => (
                          <TableRow key={s.id} className="cursor-pointer" onClick={() => void handleViewSession(s.id)}>
                            <TableCell className="text-sm whitespace-nowrap">{formatDateTime(s.createdAt)}</TableCell>
                            <TableCell className="font-mono text-xs" title={s.id}>
                              {shortId(s.id)}
                            </TableCell>
                            <TableCell className="font-mono text-xs">{s.externalId || '—'}</TableCell>
                            <TableCell className="text-sm">{s.agentCode}</TableCell>
                            <TableCell className="text-sm">{s.contextCode}</TableCell>
                            <TableCell className="text-sm">{s.interactionCount}</TableCell>
                            <TableCell>
                              <StatusBadge status={sessionStatus(s)} />
                            </TableCell>
                            <TableCell className="font-mono">{s.completionCode ?? '—'}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {s.model} · v{s.promptVersion}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  void handleViewSession(s.id);
                                }}
                              >
                                View
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Pager
                  offset={sessionsOffset}
                  total={sessionsTotal}
                  loading={sessionsLoading}
                  onPage={(offset) => void loadSessions(offset, sessionFilters)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------------ */}
          {/* Messages                                                      */}
          {/* ------------------------------------------------------------ */}
          <TabsContent value="messages" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle>Messages</CardTitle>
                    <CardDescription>All participant and agent messages</CardDescription>
                  </div>
                  <form
                    className="flex gap-2 flex-wrap items-center"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void loadMessages(0, messageFilters);
                    }}
                  >
                    <Input
                      placeholder="Session id"
                      aria-label="Filter messages by session id"
                      value={messageFilters.sessionId}
                      onChange={(e) => setMessageFilters({ ...messageFilters, sessionId: e.target.value })}
                      className="w-72 h-9 font-mono text-xs"
                    />
                    <select
                      className={selectClass}
                      aria-label="Filter messages by agent condition"
                      value={messageFilters.agentConditionId}
                      onChange={(e) => {
                        const next = { ...messageFilters, agentConditionId: e.target.value };
                        setMessageFilters(next);
                        void loadMessages(0, next);
                      }}
                    >
                      <option value="">All agents</option>
                      {AGENT_CONDITIONS.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.id} · {a.code}
                        </option>
                      ))}
                    </select>
                    <select
                      className={selectClass}
                      aria-label="Filter messages by context"
                      value={messageFilters.contextId}
                      onChange={(e) => {
                        const next = { ...messageFilters, contextId: e.target.value };
                        setMessageFilters(next);
                        void loadMessages(0, next);
                      }}
                    >
                      <option value="">All contexts</option>
                      {CONTEXTS.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.id} · {c.code}
                        </option>
                      ))}
                    </select>
                    <Button type="submit" variant="secondary" size="sm">
                      Apply
                    </Button>
                    <ExportButton type="messages" label="Export CSV" />
                  </form>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>#</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Context</TableHead>
                        <TableHead>Message</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {messagesLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            Loading…
                          </TableCell>
                        </TableRow>
                      ) : messages.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No messages found
                          </TableCell>
                        </TableRow>
                      ) : (
                        messages.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="text-sm whitespace-nowrap">{formatDateTime(m.createdAt)}</TableCell>
                            <TableCell className="font-mono text-xs" title={m.sessionId}>
                              <button
                                type="button"
                                className="underline-offset-2 hover:underline"
                                onClick={() => void handleViewSession(m.sessionId)}
                              >
                                {shortId(m.sessionId)}
                              </button>
                            </TableCell>
                            <TableCell className="text-sm">{m.sequence}</TableCell>
                            <TableCell>
                              <RoleBadge role={m.role} />
                              {m.isFallback && <span className="ml-1 text-xs text-amber-700">(fallback)</span>}
                            </TableCell>
                            <TableCell className="text-xs">{m.agentCode}</TableCell>
                            <TableCell className="text-xs">{m.contextCode}</TableCell>
                            <TableCell className="max-w-md truncate" title={m.content}>
                              {m.content}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Pager
                  offset={messagesOffset}
                  total={messagesTotal}
                  loading={messagesLoading}
                  onPage={(offset) => void loadMessages(offset, messageFilters)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ------------------------------------------------------------ */}
          {/* Surveys                                                       */}
          {/* ------------------------------------------------------------ */}
          <TabsContent value="surveys" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <CardTitle>Survey responses</CardTitle>
                    <CardDescription>Post-chat questionnaire, one row per item</CardDescription>
                  </div>
                  <form
                    className="flex gap-2 flex-wrap items-center"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void loadSurveys(0, surveySessionFilter);
                    }}
                  >
                    <Input
                      placeholder="Session id"
                      aria-label="Filter survey responses by session id"
                      value={surveySessionFilter}
                      onChange={(e) => setSurveySessionFilter(e.target.value)}
                      className="w-72 h-9 font-mono text-xs"
                    />
                    <Button type="submit" variant="secondary" size="sm">
                      Apply
                    </Button>
                    <ExportButton type="surveys" label="Export CSV" />
                  </form>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Session</TableHead>
                        <TableHead>Question</TableHead>
                        <TableHead>Value (1–7)</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Context</TableHead>
                        <TableHead>Code</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {surveysLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            Loading…
                          </TableCell>
                        </TableRow>
                      ) : surveys.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground">
                            No survey responses found
                          </TableCell>
                        </TableRow>
                      ) : (
                        surveys.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm whitespace-nowrap">{formatDateTime(r.createdAt)}</TableCell>
                            <TableCell className="font-mono text-xs" title={r.sessionId}>
                              <button
                                type="button"
                                className="underline-offset-2 hover:underline"
                                onClick={() => void handleViewSession(r.sessionId)}
                              >
                                {shortId(r.sessionId)}
                              </button>
                            </TableCell>
                            <TableCell className="text-sm" title={QUESTION_TEXT[r.questionId]}>
                              {r.questionId}
                            </TableCell>
                            <TableCell className="font-mono">{r.responseValue}</TableCell>
                            <TableCell className="text-xs">{r.agentCode}</TableCell>
                            <TableCell className="text-xs">{r.contextCode}</TableCell>
                            <TableCell className="font-mono">{r.completionCode ?? '—'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                <Pager
                  offset={surveysOffset}
                  total={surveysTotal}
                  loading={surveysLoading}
                  onPage={(offset) => void loadSurveys(offset, surveySessionFilter)}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Session detail modal */}
        {(selectedSession || detailLoading) && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" role="dialog" aria-modal="true">
            <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              {detailLoading || !selectedSession ? (
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                  Loading session…
                </CardContent>
              ) : (
                <>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="font-mono text-base break-all">{selectedSession.id}</CardTitle>
                        <CardDescription>
                          {selectedSession.agentCode} × {selectedSession.contextCode} · created {formatDateTime(selectedSession.createdAt)}
                        </CardDescription>
                      </div>
                      <Button onClick={() => setSelectedSession(null)} variant="outline" size="sm">
                        Close
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Status</p>
                        <StatusBadge status={sessionStatus(selectedSession)} />
                      </div>
                      <div>
                        <p className="text-muted-foreground">Interactions</p>
                        <p className="font-medium">{selectedSession.interactionCount}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Completion code</p>
                        <p className="font-mono font-medium text-lg">{selectedSession.completionCode ?? '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">External id</p>
                        <p className="font-mono text-xs break-all">{selectedSession.externalId || '—'}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Model</p>
                        <p className="text-xs">
                          {selectedSession.model} · prompt v{selectedSession.promptVersion}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Locked at</p>
                        <p className="text-xs">{formatDateTime(selectedSession.lockedAt)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Completed at</p>
                        <p className="text-xs">{formatDateTime(selectedSession.completedAt)}</p>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">Transcript ({selectedSession.messages.length})</h3>
                      <div className="rounded-md border max-h-80 overflow-y-auto divide-y">
                        {selectedSession.messages.length === 0 ? (
                          <p className="p-4 text-sm text-muted-foreground">No messages.</p>
                        ) : (
                          [...selectedSession.messages]
                            .sort((a, b) => a.sequence - b.sequence)
                            .map((m) => (
                              <div key={m.id} className="p-3 text-sm flex gap-3">
                                <span className="w-6 text-right text-xs text-muted-foreground font-mono flex-shrink-0">{m.sequence}</span>
                                <div className="flex-shrink-0">
                                  <RoleBadge role={m.role} />
                                </div>
                                <p className="whitespace-pre-wrap break-words flex-1">{m.content}</p>
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(m.createdAt)}</span>
                              </div>
                            ))
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold mb-2">Survey responses ({selectedSession.surveyResponses.length})</h3>
                      <div className="rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Id</TableHead>
                              <TableHead>Item</TableHead>
                              <TableHead>Value</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {selectedSession.surveyResponses.length === 0 ? (
                              <TableRow>
                                <TableCell colSpan={3} className="text-center text-muted-foreground">
                                  No survey responses
                                </TableCell>
                              </TableRow>
                            ) : (
                              [...selectedSession.surveyResponses]
                                .sort(
                                  (a, b) =>
                                    parseInt(a.questionId.replace(/\D/g, ''), 10) - parseInt(b.questionId.replace(/\D/g, ''), 10)
                                )
                                .map((r) => (
                                  <TableRow key={r.id ?? r.questionId}>
                                    <TableCell className="font-mono text-xs">{r.questionId}</TableCell>
                                    <TableCell className="text-sm">{QUESTION_TEXT[r.questionId] ?? '—'}</TableCell>
                                    <TableCell className="font-mono">{r.responseValue}</TableCell>
                                  </TableRow>
                                ))
                            )}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  </CardContent>
                </>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ title, value, icon }: { title: string; value: number; icon: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
