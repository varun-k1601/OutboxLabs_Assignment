import { addDays, format, setHours, startOfDay } from 'date-fns';
import { CalendarClock, Clock } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { useDismiss } from '@/hooks/useDismiss';
import { cn } from '@/lib/cn';

const LOCAL_INPUT_FORMAT = "yyyy-MM-dd'T'HH:mm";
const PRESET_HOURS = [9, 10, 11, 15];

interface SendLaterButtonProps {
  // the parent does the actual scheduling
  onSchedule: (startAt: Date) => void;
  disabled?: boolean;
}

// Send Later popover with a date/time picker and a few presets
export function SendLaterButton({ onSchedule, disabled }: SendLaterButtonProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  const tomorrow = startOfDay(addDays(new Date(), 1));
  const presets = PRESET_HOURS.map((hour) => setHours(tomorrow, hour));

  const toggle = () => {
    if (!open) {
      setValue(format(new Date(Date.now() + 60 * 60_000), LOCAL_INPUT_FORMAT));
      setError(null);
    }
    setOpen(!open);
  };

  const confirm = () => {
    const startAt = new Date(value); // datetime-local is in the browser's time zone
    if (Number.isNaN(startAt.getTime())) return setError('Pick a date and time');
    if (startAt.getTime() <= Date.now()) return setError('Pick a time in the future');
    setOpen(false);
    onSchedule(startAt);
  };

  return (
    <div ref={ref} className="relative">
      <Button variant="secondary" onClick={toggle} disabled={disabled} aria-expanded={open} icon={<Clock className="size-4" />}>
        Send Later
      </Button>

      {open && (
        <div
          role="dialog"
          aria-label="Send later"
          className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-xl"
        >
          <h2 className="text-sm font-semibold text-gray-900">Send Later</h2>
          <Input
            type="datetime-local"
            aria-label="Start date and time"
            className="mt-3"
            value={value}
            min={format(new Date(), LOCAL_INPUT_FORMAT)}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            invalid={Boolean(error)}
          />
          {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}

          <ul className="mt-3 space-y-0.5">
            {presets.map((preset) => {
              const presetValue = format(preset, LOCAL_INPUT_FORMAT);
              return (
                <li key={presetValue}>
                  <button
                    type="button"
                    onClick={() => {
                      setValue(presetValue);
                      setError(null);
                    }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                      value === presetValue ? 'bg-brand-50 font-medium text-brand-800' : 'text-gray-700 hover:bg-gray-50',
                    )}
                  >
                    <CalendarClock className="size-4 text-gray-400" />
                    Tomorrow, {format(preset, 'h:mm a')}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-4 flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button size="sm" onClick={confirm}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
