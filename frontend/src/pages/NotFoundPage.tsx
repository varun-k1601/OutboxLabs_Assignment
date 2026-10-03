import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full items-center justify-center">
      <EmptyState
        icon={<Compass className="size-6" />}
        title="Page not found"
        description="The page you're looking for doesn't exist."
        action={<Button onClick={() => navigate('/dashboard')}>Go to dashboard</Button>}
      />
    </div>
  );
}
