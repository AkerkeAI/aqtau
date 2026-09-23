import { supabase } from './supabase-client';
import {
  Report,
  ReportStatus,
  ReportRow,
  ReportStats,
  rowToReport,
} from './types';

export async function fetchReports(): Promise<Report[]> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data as ReportRow[]).map(rowToReport);
}

export async function fetchReportById(id: string): Promise<Report | null> {
  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return rowToReport(data as ReportRow);
}

export async function fetchReportStats(): Promise<ReportStats> {
  const { data, error } = await supabase
    .from('reports')
    .select('status');

  if (error) throw error;

  const rows = data as { status: ReportStatus }[];
  return {
    total: rows.length,
    new: rows.filter((r) => r.status === 'new').length,
    inProgress: rows.filter((r) => r.status === 'in_progress').length,
    resolved: rows.filter((r) => r.status === 'resolved').length,
  };
}

export async function fetchCategoryStats(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('reports')
    .select('category');

  if (error) throw error;

  const map: Record<string, number> = {};
  for (const row of data as { category: string }[]) {
    map[row.category] = (map[row.category] || 0) + 1;
  }
  return map;
}

export interface NewReportInput {
  category: Report['category'];
  description: string;
  address: string;
  lat: number;
  lng: number;
  photoUrl: string | null;
}

export async function uploadPhoto(
  file: File,
  reportId: string,
): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${reportId}.${ext}`;

  const { error } = await supabase.storage
    .from('report-images')
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
    });

  if (error) throw error;

  const { data: urlData } = supabase.storage
    .from('report-images')
    .getPublicUrl(path);

  return urlData.publicUrl;
}

export async function createReport(input: NewReportInput): Promise<Report> {
  const row = {
    category: input.category,
    description: input.description,
    address: input.address,
    latitude: input.lat,
    longitude: input.lng,
    photo_url: input.photoUrl,
    status: 'new' as ReportStatus,
  };

  const { data, error } = await supabase
    .from('reports')
    .insert(row)
    .select('*')
    .single();

  if (error) throw error;
  return rowToReport(data as ReportRow);
}

export async function createReportWithPhoto(
  input: NewReportInput,
  file: File,
): Promise<Report> {
  // First create the report to get an ID
  const report = await createReport({
    ...input,
    photoUrl: null,
  });

  // Upload photo using the report ID
  const photoUrl = await uploadPhoto(file, report.id);

  // Update the report with the photo URL
  const { data, error } = await supabase
    .from('reports')
    .update({ photo_url: photoUrl })
    .eq('id', report.id)
    .select('*')
    .single();

  if (error) throw error;
  return rowToReport(data as ReportRow);
}

export async function updateReportStatus(
  id: string,
  status: ReportStatus,
): Promise<Report> {
  const update: Partial<ReportRow> = {
    status,
    resolved_at: status === 'resolved' ? new Date().toISOString() : null,
  };

  const { data, error } = await supabase
    .from('reports')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) throw error;
  return rowToReport(data as ReportRow);
}

export function buildStatusHistory(
  createdAt: string,
  updatedAt: string,
  resolvedAt: string | null,
  currentStatus: ReportStatus,
): StatusHistoryEntryLike[] {
  const history: StatusHistoryEntryLike[] = [
    {
      status: 'new',
      date: createdAt,
      comment: 'Обращение зарегистрировано в системе',
      author: 'Система',
    },
  ];

  if (currentStatus === 'in_progress' || currentStatus === 'resolved') {
    history.push({
      status: 'in_progress',
      date: updatedAt,
      comment: 'Заявка передана в профильную службу',
      author: 'Оператор',
    });
  }

  if (currentStatus === 'resolved' && resolvedAt) {
    history.push({
      status: 'resolved',
      date: resolvedAt,
      comment: 'Проблема устранена. Работы завершены.',
      author: 'Оператор',
    });
  }

  return history;
}

interface StatusHistoryEntryLike {
  status: ReportStatus;
  date: string;
  comment?: string;
  author: string;
}
