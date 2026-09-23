import {
  Construction,
  Lightbulb,
  Trash2,
  Droplets,
  CircleDot,
  Footprints,
  Building2,
  HelpCircle,
  type LucideIcon,
} from 'lucide-react';
import { ReportCategory, CATEGORY_LABELS } from './types';

export const CATEGORY_ICONS: Record<ReportCategory, LucideIcon> = {
  roads: Construction,
  lighting: Lightbulb,
  garbage: Trash2,
  water: Droplets,
  manholes: CircleDot,
  sidewalks: Footprints,
  infrastructure: Building2,
  other: HelpCircle,
};

export const CATEGORY_COLORS: Record<ReportCategory, string> = {
  roads: 'text-amber-600 bg-amber-50',
  lighting: 'text-yellow-600 bg-yellow-50',
  garbage: 'text-emerald-600 bg-emerald-50',
  water: 'text-blue-600 bg-blue-50',
  manholes: 'text-orange-600 bg-orange-50',
  sidewalks: 'text-stone-600 bg-stone-50',
  infrastructure: 'text-violet-600 bg-violet-50',
  other: 'text-gray-600 bg-gray-50',
};

export const CATEGORY_HEX: Record<ReportCategory, string> = {
  roads: '#d97706',
  lighting: '#ca8a04',
  garbage: '#059669',
  water: '#2563eb',
  manholes: '#ea580c',
  sidewalks: '#78716c',
  infrastructure: '#7c3aed',
  other: '#6b7280',
};

export function getCategoryIcon(cat: ReportCategory): LucideIcon {
  return CATEGORY_ICONS[cat] ?? HelpCircle;
}

export function getCategoryLabel(cat: ReportCategory): string {
  return CATEGORY_LABELS[cat] ?? 'Другое';
}
