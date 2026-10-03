import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { errorMessage } from '@/api/client';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Field';
import { Skeleton } from '@/components/ui/Feedback';
import { useCreateSender, useSenders } from '@/hooks/useSenders';

interface SenderSelectProps {
  id: string;
  value: string;
  onChange: (senderId: string) => void;
  invalid?: boolean;
}

// sender dropdown. "New sender" creates a new Ethereal account on the backend
export function SenderSelect({ id, value, onChange, invalid }: SenderSelectProps) {
  const senders = useSenders();
  const createSender = useCreateSender();

  const addSender = () =>
    createSender.mutate(undefined, {
      onSuccess: (sender) => {
        onChange(sender.id);
        toast.success('New Ethereal sender created', { description: sender.email });
      },
      onError: (err) => toast.error('Could not create a sender', { description: errorMessage(err) }),
    });

  if (senders.isPending) return <Skeleton className="h-10 flex-1" />;

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Select id={id} value={value} onChange={(event) => onChange(event.target.value)} invalid={invalid} className="min-w-0 flex-1">
        {(senders.data ?? []).length === 0 && <option value="">No sender yet — create one</option>}
        {senders.data?.map((sender) => (
          <option key={sender.id} value={sender.id}>
            {sender.name} &lt;{sender.email}&gt;
          </option>
        ))}
      </Select>
      <Button variant="ghost" size="md" onClick={addSender} loading={createSender.isPending} icon={<Plus className="size-4" />}>
        New sender
      </Button>
    </div>
  );
}
