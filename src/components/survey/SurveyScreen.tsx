import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { LikertScale } from './LikertScale';
import { SurveyQuestion, SurveyResponse } from '@/types';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface SurveyScreenProps {
  title: string;
  description: string;
  questions: SurveyQuestion[];
  onSubmit: (responses: SurveyResponse[]) => void;
  isSubmitting?: boolean;
}

/**
 * Full-screen, non-dismissible post-chat questionnaire. All items are shown on
 * one scrollable page; the submit button stays disabled until every item has
 * been answered.
 */
export function SurveyScreen({ title, description, questions, onSubmit, isSubmitting = false }: SurveyScreenProps) {
  const [responses, setResponses] = useState<Record<string, number>>({});

  const answeredCount = questions.filter((q) => responses[q.id] !== undefined).length;
  const total = questions.length;
  const progress = total === 0 ? 0 : (answeredCount / total) * 100;
  const isComplete = answeredCount === total && total > 0;

  const handleResponse = (questionId: string, value: number) => {
    setResponses((prev) => ({ ...prev, [questionId]: value }));
  };

  const handleSubmit = () => {
    if (!isComplete || isSubmitting) return;
    // Emit in instrument order so the payload is always post-1 … post-16.
    const surveyResponses: SurveyResponse[] = questions.map((q) => ({
      questionId: q.id,
      value: responses[q.id],
    }));
    onSubmit(surveyResponses);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-medium text-primary" data-testid="survey-progress">
                {answeredCount} / {total} answered
              </p>
            </div>
          </div>
          <Progress value={progress} className="mt-4 h-2" aria-label="Questionnaire progress" />
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 space-y-8">
          {questions.map((question, index) => {
            const answered = responses[question.id] !== undefined;
            return (
              <section key={question.id} className="space-y-4" aria-labelledby={`q-${question.id}`}>
                <div className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-medium border-2 border-primary/20">
                    {index + 1}
                  </span>
                  <div className="flex-1">
                    {question.category && (
                      <span className="text-xs font-medium text-primary uppercase tracking-wide">{question.category}</span>
                    )}
                    <p id={`q-${question.id}`} className="text-foreground mt-1">
                      {question.text}
                    </p>
                  </div>
                  {answered && <CheckCircle2 className="w-5 h-5 text-accent flex-shrink-0" aria-label="Answered" />}
                </div>
                <div className="pl-10">
                  <LikertScale
                    value={responses[question.id] ?? null}
                    onChange={(value) => handleResponse(question.id, value)}
                  />
                </div>
              </section>
            );
          })}
        </div>
      </main>

      <footer className="border-t bg-card sticky bottom-0">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            {isComplete ? 'All questions answered.' : `${total - answeredCount} question${total - answeredCount === 1 ? '' : 's'} left`}
          </p>
          <Button onClick={handleSubmit} disabled={!isComplete || isSubmitting} className="min-w-[140px]">
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                Submitting…
              </>
            ) : (
              'Submit questionnaire'
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}
