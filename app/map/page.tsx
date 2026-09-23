'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import CityMap from '@/components/city-map-client';
import { StatusBadge } from '@/components/status-badge';
import { getCategoryIcon, getCategoryLabel } from '@/lib/categories';
import { fetchReports } from '@/lib/reports';
import { ReportStatus, CATEGORY_LABELS, ReportCategory, Report } from '@/lib/types';
import { formatDate } from '@/components/report-card';
import { MapPin, Calendar, ArrowLeft, X, Filter, Loader2 } from 'lucide-react';
import { useEffect } from 'react';

const STATUS_FILTERS: { value: 'all' | ReportStatus; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'new', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'resolved', label: 'Решено' },
];

export default function MapPage() {
  const [statusFilter, setStatusFilter] = useState<'all' | ReportStatus>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ReportCategory>('all');
  const [selected, setSelected] = useState<Report | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchReports()
      .then((data) => {
        setReports(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    return reports.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
      return true;
    });
  }, [reports, statusFilter, categoryFilter]);

  const categories = Object.keys(CATEGORY_LABELS) as ReportCategory[];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-navy"
        >
          <ArrowLeft className="h-4 w-4" />
          На главную
        </Link>
        <h1 className="text-2xl font-bold text-navy sm:text-3xl">
          Карта проблем Актау
        </h1>
        <p className="mt-1 text-muted-foreground">
          Все обращения жителей на интерактивной карте города
        </p>

        {/* Filters */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  statusFilter === f.value
                    ? 'bg-navy text-white'
                    : 'bg-white text-muted-foreground border border-border hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as 'all' | ReportCategory)}
            className="rounded-lg border border-border bg-white px-3 py-1.5 text-sm font-medium text-navy focus:border-primary focus:outline-none"
          >
            <option value="all">Все категории</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-4 text-sm text-muted-foreground">
          Показано обращений:{' '}
          <span className="font-semibold text-navy">{filtered.length}</span>
        </div>

        {loading && (
          <div className="flex h-96 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
            Не удалось загрузить данные: {error}
          </div>
        )}

        {!loading && !error && (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <div className="overflow-hidden rounded-xl border border-border shadow-sm" style={{ height: '600px' }}>
                <CityMap
                  reports={filtered}
                  height="100%"
                  onMarkerClick={(id) => {
                    const r = reports.find((r) => r.id === id);
                    if (r) setSelected(r);
                  }}
                  showPopups={true}
                />
              </div>
            </div>

            <div className="lg:col-span-1">
              {selected ? (
                <div className="rounded-xl border border-border bg-white shadow-sm overflow-hidden">
                  <div className="relative h-40">
                    {selected.photoUrl ? (
                      <img src={selected.photoUrl} alt={selected.id} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-muted">
                        {(() => {
                          const Icon = getCategoryIcon(selected.category);
                          return <Icon className="h-10 w-10 text-muted-foreground/40" />;
                        })()}
                      </div>
                    )}
                    <button
                      onClick={() => setSelected(null)}
                      className="absolute right-2 top-2 rounded-lg bg-black/60 p-1.5 text-white backdrop-blur hover:bg-black/80"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-navy">{selected.id.slice(0, 8)}</span>
                      <StatusBadge status={selected.status} />
                    </div>
                    <h3 className="mt-2 flex items-center gap-1.5 font-bold text-navy">
                      {(() => {
                        const Icon = getCategoryIcon(selected.category);
                        return <Icon className="h-4 w-4" />;
                      })()}
                      {getCategoryLabel(selected.category)}
                    </h3>
                    <p className="mt-2 text-sm text-foreground">{selected.description}</p>
                    <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                      <div className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {selected.address}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(selected.createdAt)}
                      </div>
                    </div>
                    <Link
                      href={`/dashboard/reports/${selected.id}`}
                      className="mt-4 block rounded-lg bg-navy py-2.5 text-center text-sm font-semibold text-white hover:bg-navy-light"
                    >
                      Подробнее
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl border border-border bg-white p-4 shadow-sm">
                    <h3 className="text-sm font-semibold text-navy">
                      Нажмите на маркер
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Выберите любой маркер на карте, чтобы увидеть подробную
                      информацию об обращении.
                    </p>
                  </div>
                  <div className="max-h-[500px] space-y-2 overflow-y-auto">
                    {filtered.map((r) => {
                      const Icon = getCategoryIcon(r.category);
                      return (
                        <button
                          key={r.id}
                          onClick={() => setSelected(r)}
                          className="flex w-full items-start gap-3 rounded-lg border border-border bg-white p-3 text-left shadow-sm transition-all hover:border-primary/30 hover:shadow-md"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                            <Icon className="h-5 w-5 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-semibold text-navy">{r.id.slice(0, 8)}</span>
                              <StatusBadge status={r.status} />
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.description}</p>
                            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground/70">
                              <MapPin className="h-3 w-3" />
                              {r.address}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
