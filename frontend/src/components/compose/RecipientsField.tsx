import { FileUp, Upload, X } from 'lucide-react';
import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/cn';
import { pluralize } from '@/lib/format';
import { extractEmails, isValidEmail, mergeEmails } from '@/lib/recipients';

const COLLAPSED_CHIPS = 6;
const EXPANDED_CHIPS = 300;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface RecipientsFieldProps {
  id: string;
  value: string[];
  onChange: (recipients: string[]) => void;
  max: number;
  invalid?: boolean;
}

interface UploadSummary {
  fileName: string;
  detected: number;
  added: number;
  duplicates: number;
}

export function RecipientsField({ id, value, onChange, max, invalid }: RecipientsFieldProps) {
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [upload, setUpload] = useState<UploadSummary | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const add = (emails: string[]) => {
    const { merged, added } = mergeEmails(value, emails);
    if (merged.length > max) {
      toast.error(`A campaign can have at most ${max.toLocaleString()} recipients`);
      return 0;
    }
    onChange(merged);
    return added;
  };

  const commitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    const { emails } = extractEmails(text);
    if (emails.length === 0 || (emails.length === 1 && !isValidEmail(text))) {
      setDraftError(`"${text}" is not a valid email address`);
      return;
    }
    add(emails);
    setDraft('');
    setDraftError(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (['Enter', ',', ';'].includes(event.key) && draft.trim()) {
      event.preventDefault();
      commitDraft();
    } else if (event.key === 'Backspace' && !draft && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const { emails } = extractEmails(event.clipboardData.getData('text'));
    if (emails.length > 1) {
      event.preventDefault();
      const added = add(emails);
      toast.success(`Added ${pluralize(added, 'recipient')} from the clipboard`);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error('That file is too large (max 5 MB)');
      return;
    }
    const { emails, duplicates } = extractEmails(await file.text());
    if (emails.length === 0) {
      toast.error(`No email addresses found in ${file.name}`);
      return;
    }
    const added = add(emails);
    setUpload({ fileName: file.name, detected: emails.length, added, duplicates });
    toast.success(`${pluralize(emails.length, 'email address', 'email addresses')} detected in ${file.name}`);
  };

  const visible = value.slice(0, expanded ? EXPANDED_CHIPS : COLLAPSED_CHIPS);
  const hidden = value.length - visible.length;

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex min-h-10 min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 transition focus-within:border-brand-500 focus-within:ring-3 focus-within:ring-brand-100',
            invalid || draftError ? 'border-red-400' : 'border-gray-300',
          )}
        >
          {visible.map((email) => (
            <span key={email} className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-0.5 pr-1 pl-2.5 text-xs font-medium text-brand-800">
              <span className="truncate">{email}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((item) => item !== email))}
                aria-label={`Remove ${email}`}
                className="rounded-full p-0.5 text-brand-600 hover:bg-brand-100"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
            >
              +{hidden.toLocaleString()} more
            </button>
          )}
          {expanded && value.length > COLLAPSED_CHIPS && (
            <button type="button" onClick={() => setExpanded(false)} className="px-1 text-xs text-gray-500 hover:text-gray-800">
              Show less
            </button>
          )}
          <input
            id={id}
            value={draft}
            onChange={(event) => {
              setDraft(event.target.value);
              setDraftError(null);
            }}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={commitDraft}
            placeholder={value.length === 0 ? 'recipient@example.com' : ''}
            aria-invalid={invalid || Boolean(draftError) || undefined}
            className="h-7 min-w-40 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-gray-400"
          />
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(event) => {
            void onFile(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          <Upload className="size-4" /> Upload List
        </button>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {draftError ? (
          <span className="text-red-600" role="alert">
            {draftError}
          </span>
        ) : (
          <span className={cn('font-medium', value.length ? 'text-gray-700' : 'text-gray-400')}>
            {value.length ? `${pluralize(value.length, 'recipient')} selected` : 'Type addresses, paste a list, or upload a CSV/TXT file'}
          </span>
        )}
        {upload && (
          <span className="inline-flex items-center gap-1 text-gray-500">
            <FileUp className="size-3.5" /> {upload.fileName}: {pluralize(upload.detected, 'email')} detected
            {upload.duplicates > 0 && `, ${upload.duplicates} duplicate${upload.duplicates === 1 ? '' : 's'} removed`}
            {upload.added < upload.detected && `, ${upload.detected - upload.added} already added`}
          </span>
        )}
        {value.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onChange([]);
              setUpload(null);
              setExpanded(false);
            }}
            className="text-gray-500 underline-offset-2 hover:text-gray-800 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
