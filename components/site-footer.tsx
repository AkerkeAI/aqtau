'use client';

import Link from 'next/link';
import { Waves, Mail, Phone, MapPin } from 'lucide-react';
import { OperatorLoginModal } from '@/components/operator-login-modal';

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border/60 bg-navy text-white">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-8 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent">
                <Waves className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold">AqTau</span>
            </div>
            <p className="mt-4 max-w-sm text-sm text-white/70">
              Цифровая платформа для жителей Актау. Сообщайте о городских
              проблемах и отслеживайте их решение — вместе сделаем наш город
              лучше.
            </p>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              Навигация
            </h4>
            <ul className="mt-4 space-y-2 text-sm">
              <li>
                <Link href="/" className="text-white/70 hover:text-white">
                  Главная
                </Link>
              </li>
              <li>
                <Link href="/map" className="text-white/70 hover:text-white">
                  Карта проблем
                </Link>
              </li>
              <li>
                <Link
                  href="/my-reports"
                  className="text-white/70 hover:text-white"
                >
                  Мои обращения
                </Link>
              </li>
              <li>
                <Link
                  href="/report"
                  className="text-white/70 hover:text-white"
                >
                  Сообщить о проблеме
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-white/50">
              Контакты
            </h4>
            <ul className="mt-4 space-y-2 text-sm text-white/70">
              <li className="flex items-center gap-2">
                <MapPin className="h-4 w-4 shrink-0" />
                г. Актау, Мангистауская обл.
              </li>
              <li className="flex items-center gap-2">
                <Phone className="h-4 w-4 shrink-0" />
                8 (702) 329 30 97
              </li>
              <li className="flex items-center gap-2">
                <Mail className="h-4 w-4 shrink-0" />
                aqtau.info7292@gmail.com
              </li>
            </ul>
            <div className="mt-4">
              <OperatorLoginModal variant="footer" />
            </div>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          © 2026 AqTau. Цифровая платформа для жителей города Актау.
        </div>
      </div>
    </footer>
  );
}
