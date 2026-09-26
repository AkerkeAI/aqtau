-- ============================================================
-- AqTau — Organizations, Routing, Events & Messages
-- Safe migration for the CURRENT database
-- ============================================================

BEGIN;

-- ============================================================
-- 1. ORGANIZATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL CHECK (
    category IN (
      'roads',
      'lighting',
      'garbage',
      'water',
      'manholes',
      'sidewalks',
      'infrastructure',
      'other'
    )
  ),
  channel text NOT NULL CHECK (
    channel IN ('whatsapp', 'telegram', 'email', 'api', 'web')
  ),
  destination text NOT NULL,
  website_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_category
  ON public.organizations(category);

CREATE INDEX IF NOT EXISTS idx_organizations_active
  ON public.organizations(active);

CREATE INDEX IF NOT EXISTS idx_organizations_category_active
  ON public.organizations(category, active)
  WHERE active = true;


-- ============================================================
-- 2. FIX reports.organization_id
-- Existing column is TEXT and currently contains no values.
-- Convert it safely to UUID.
-- ============================================================

ALTER TABLE public.reports
  ALTER COLUMN organization_id TYPE uuid
  USING NULLIF(organization_id, '')::uuid;

-- Remove an old FK with this name if migration is re-run.
ALTER TABLE public.reports
  DROP CONSTRAINT IF EXISTS reports_organization_id_fkey;

ALTER TABLE public.reports
  ADD CONSTRAINT reports_organization_id_fkey
  FOREIGN KEY (organization_id)
  REFERENCES public.organizations(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reports_organization_id
  ON public.reports(organization_id);


-- ============================================================
-- 3. REPORT EVENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  report_id uuid NOT NULL
    REFERENCES public.reports(id)
    ON DELETE CASCADE,

  event_type text NOT NULL CHECK (
    event_type IN (
      'report_created',
      'routed',
      'message_prepared',
      'message_sent',
      'organization_replied',
      'status_changed'
    )
  ),

  title text NOT NULL,
  description text,

  actor_type text NOT NULL DEFAULT 'system' CHECK (
    actor_type IN ('system', 'operator', 'organization', 'ai')
  ),

  actor_user_id uuid
    REFERENCES auth.users(id)
    ON DELETE SET NULL,

  organization_id uuid
    REFERENCES public.organizations(id)
    ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_report_events_report_id
  ON public.report_events(report_id);

CREATE INDEX IF NOT EXISTS idx_report_events_event_type
  ON public.report_events(event_type);

CREATE INDEX IF NOT EXISTS idx_report_events_created_at
  ON public.report_events(created_at DESC);


-- ============================================================
-- 4. ORGANIZATION MESSAGES
-- Operational communication — NOT public.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.organization_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  report_id uuid NOT NULL
    REFERENCES public.reports(id)
    ON DELETE CASCADE,

  organization_id uuid NOT NULL
    REFERENCES public.organizations(id)
    ON DELETE RESTRICT,

  direction text NOT NULL CHECK (
    direction IN ('outbound', 'inbound')
  ),

  channel text NOT NULL CHECK (
    channel IN ('whatsapp', 'telegram', 'email', 'api', 'web')
  ),

  destination text NOT NULL,
  subject text,
  body text NOT NULL,

  status text NOT NULL DEFAULT 'draft' CHECK (
    status IN ('draft', 'sending', 'sent', 'error', 'received')
  ),

  provider_message_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_organization_messages_report_id
  ON public.organization_messages(report_id);

CREATE INDEX IF NOT EXISTS idx_organization_messages_organization_id
  ON public.organization_messages(organization_id);

CREATE INDEX IF NOT EXISTS idx_organization_messages_status
  ON public.organization_messages(status);

CREATE INDEX IF NOT EXISTS idx_organization_messages_direction
  ON public.organization_messages(direction);


-- ============================================================
-- 5. ENABLE RLS
-- ============================================================

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_messages ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 6. ORGANIZATIONS RLS
--
-- IMPORTANT:
-- Residents do NOT receive direct SELECT access to this table.
-- This prevents destination/contact information being exposed
-- through the public Supabase anon key.
-- ============================================================

DROP POLICY IF EXISTS "anon_read_active_organizations"
  ON public.organizations;

DROP POLICY IF EXISTS "auth_read_active_organizations"
  ON public.organizations;

DROP POLICY IF EXISTS "operator_manage_organizations"
  ON public.organizations;

CREATE POLICY "operator_manage_organizations"
ON public.organizations
FOR ALL
TO authenticated
USING (
  public.is_operator()
)
WITH CHECK (
  public.is_operator()
);


-- ============================================================
-- 7. REPORT EVENTS RLS
--
-- Residents may READ timeline events.
-- They cannot create/update/delete them directly.
--
-- IMPORTANT:
-- Do not store phone numbers, emails, message bodies,
-- API endpoints or other private operational data here.
-- ============================================================

DROP POLICY IF EXISTS "anon_read_report_events"
  ON public.report_events;

DROP POLICY IF EXISTS "auth_read_report_events"
  ON public.report_events;

DROP POLICY IF EXISTS "operator_manage_report_events"
  ON public.report_events;

CREATE POLICY "anon_read_report_events"
ON public.report_events
FOR SELECT
TO anon
USING (true);

CREATE POLICY "auth_read_report_events"
ON public.report_events
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "operator_manage_report_events"
ON public.report_events
FOR ALL
TO authenticated
USING (
  public.is_operator()
)
WITH CHECK (
  public.is_operator()
);


-- ============================================================
-- 8. ORGANIZATION MESSAGES RLS
--
-- Residents have NO access.
-- Only verified operators can access operational messages.
-- ============================================================

DROP POLICY IF EXISTS "operator_manage_organization_messages"
  ON public.organization_messages;

CREATE POLICY "operator_manage_organization_messages"
ON public.organization_messages
FOR ALL
TO authenticated
USING (
  public.is_operator()
)
WITH CHECK (
  public.is_operator()
);


-- ============================================================
-- 9. RESPONSIBLE ORGANIZATION LOOKUP
--
-- SECURITY DEFINER is required so public routing logic can find
-- an organization without exposing the organizations table.
--
-- Only returns UUID — never destination/contact information.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_responsible_organization(
  p_category text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT id
  FROM public.organizations
  WHERE category = p_category
    AND active = true
  ORDER BY created_at ASC
  LIMIT 1;
$$;

REVOKE ALL
ON FUNCTION public.get_responsible_organization(text)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.get_responsible_organization(text)
TO anon, authenticated;


-- ============================================================
-- 10. EVENT CREATION FUNCTION
--
-- Do NOT expose SECURITY DEFINER event creation to anon users.
-- Operators may use it.
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_report_event(
  p_report_id uuid,
  p_event_type text,
  p_title text,
  p_description text DEFAULT NULL,
  p_actor_type text DEFAULT 'system',
  p_actor_user_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event_id uuid;
BEGIN

  -- Only a verified operator may call this RPC directly.
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Operator access required';
  END IF;

  INSERT INTO public.report_events (
    report_id,
    event_type,
    title,
    description,
    actor_type,
    actor_user_id,
    organization_id
  )
  VALUES (
    p_report_id,
    p_event_type,
    p_title,
    p_description,
    p_actor_type,
    p_actor_user_id,
    p_organization_id
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

REVOKE ALL
ON FUNCTION public.create_report_event(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid
)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION public.create_report_event(
  uuid,
  text,
  text,
  text,
  text,
  uuid,
  uuid
)
TO authenticated;


COMMIT;