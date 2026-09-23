import Link from 'next/link';
import { Report } from '@/lib/types';
import { getCategoryIcon, getCategoryLabel } from '@/lib/categories';
import { StatusBadge } from './status-badge';
import { MapPin, Calendar } from 'lucide-react';

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function ReportCard({ report }: { report: Report }) {
  const Icon = getCategoryIcon(report.category);

  return (
    <Link
      href={`/dashboard/reports/${report.id}`}
      className="group block overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-all hover:shadow-md hover:border-primary/30"
    >
      <div className="relative h-40 overflow-hidden">
        {report.photoUrl ? (
          <img
            src={report.photoUrl}
            alt={report.id}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <Icon className="h-10 w-10 text-muted-foreground/40" />
          </div>
        )}
        <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1 shadow-sm backdrop-blur">
          <Icon className="h-3.5 w-3.5 text-navy" />
          <span className="text-xs font-semibold text-navy">
            {getCategoryLabel(report.category)}
          </span>
        </div>
        <div className="absolute right-3 top-3">
          <StatusBadge status={report.status} className="shadow-sm" />
        </div>
      </div>
      <div className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono font-semibold text-navy truncate">
            {report.id.slice(0, 8)}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {formatDate(report.createdAt)}
          </span>
        </div>
        <p className="mt-2 text-sm text-foreground line-clamp-2">
          {report.description}
        </p>
        <div className="mt-3 flex items-start gap-1 text-xs text-muted-foreground">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="line-clamp-1">{report.address}</span>
        </div>
      </div>
    </Link>
  );
}
