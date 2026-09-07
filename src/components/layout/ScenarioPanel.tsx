import { FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ScenarioPanelProps {
  /** Context title from the API (e.g. "Missing Food Item"). */
  title: string;
  /** `context.participantScenario` from the API — the situation the participant is in. */
  scenario: string;
  className?: string;
}

/**
 * The scenario card. It shows exactly what the API returns for the participant
 * and nothing else — no policy text, no condition information.
 */
export function ScenarioPanel({ title, scenario, className }: ScenarioPanelProps) {
  return (
    <section
      className={cn('rounded-lg border bg-card shadow-card', className)}
      aria-labelledby="scenario-heading"
      data-testid="scenario-panel"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <FileText className="w-4 h-4 text-primary" aria-hidden="true" />
        <h2 id="scenario-heading" className="text-sm font-semibold">
          Your situation
        </h2>
      </div>
      <div className="px-4 py-3 space-y-2">
        <p className="text-xs font-medium uppercase tracking-wide text-primary">{title}</p>
        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{scenario}</p>
        <p className="text-xs text-muted-foreground pt-1">
          Respond to the agent as you naturally would in this situation.
        </p>
      </div>
    </section>
  );
}
