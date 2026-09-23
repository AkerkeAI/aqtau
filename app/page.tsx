'use client';

import Link from 'next/link';
import {
  ArrowRight,
  MapPin,
  FileText,
  CheckCircle2,
  Clock,
  ShieldCheck,
  Camera,
  Eye,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { ReportCard } from '@/components/report-card';
import { fetchReports, fetchReportStats } from '@/lib/reports';
import { Report, ReportStats } from '@/lib/types';
import { useEffect, useState } from 'react';

export default function HomePage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [stats, setStats] = useState<ReportStats>({ total: 0, new: 0, inProgress: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetchReports(), fetchReportStats()])
      .then(([r, s]) => {
        setReports(r);
        setStats(s);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const recentReports = reports.slice(0, 4);

  const statCards = [
    { label: 'Всего обращений', value: stats.total, icon: FileText, color: 'text-navy', bg: 'bg-navy/5' },
    { label: 'Новые', value: stats.new, icon: Eye, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'В работе', value: stats.inProgress, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Решено', value: stats.resolved, icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  ];

  const features = [
    { icon: Camera, title: 'Сообщите о проблеме', desc: 'Сфотографируйте проблему, опишите её и укажите на карте — это займёт меньше минуты.' },
    { icon: MapPin, title: 'Видите на карте', desc: 'Все обращения отображаются на интерактивной карте города в режиме реального времени.' },
    { icon: ShieldCheck, title: 'Город решает', desc: 'Муниципальные службы получают обращение и берут его в работу. Статус обновляется.' },
    { icon: CheckCircle2, title: 'Результат на виду', desc: 'Вы видите, когда проблема решена. Прозрачность на каждом этапе.' },
  ];

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-b from-navy to-navy-light">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-accent blur-3xl" />
          <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-primary blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-sm text-white/90 backdrop-blur">
              <Sparkles className="h-4 w-4 text-accent" />
              Smart City · Актау
            </div>
            <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Сделаем Актау
              <br />
              <span className="bg-gradient-to-r from-accent to-primary bg-clip-text text-transparent">
                лучше вместе
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-lg text-white/70">
              Цифровая платформа для жителей города. Сообщайте о городских
              проблемах — ямы, освещение, мусор, вода — и отслеживайте их
              решение в реальном времени.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                href="/report"
                className="inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/30 transition-all hover:scale-105 hover:shadow-xl"
              >
                <Camera className="h-5 w-5" />
                Сообщить о проблеме
              </Link>
              <Link
                href="/map"
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-6 py-3.5 text-base font-semibold text-white backdrop-blur transition-all hover:bg-white/20"
              >
                <MapPin className="h-5 w-5" />
                Открыть карту
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 -mt-12 relative z-10">
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {statCards.map((s) => (
              <div key={s.label} className="rounded-xl border border-border bg-white p-4 shadow-sm sm:p-6">
                <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg ${s.bg}`}>
                  <s.icon className={`h-5 w-5 ${s.color}`} />
                </div>
                <div className="text-2xl font-bold text-navy sm:text-3xl">{s.value}</div>
                <div className="mt-0.5 text-sm text-muted-foreground">{s.label}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-navy sm:text-3xl">Как это работает</h2>
          <p className="mt-2 text-muted-foreground">Простой и прозрачный процесс от обращения до результата</p>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <div key={f.title} className="relative rounded-xl border border-border bg-white p-6 shadow-sm">
              <div className="absolute -top-3 -right-3 flex h-8 w-8 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">
                {i + 1}
              </div>
              <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <f.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-semibold text-navy">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent reports */}
      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-navy">Последние обращения</h2>
            <p className="mt-1 text-muted-foreground">Свежие проблемы, о которых сообщили жители</p>
          </div>
          <Link href="/map" className="hidden items-center gap-1 text-sm font-medium text-primary hover:underline sm:inline-flex">
            Все на карте <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recentReports.map((r) => (
              <ReportCard key={r.id} report={r} />
            ))}
          </div>
        )}
        <div className="mt-6 text-center sm:hidden">
          <Link href="/map" className="inline-flex items-center gap-1 text-sm font-medium text-primary">
            Все на карте <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy to-navy-light p-8 sm:p-12">
          <div className="absolute -right-10 -top-10 h-48 w-48 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white sm:text-3xl">Заметили проблему в городе?</h2>
              <p className="mt-2 max-w-xl text-white/70">
                Не ждите, пока кто-то другой сообщит о ней. Потратьте минуту — и город станет немного лучше.
              </p>
            </div>
            <Link
              href="/report"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-accent px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-accent/30 transition-all hover:scale-105"
            >
              <Camera className="h-5 w-5" />
              Сообщить о проблеме
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
