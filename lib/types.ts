export type ReportStatus = 'new' | 'in_progress' | 'resolved';

export type ReportCategory =
  | 'roads'
  | 'lighting'
  | 'garbage'
  | 'water'
  | 'manholes'
  | 'sidewalks'
  | 'infrastructure'
  | 'other';

export interface ReportStats {
  total: number;
  new: number;
  inProgress: number;
  resolved: number;
}

export interface StatusHistoryEntry {
  status: ReportStatus;
  date: string;
  comment?: string;
  author: string;
}

export interface Report {
  id: string;
  category: ReportCategory;
  description: string;
  address: string;
  lat: number;
  lng: number;
  status: ReportStatus;
  createdAt: string;
  photoUrl: string | null;
  resolvedAt: string | null;
  updatedAt: string;
  aiCategory?: string | null;
  urgency?: string | null;
  organizationId?: string | null;
}

export const CATEGORY_LABELS: Record<ReportCategory, string> = {
  roads: 'Дороги',
  lighting: 'Освещение',
  garbage: 'Мусор',
  water: 'Водоснабжение',
  manholes: 'Люки',
  sidewalks: 'Тротуары',
  infrastructure: 'Инфраструктура',
  other: 'Другое',
};

export const STATUS_LABELS: Record<ReportStatus, string> = {
  new: 'Новое',
  in_progress: 'В работе',
  resolved: 'Решено',
};

export const AKTAU_CENTER: [number, number] = [43.6588, 51.1655];

// DB row shape (snake_case from Supabase)
export interface ReportRow {
  id: string;
  category: ReportCategory;
  description: string;
  address: string;
  latitude: number;
  longitude: number;
  photo_url: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  ai_category: string | null;
  urgency: string | null;
  organization_id: string | null;
}

export function rowToReport(row: ReportRow): Report {
  return {
    id: row.id,
    category: row.category,
    description: row.description,
    address: row.address,
    lat: row.latitude,
    lng: row.longitude,
    status: row.status,
    createdAt: row.created_at,
    photoUrl: row.photo_url,
    resolvedAt: row.resolved_at,
    updatedAt: row.updated_at,
    aiCategory: row.ai_category,
    urgency: row.urgency,
    organizationId: row.organization_id,
  };
}
