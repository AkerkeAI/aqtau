/*
# Create reports table + report-images storage bucket

## Summary
Creates the core `reports` table for the AqTau civic platform, plus a Supabase
Storage bucket for report photos. Seeds the table with realistic demo data so
the app is immediately demonstrable. This is a single-tenant (no-auth) app —
residents submit reports anonymously, and municipal operators manage them.

## New Tables
- `reports`
  - `id` (uuid, primary key, auto-generated)
  - `category` (text, not null) — one of: roads, lighting, garbage, water, manholes, sidewalks, infrastructure, other
  - `description` (text, not null) — problem description in Russian
  - `address` (text, not null) — human-readable address
  - `latitude` (double precision, not null) — map latitude
  - `longitude` (double precision, not null) — map longitude
  - `photo_url` (text) — path or URL to the uploaded photo in Storage
  - `status` (text, not null, default 'new') — one of: new, in_progress, resolved
  - `created_at` (timestamptz, default now())
  - `updated_at` (timestamptz, default now())
  - `resolved_at` (timestamptz, nullable) — set when status becomes 'resolved'
  - `ai_category` (text, nullable) — reserved for future AI image classification
  - `urgency` (text, nullable) — reserved for future urgency/risk level
  - `organization_id` (text, nullable) — reserved for future auto-routing

## Storage
- Creates a public bucket `report-images` for uploading report photos.
- Adds storage policies allowing anon + authenticated to upload, read, and list objects.

## Security (RLS)
- RLS enabled on `reports`.
- Policies allow anon + authenticated full CRUD (single-tenant public civic platform).

## Seed Data
- Inserts 12 realistic demo reports around Aktau with varied categories and statuses.

## Important Notes
1. This migration is idempotent — safe to re-run.
2. The app uses the anon key, so all policies must include the `anon` role.
3. No auth/users table is needed — reports are submitted anonymously.
*/

-- =========================================================
-- 1. REPORTS TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category IN ('roads','lighting','garbage','water','manholes','sidewalks','infrastructure','other')),
  description text NOT NULL,
  address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  photo_url text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','in_progress','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  ai_category text,
  urgency text,
  organization_id text
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);

-- =========================================================
-- 2. ROW LEVEL SECURITY
-- =========================================================

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_reports" ON reports;
CREATE POLICY "anon_select_reports" ON reports FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_reports" ON reports;
CREATE POLICY "anon_insert_reports" ON reports FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_reports" ON reports;
CREATE POLICY "anon_update_reports" ON reports FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_reports" ON reports;
CREATE POLICY "anon_delete_reports" ON reports FOR DELETE
  TO anon, authenticated USING (true);

-- =========================================================
-- 3. UPDATED_AT TRIGGER
-- =========================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reports_updated_at ON reports;
CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- =========================================================
-- 4. STORAGE BUCKET
-- =========================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('report-images', 'report-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for report-images bucket
DROP POLICY IF EXISTS "anon_upload_report_images" ON storage.objects;
CREATE POLICY "anon_upload_report_images" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'report-images');

DROP POLICY IF EXISTS "anon_read_report_images" ON storage.objects;
CREATE POLICY "anon_read_report_images" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'report-images');

DROP POLICY IF EXISTS "anon_delete_report_images" ON storage.objects;
CREATE POLICY "anon_delete_report_images" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'report-images');

-- =========================================================
-- 5. SEED DATA (12 realistic demo reports)
-- =========================================================

INSERT INTO reports (id, category, description, address, latitude, longitude, photo_url, status, created_at, resolved_at)
VALUES
  ('a0000001-0000-0000-0000-000000000001', 'roads', 'Глубокая яма на проезжей части около остановки. Опасно для автомобилей, особенно в тёмное время суток. Требуется срочный ремонт дорожного покрытия.', 'мкр. 1, пр. Сатпаева, у остановки «21-я школа»', 43.6556, 51.1623, 'https://images.unsplash.com/photo-1597007030739-6d2e7172ee3b?w=800&q=80', 'new', now() - interval '1 day', NULL),
  ('a0000002-0000-0000-0000-000000000002', 'lighting', 'Не работают 3 фонаря подряд на набережной. Участок тёмный, небезопасно гулять вечером с детьми.', 'мкр. 9, набережная Каспийского моря, секция 12', 43.6421, 51.1589, 'https://images.unsplash.com/photo-1517292987719-0369a794ec24?w=800&q=80', 'in_progress', now() - interval '5 days', NULL),
  ('a0000003-0000-0000-0000-000000000003', 'garbage', 'Контейнерная площадка переполнена, мусор не вывозится уже неделю. Образовалась несанкционированная свалка вокруг контейнеров.', 'мкр. 5, ул. Абая, у дома 14', 43.6612, 51.1712, 'https://images.unsplash.com/photo-1604937453157-4e2c8c2e3f1c?w=800&q=80', 'new', now() - interval '2 days', NULL),
  ('a0000004-0000-0000-0000-000000000004', 'manholes', 'Открытый канализационный люк без крышки на пешеходной дорожке. Серьёзная опасность для детей и животных.', 'мкр. 3, ул. Астана, у дома 8', 43.6590, 51.1680, 'https://images.unsplash.com/photo-1597844808179-1f25b8b0d6c9?w=800&q=80', 'resolved', now() - interval '12 days', now() - interval '9 days'),
  ('a0000005-0000-0000-0000-000000000005', 'water', 'Утечка воды из-под земли, на проезжей части образовалось озеро. Возможно повреждение трубы водоснабжения.', 'мкр. 7, пр. Республики, у ТД «Актау»', 43.6505, 51.1650, 'https://images.unsplash.com/photo-1541252260730-0412e8e7256c?w=800&q=80', 'in_progress', now() - interval '4 days', NULL),
  ('a0000006-0000-0000-0000-000000000006', 'sidewalks', 'Разрушенный участок тротуара, плитка отсутствует, есть ямы. Невозможно пройти с коляской.', 'мкр. 2, ул. Ломоносова, у дома 22', 43.6635, 51.1605, 'https://images.unsplash.com/photo-1610465299996-30f9a4f0a7b3?w=800&q=80', 'new', now() - interval '3 days', NULL),
  ('a0000007-0000-0000-0000-000000000007', 'infrastructure', 'Ограждение детской площадки повреждено, торчат острые металлические прутья. Опасно для играющих детей.', 'мкр. 8, ул. Молдагалиева, у дома 5', 43.6470, 51.1700, 'https://images.unsplash.com/photo-1574263867128-a3d5c5b3d5e1?w=800&q=80', 'resolved', now() - interval '15 days', now() - interval '11 days'),
  ('a0000008-0000-0000-0000-000000000008', 'roads', 'Просадка дорожного полотна на перекрёстке, при дожде собирается вода. Образуется глубокая лужа на всю ширину дороги.', 'мкр. 6, пересечение ул. Абылай хана и ул. Сатпаева', 43.6520, 51.1750, 'https://images.unsplash.com/photo-1597007030739-6d2e7172ee3b?w=800&q=80', 'in_progress', now() - interval '6 days', NULL),
  ('a0000009-0000-0000-0000-000000000009', 'lighting', 'Фонарный столб накренился после сильного ветра, есть риск падения на проезжую часть.', 'мкр. 4, ул. Бокен батыра, у дома 11', 43.6570, 51.1630, 'https://images.unsplash.com/photo-1517292987719-0369a794ec24?w=800&q=80', 'new', now() - interval '1 day', NULL),
  ('a000000a-0000-0000-0000-00000000000a', 'garbage', 'Несанкционированная свалка строительного мусора в пустыре между домами. Объём растёт каждый день.', 'мкр. 10, между домами 18 и 20', 43.6450, 51.1550, 'https://images.unsplash.com/photo-1604937453157-4e2c8c2e3f1c?w=800&q=80', 'resolved', now() - interval '20 days', now() - interval '15 days'),
  ('a000000b-0000-0000-0000-00000000000b', 'infrastructure', 'Обрушена часть забора строительной площадки, мусор разлетается по улице. Ограда не соответствует нормам.', 'мкр. 1, ул. Хиуа, у строящегося объекта', 43.6600, 51.1600, 'https://images.unsplash.com/photo-1503387762-592deb58efde?w=800&q=80', 'in_progress', now() - interval '7 days', NULL),
  ('a000000c-0000-0000-0000-00000000000c', 'water', 'Слабый напор воды в нескольких домах по улице. Возможна авария на магистральной линии водоснабжения.', 'мкр. 5, ул. Абилхайыр, дома 3-7', 43.6620, 51.1660, 'https://images.unsplash.com/photo-1541252260730-0412e8e7256c?w=800&q=80', 'new', now() - interval '2 days', NULL)
ON CONFLICT (id) DO NOTHING;
