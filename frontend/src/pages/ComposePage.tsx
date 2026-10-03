import { ArrowLeft, Info, Send } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { RecipientsField } from '@/components/compose/RecipientsField';
import { RichTextEditor, type RichTextValue } from '@/components/compose/RichTextEditor';
import { SendLaterButton } from '@/components/compose/SendLaterButton';
import { SenderSelect } from '@/components/compose/SenderSelect';
import { Button, IconButton } from '@/components/ui/Button';
import { Input } from '@/components/ui/Field';
import { useAppConfig } from '@/hooks/useAppConfig';
import { useScheduleCampaign } from '@/hooks/useEmails';
import { useSenders } from '@/hooks/useSenders';
import { describeWindow, formatChipTime, formatDuration, pluralize } from '@/lib/format';
import type { ScheduleCampaignInput, ScheduledCampaign } from '@/types/api';

type FieldName = 'sender' | 'recipients' | 'subject' | 'body' | 'delay' | 'hourlyLimit';
type Errors = Partial<Record<FieldName, string>>;

function Row({ label, htmlFor, error, children }: { label: string; htmlFor?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-gray-100 px-5 py-3.5 sm:flex-row sm:items-start sm:gap-4">
      <label htmlFor={htmlFor} className="w-20 shrink-0 text-sm font-medium text-gray-500 sm:pt-2.5">
        {label}
      </label>
      <div className="min-w-0 flex-1">
        {children}
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-red-600">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function NumberSetting(props: {
  id: string;
  label: string;
  suffix: string;
  value: string;
  min: number;
  onChange: (value: string) => void;
  hint: string;
  error?: string;
}) {
  return (
    <div className="flex flex-1 flex-col gap-1.5">
      <label htmlFor={props.id} className="text-sm font-medium text-gray-700">
        {props.label}
      </label>
      <div className="relative">
        <Input
          id={props.id}
          type="number"
          inputMode="numeric"
          min={props.min}
          placeholder="00"
          value={props.value}
          onChange={(event) => props.onChange(event.target.value)}
          invalid={Boolean(props.error)}
          className="pr-16"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-gray-400">{props.suffix}</span>
      </div>
      {props.error ? <p className="text-xs text-red-600">{props.error}</p> : <p className="text-xs text-gray-500">{props.hint}</p>}
    </div>
  );
}

function scheduledToast({ campaign, skipped, replayed }: ScheduledCampaign) {
  if (replayed) {
    toast.info('This campaign was already scheduled', { description: 'Nothing was scheduled twice.' });
    return;
  }
  const parts = [
    campaign.firstSendAt && `first ${formatChipTime(campaign.firstSendAt)}`,
    campaign.lastSendAt && campaign.totalRecipients > 1 && `last ${formatChipTime(campaign.lastSendAt)}`,
    skipped.duplicates > 0 && `${skipped.duplicates} duplicate${skipped.duplicates === 1 ? '' : 's'} skipped`,
    skipped.invalid.length > 0 && `${skipped.invalid.length} invalid skipped`,
  ].filter(Boolean);
  toast.success(`Scheduled ${pluralize(campaign.totalRecipients, 'email')}`, { description: parts.join(' · ') });
}

export function ComposePage() {
  const navigate = useNavigate();
  const config = useAppConfig();
  const senders = useSenders();
  const schedule = useScheduleCampaign();

  const [senderId, setSenderId] = useState('');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState<RichTextValue>({ html: '', text: '' });
  const [delaySeconds, setDelaySeconds] = useState('');
  const [hourlyLimit, setHourlyLimit] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  // one key per compose, so a double click or a retry doesn't schedule twice
  const idempotencyKey = useRef(crypto.randomUUID());

  const limits = config.data?.limits;
  const sender = senders.data?.find((candidate) => candidate.id === senderId);
  const senderCap = sender?.hourlyLimit ?? limits?.maxEmailsPerHourPerSender ?? 200;
  const minDelaySeconds = (limits?.minDelayBetweenEmailsMs ?? 0) / 1000;
  const per = describeWindow(limits?.rateLimitWindowSeconds ?? 3600);

  // defaults from the server config, but don't overwrite what the user already typed
  useEffect(() => {
    if (!senderId && senders.data?.[0]) setSenderId(senders.data[0].id);
  }, [senderId, senders.data]);
  useEffect(() => {
    if (limits) {
      setDelaySeconds((current) => current || String(Math.max(2, minDelaySeconds)));
      setHourlyLimit((current) => current || String(Math.min(50, limits.maxEmailsPerHourPerSender)));
    }
  }, [limits, minDelaySeconds]);

  const clearError = (field: FieldName) => setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));

  function validate(): Omit<ScheduleCampaignInput, 'startAt'> | null {
    const next: Errors = {};
    const delay = Number(delaySeconds);
    const limit = Number(hourlyLimit);
    if (!senderId) next.sender = 'Choose who sends this email';
    if (recipients.length === 0) next.recipients = 'Add at least one recipient (or upload a list)';
    if (!subject.trim()) next.subject = 'Subject is required';
    if (!body.text && !body.html) next.body = 'Write a message';
    if (delaySeconds === '' || !Number.isFinite(delay) || delay < 0) next.delay = 'Enter 0 or more seconds';
    if (hourlyLimit === '' || !Number.isInteger(limit) || limit < 1) next.hourlyLimit = 'Enter a whole number of at least 1';
    setErrors(next);
    if (Object.keys(next).length > 0) {
      toast.error('Please fix the highlighted fields');
      return null;
    }
    return {
      senderId,
      recipients,
      subject: subject.trim(),
      bodyHtml: body.html,
      bodyText: body.text,
      delayBetweenEmailsSeconds: delay,
      hourlyLimit: limit,
    };
  }

  function submit(startAt?: Date) {
    const input = validate();
    if (!input) return;
    schedule.mutate(
      { input: { ...input, startAt: startAt?.toISOString() }, idempotencyKey: idempotencyKey.current },
      {
        onSuccess: (result) => {
          scheduledToast(result);
          idempotencyKey.current = crypto.randomUUID();
          navigate('/dashboard/scheduled');
        },
        onError: (err) => toast.error('Could not schedule the campaign', { description: errorMessage(err) }),
      },
    );
  }

  const effectiveDelayMs = Math.max(Number(delaySeconds) * 1000 || 0, limits?.minDelayBetweenEmailsMs ?? 0);
  const effectiveLimit = Math.min(Number(hourlyLimit) || senderCap, senderCap);

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white/95 px-4 py-3 backdrop-blur sm:px-6">
        <IconButton label="Back" onClick={() => navigate(-1)}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <h1 className="text-lg font-semibold text-gray-900">Compose New Email</h1>
        <div className="ml-auto flex items-center gap-2">
          <SendLaterButton onSchedule={submit} disabled={schedule.isPending} />
          <Button onClick={() => submit()} loading={schedule.isPending} icon={<Send className="size-4" />}>
            Send
          </Button>
        </div>
      </header>

      <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6">
        <div className="rounded-xl border border-gray-200 bg-white shadow-xs">
          <Row label="From" htmlFor="compose-sender" error={errors.sender}>
            <SenderSelect
              id="compose-sender"
              value={senderId}
              onChange={(id) => {
                setSenderId(id);
                clearError('sender');
              }}
              invalid={Boolean(errors.sender)}
            />
          </Row>

          <Row label="To" htmlFor="compose-recipients" error={errors.recipients}>
            <RecipientsField
              id="compose-recipients"
              value={recipients}
              onChange={(next) => {
                setRecipients(next);
                clearError('recipients');
              }}
              max={limits?.maxRecipientsPerCampaign ?? 10_000}
              invalid={Boolean(errors.recipients)}
            />
          </Row>

          <Row label="Subject" htmlFor="compose-subject" error={errors.subject}>
            <Input
              id="compose-subject"
              value={subject}
              maxLength={250}
              placeholder="Subject"
              onChange={(event) => {
                setSubject(event.target.value);
                clearError('subject');
              }}
              invalid={Boolean(errors.subject)}
            />
          </Row>

          <div className="border-b border-gray-100 px-5 py-4">
            <div className="flex flex-col gap-4 sm:flex-row">
              <NumberSetting
                id="compose-delay"
                label="Delay between 2 emails"
                suffix="sec"
                min={0}
                value={delaySeconds}
                onChange={(value) => {
                  setDelaySeconds(value);
                  clearError('delay');
                }}
                hint={minDelaySeconds > 0 ? `The server enforces at least ${formatDuration(minDelaySeconds * 1000)} per sender.` : 'Gap between consecutive emails.'}
                error={errors.delay}
              />
              <NumberSetting
                id="compose-hourly-limit"
                label={per === 'hour' ? 'Hourly Limit' : `Limit per ${per}`}
                suffix={`/ ${per}`}
                min={1}
                value={hourlyLimit}
                onChange={(value) => {
                  setHourlyLimit(value);
                  clearError('hourlyLimit');
                }}
                hint={`This sender is capped at ${senderCap.toLocaleString()} emails per ${per}.`}
                error={errors.hourlyLimit}
              />
            </div>
            {recipients.length > 0 && (
              <p className="mt-3 flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                <Info className="mt-px size-3.5 shrink-0 text-gray-400" />
                {pluralize(recipients.length, 'email')} will go out one every {formatDuration(effectiveDelayMs)}, at most{' '}
                {effectiveLimit.toLocaleString()} per {per}. Anything over the limit moves to the next {per} — nothing is dropped.
              </p>
            )}
          </div>

          <div className="p-5">
            <RichTextEditor
              onChange={(value) => {
                setBody(value);
                clearError('body');
              }}
              invalid={Boolean(errors.body)}
            />
            {errors.body && (
              <p role="alert" className="mt-1.5 text-xs text-red-600">
                {errors.body}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
