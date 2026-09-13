import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/Card';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: 'accent' | 'success' | 'warning' | 'danger';
}

const ACCENT_CLASSES = {
  accent: 'bg-accent/10 text-accent',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
};

export function StatCard({ icon: Icon, label, value, accent = 'accent' }: StatCardProps) {
  return (
    <Card className="flex items-center gap-4 p-5">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${ACCENT_CLASSES[accent]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-2xl font-semibold text-foreground">{value}</p>
        <p className="text-xs text-muted">{label}</p>
      </div>
    </Card>
  );
}
