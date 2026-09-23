'use client';

import { DashboardLayout } from '@/components/dashboard-layout';
import { StatusBadge } from '@/components/status-badge';
import CityMap from '@/components/city-map-client';
import { fetchReportById, updateReportStatus, buildStatusHistory } from '@/lib/reports';
import { ReportStatus, STATUS_LABELS, Report } from '@/lib/types';
import { formatDate } from '@/components/report-card';
import { getCategoryIcon, getCategoryLabel } from '@/lib/categories';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { use } from 'react';
import {
  ArrowLeft,
  MapPin,
  Calendar,
  User,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

const STATUS_ORDER: ReportStatus[] = ['new', 'in_progress', 'resolved'];

const STATUS_TIMELINE_ICONS: Record<ReportStatus, typeof Clock> = {
  new: AlertCircle,
  in_progress: Clock,
  resolved: CheckCircle2,
};

const STATUS_TIMELINE_COLORS: Record<ReportStatus, string> = {
  new: 'bg-blue-500',
  in_progress: 'bg-amber-500',
  resolved: 'bg-emerald-500',
};

export default function ReportDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    fetchReportById(id)
      .then((data) => {
        if (!data) {
          setError('Обращение не найдено');
        } else {
          setReport(data);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [id]);

  async function changeStatus(newStatus: ReportStatus) {
    if (!report || newStatus === report.status) return;
    setUpdating(true);
    try {
      const updated = await updateReportStatus(report.id, newStatus);
      setReport(updated);
      toast.success(`Статус изменён на «${STATUS_LABELS[newStatus]}»`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Ошибка обновления';
      toast.error(msg);
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex h-96 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (error || !report) {
    return (
      <DashboardLayout>
        <div className="py-20 text-center">
          <AlertCircle className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-3 text-lg font-semibold text-navy">
            {error || 'Обращение не найдено'}
          </p>
          <Link
            href="/dashboard/reports"
            className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад к списку
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  const Icon = getCategoryIcon(report.category);
  const history = buildStatusHistory(
    report.createdAt,
    report.updatedAt,
    report.resolvedAt,
    report.status,
  );

  return (
    <DashboardLayout>
      <Link
        href="/dashboard/reports"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-navy"
      >
        <ArrowLeft className="h-4 w-4" />
        К списку обращений
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: main info */}
        <div className="lg:col-span-2 space-y-4">
          {/* Header card */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-bold text-navy">{report.id.slice(0, 8)}</span>
                <StatusBadge status={report.status} />
              </div>
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(report.createdAt)}
              </span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <div className="font-semibold text-navy">{getCategoryLabel(report.category)}</div>
                <div className="text-xs text-muted-foreground">Категория обращения</div>
              </div>
            </div>
          </div>

          {/* Photo */}
          {report.photoUrl && (
            <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
              <img
                src={report.photoUrl}
                alt={report.id}
                className="h-72 w-full object-cover sm:h-96"
              />
            </div>
          )}

          {/* Description */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="mb-2 font-semibold text-navy">Описание</h3>
            <p className="text-sm leading-relaxed text-foreground">{report.description}</p>
          </div>

          {/* Location */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-semibold text-navy">Местоположение</h3>
            <div className="mb-3 flex items-start gap-2 text-sm text-muted-foreground">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="text-foreground">{report.address}</div>
                <div className="mt-0.5 text-xs">
                  Координаты: {report.lat.toFixed(5)}, {report.lng.toFixed(5)}
                </div>
              </div>
            </div>
            <div className="h-64 overflow-hidden rounded-lg">
              <CityMap
                reports={[report]}
                height="100%"
                center={[report.lat, report.lng]}
                zoom={16}
                interactive={false}
              />
            </div>
          </div>

          {/* Timeline */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="mb-4 font-semibold text-navy">История статусов</h3>
            <div className="relative">
              {history.map((entry, i) => {
                const SIcon = STATUS_TIMELINE_ICONS[entry.status];
                const isLast = i === history.length - 1;
                return (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${STATUS_TIMELINE_COLORS[entry.status]} text-white`}>
                        <SIcon className="h-4 w-4" />
                      </div>
                      {!isLast && <div className="mt-1 h-full w-0.5 flex-1 bg-border" />}
                    </div>
                    <div className="pb-6">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-navy">
                          {STATUS_LABELS[entry.status]}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{entry.comment}</p>
                      <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground/70">
                        <span>{formatDate(entry.date)}</span>
                        <span>·</span>
                        <span>{entry.author}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: sidebar */}
        <div className="space-y-4">
          {/* Status control */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-semibold text-navy">Управление статусом</h3>
            <div className="space-y-2">
              {STATUS_ORDER.map((s) => {
                const active = report.status === s;
                return (
                  <button
                    key={s}
                    onClick={() => changeStatus(s)}
                    disabled={updating}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm font-medium transition-all disabled:opacity-50 ${
                      active
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {STATUS_LABELS[s]}
                    {active && <CheckCircle2 className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
            {updating && (
              <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                Обновление...
              </div>
            )}
          </div>

          {/* Info */}
          <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
            <h3 className="mb-3 font-semibold text-navy">Информация</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">ID обращения</dt>
                <dd className="font-mono font-semibold text-navy">{report.id.slice(0, 8)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Категория</dt>
                <dd className="font-medium text-foreground">{getCategoryLabel(report.category)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Дата создания</dt>
                <dd className="font-medium text-foreground">{formatDate(report.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Адрес</dt>
                <dd className="font-medium text-foreground">{report.address}</dd>
              </div>
              {report.resolvedAt && (
                <div>
                  <dt className="text-xs text-muted-foreground">Дата решения</dt>
                  <dd className="font-medium text-foreground">{formatDate(report.resolvedAt)}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
