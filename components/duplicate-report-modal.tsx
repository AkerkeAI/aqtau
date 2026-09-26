'use client';

import { useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { ReportCategory, CATEGORY_LABELS } from '@/lib/types';
import { getCategoryIcon } from '@/lib/categories';
import { Badge } from '@/components/ui/badge';
import { STATUS_LABELS } from '@/lib/types';
import { 
  MapPin, 
  Calendar, 
  AlertCircle, 
  CheckCircle2, 
  X,
  Users
} from 'lucide-react';

interface DuplicateReport {
  report_id: string;
  category: string;
  description: string;
  address: string;
  status: string;
  created_at: string;
  photo_url: string | null;
  distance_meters: number;
  support_count: number;
}

interface DuplicateReportModalProps {
  isOpen: boolean;
  duplicates: DuplicateReport[];
  onSupport: (reportId: string) => void;
  onCreateAnyway: () => void;
  onCancel: () => void;
  onViewDetails: (reportId: string) => void;
}

export function DuplicateReportModal({
  isOpen,
  duplicates,
  onSupport,
  onCreateAnyway,
  onCancel,
  onViewDetails,
}: DuplicateReportModalProps) {
  const returnFocus = useRef<HTMLElement | null>(null);
  const candidates = duplicates.slice(0, 3);

  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `примерно ${Math.round(meters)} м`;
    }
    return `примерно ${(meters / 1000).toFixed(1)} км`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
      <Dialog.Content onOpenAutoFocus={() => { returnFocus.current = document.activeElement as HTMLElement; }} onCloseAutoFocus={(event) => { event.preventDefault(); returnFocus.current?.focus(); }} aria-describedby="duplicate-description" className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-3 sm:p-5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50">
              <AlertCircle className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <Dialog.Title className="text-base sm:text-lg font-semibold text-navy">
                Такое обращение уже было отправлено
              </Dialog.Title>
              <p className="text-sm text-muted-foreground">
                {candidates.length} похож{candidates.length === 1 ? 'ее' : 'их'} проблем{candidates.length > 1 ? 'ы' : 'а'} найдено рядом
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            aria-label="Закрыть"
            className="rounded-lg p-2 text-muted-foreground hover:bg-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div tabIndex={0} role="region" aria-label="Похожие обращения" className="min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-5">
          <p id="duplicate-description" className="mb-4 text-sm text-muted-foreground">
            Похожая проблема уже отмечена в пределах 50 метров. Если это та же проблема, вы можете поддержать существующее обращение вместо создания нового.
          </p>

          {/* Duplicate reports list */}
          <div className="space-y-3">
            {candidates.map((duplicate) => {
              const Icon = getCategoryIcon(duplicate.category as ReportCategory);
              const affectedCount = 1 + duplicate.support_count;
              
              return (
                <div
                  key={duplicate.report_id}
                  className="rounded-lg border border-border bg-muted/30 p-4"
                >
                  <div className="flex flex-wrap items-start gap-4">
                    {/* Photo */}
                    {duplicate.photo_url ? (
                      <img
                        src={duplicate.photo_url}
                        alt={duplicate.report_id}
                        className="h-20 w-20 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="flex h-20 w-20 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-8 w-8 text-muted-foreground/40" />
                      </div>
                    )}

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge variant="outline">
                          {CATEGORY_LABELS[duplicate.category as ReportCategory]}
                        </Badge>
                        <Badge variant="secondary">
                          {STATUS_LABELS[duplicate.status as 'new' | 'in_progress' | 'resolved']}
                        </Badge>
                      </div>
                      
                      <p className="text-sm text-foreground line-clamp-2 mb-2">
                        {duplicate.description}
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {duplicate.address}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {formatDate(duplicate.created_at)}
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          Затронуло жителей: {affectedCount}
                        </div>
                      </div>
                      
                      <div className="mt-2 text-xs text-primary font-medium">
                        {formatDistance(duplicate.distance_meters)} от указанного места
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex w-full flex-col gap-2 sm:w-auto">
                      <button
                        onClick={() => onSupport(duplicate.report_id)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-light"
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        У меня та же проблема +1
                      </button>
                      <button
                        onClick={() => onViewDetails(duplicate.report_id)}
                        className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
                      >
                        Посмотреть подробнее
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3 sm:p-5 shrink-0">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted"
          >
            Отмена
          </button>
          <button
            onClick={onCreateAnyway}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-navy hover:bg-muted"
          >
            Всё равно создать новое обращение
          </button>
        </div>
      </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
