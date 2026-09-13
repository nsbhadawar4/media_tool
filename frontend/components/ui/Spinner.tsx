import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-muted', className)} />;
}

export function FullPageSpinner() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center">
      <Spinner className="h-7 w-7" />
    </div>
  );
}
