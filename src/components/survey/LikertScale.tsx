import { cn } from '@/lib/utils';

interface LikertScaleProps {
  value: number | null;
  onChange: (value: number) => void;
  showLabels?: boolean;
}

const likertLabels = [
  'Strongly Disagree',
  'Disagree',
  'Somewhat Disagree',
  'Neutral',
  'Somewhat Agree',
  'Agree',
  'Strongly Agree',
];

export function LikertScale({ value, onChange, showLabels = true }: LikertScaleProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        {[1, 2, 3, 4, 5, 6, 7].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => onChange(num)}
            className={cn(
              'likert-option transition-all duration-200',
              value === num
                ? 'likert-option-active scale-110'
                : 'likert-option-inactive hover:scale-105'
            )}
            aria-label={likertLabels[num - 1]}
          >
            {num}
          </button>
        ))}
      </div>
      {showLabels && (
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Strongly disagree</span>
          <span>Strongly agree</span>
        </div>
      )}
    </div>
  );
}
