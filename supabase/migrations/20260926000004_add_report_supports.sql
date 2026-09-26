/*
# Add Report Supports Table for Collective Reports Feature

## Summary
Creates the report_supports table to allow residents to support existing reports
instead of creating duplicate reports for the same physical problem.

## New Table
- report_supports: tracks which anonymous residents support which reports

## Architecture
- Uses supporter_token (UUID) as privacy-safe anonymous identifier
- One token per browser/device, stored locally
- UNIQUE constraint prevents duplicate +1 from same token on same report
- Support count derived from table to avoid counter drift

## Security (RLS)
- anon users: can INSERT supports via RPC only, can check their own support status via RPC
- anon users: cannot SELECT report_supports table directly (to protect tokens)
- anon users: cannot UPDATE/DELETE supports (to prevent tampering)
- operators: full access for dashboard needs
- Views/RPCs for aggregate counts to avoid exposing individual tokens

## Important Notes
1. This migration must be executed manually in Supabase SQL editor
2. Privacy-safe: no personal data collected, only anonymous tokens
3. Additive only: does not modify existing reports, organizations, or routing functions
4. Cascade delete: supports are removed when report is deleted
5. Does NOT touch existing assign_report_organization function
*/

-- =========================================================
-- 1. REPORT SUPPORTS TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS report_supports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  supporter_token uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  
  -- Prevent duplicate +1 from same token on same report
  UNIQUE (report_id, supporter_token)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_report_supports_report_id ON report_supports(report_id);
CREATE INDEX IF NOT EXISTS idx_report_supports_supporter_token ON report_supports(supporter_token);
CREATE INDEX IF NOT EXISTS idx_report_supports_created_at ON report_supports(created_at DESC);

-- Enable RLS on report_supports
ALTER TABLE report_supports ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 2. RLS POLICIES
-- =========================================================

-- Anon users: NO direct SELECT access (use RPCs instead)
-- This protects supporter_token privacy
CREATE POLICY "anon_no_select_supports" ON report_supports
  FOR SELECT TO anon
  USING (false);

-- Anon users: NO direct INSERT access (use RPC instead)
CREATE POLICY "anon_no_insert_supports" ON report_supports
  FOR INSERT TO anon
  WITH CHECK (false);

-- Anon users: NO direct UPDATE access
CREATE POLICY "anon_no_update_supports" ON report_supports
  FOR UPDATE TO anon
  USING (false);

-- Anon users: NO direct DELETE access
CREATE POLICY "anon_no_delete_supports" ON report_supports
  FOR DELETE TO anon
  USING (false);

-- Authenticated users: NO direct SELECT access (use RPCs instead)
CREATE POLICY "auth_no_select_supports" ON report_supports
  FOR SELECT TO authenticated
  USING (false);

-- Authenticated users: NO direct INSERT access (use RPC instead)
CREATE POLICY "auth_no_insert_supports" ON report_supports
  FOR INSERT TO authenticated
  WITH CHECK (false);

-- Authenticated users: NO direct UPDATE access
CREATE POLICY "auth_no_update_supports" ON report_supports
  FOR UPDATE TO authenticated
  USING (false);

-- Authenticated users: NO direct DELETE access
CREATE POLICY "auth_no_delete_supports" ON report_supports
  FOR DELETE TO authenticated
  USING (false);

-- Operators: full access to report_supports for dashboard
CREATE POLICY "operator_manage_supports" ON report_supports
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.operator_profiles
      WHERE id = auth.uid() AND is_operator = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.operator_profiles
      WHERE id = auth.uid() AND is_operator = true
    )
  );

-- =========================================================
-- 3. SECURITY DEFINER FUNCTIONS
-- =========================================================

-- Function to get support count for a report
-- Returns only aggregate count, never supporter identities
CREATE OR REPLACE FUNCTION get_report_support_count(p_report_id uuid)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  -- Validate input
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Report ID cannot be null';
  END IF;
  
  -- Verify report exists
  IF NOT EXISTS (SELECT 1 FROM public.reports WHERE id = p_report_id) THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
  
  -- Return count only
  SELECT COUNT(*)::integer INTO v_count
  FROM public.report_supports
  WHERE report_id = p_report_id;
  
  RETURN COALESCE(v_count, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- Function to check if a token has already supported a report
-- Returns only boolean, never exposes other tokens
CREATE OR REPLACE FUNCTION has_supported_report(p_report_id uuid, p_token uuid)
RETURNS boolean AS $$
BEGIN
  -- Validate inputs
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Report ID cannot be null';
  END IF;
  
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'Supporter token cannot be null';
  END IF;
  
  -- Verify report exists
  IF NOT EXISTS (SELECT 1 FROM public.reports WHERE id = p_report_id) THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
  
  -- Return boolean only - never expose other tokens
  RETURN EXISTS (
    SELECT 1 FROM public.report_supports
    WHERE report_id = p_report_id AND supporter_token = p_token
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- Function to add support to a report
-- Inserts only into report_supports, relies on UNIQUE constraint for duplicate protection
CREATE OR REPLACE FUNCTION add_report_support(p_report_id uuid, p_token uuid)
RETURNS boolean AS $$
DECLARE
  v_report_status text;
BEGIN
  -- Validate inputs
  IF p_report_id IS NULL THEN
    RAISE EXCEPTION 'Report ID cannot be null';
  END IF;
  
  IF p_token IS NULL THEN
    RAISE EXCEPTION 'Supporter token cannot be null';
  END IF;
  
  -- Verify report exists
  SELECT status INTO v_report_status
  FROM public.reports
  WHERE id = p_report_id;
  
  IF v_report_status IS NULL THEN
    RAISE EXCEPTION 'Report not found';
  END IF;
  
  -- Reject support for reports that are not open for support
  IF v_report_status NOT IN ('new', 'in_progress') THEN
    RAISE EXCEPTION 'Report is not open for support';
  END IF;
  
  -- Insert support (UNIQUE constraint will prevent duplicates)
  INSERT INTO public.report_supports (report_id, supporter_token)
  VALUES (p_report_id, p_token);
  
  RETURN true;
EXCEPTION
  WHEN unique_violation THEN
    -- Already supported - return false instead of error
    RETURN false;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- Function to find nearby similar reports (for duplicate detection)
-- Returns only fields needed for UI, caps radius and result count for security
CREATE OR REPLACE FUNCTION find_nearby_reports(
  p_latitude numeric,
  p_longitude numeric,
  p_category text,
  p_radius_meters numeric DEFAULT 50
)
RETURNS TABLE (
  report_id uuid,
  category text,
  description text,
  address text,
  latitude numeric,
  longitude numeric,
  status text,
  created_at timestamptz,
  photo_url text,
  distance_meters numeric,
  support_count integer
) AS $$
DECLARE
  v_max_radius numeric := 500; -- Maximum allowed radius in meters
  v_max_results integer := 10; -- Maximum results to return
BEGIN
  -- Validate inputs
  IF p_latitude IS NULL OR p_latitude < -90 OR p_latitude > 90 THEN
    RAISE EXCEPTION 'Invalid latitude';
  END IF;
  
  IF p_longitude IS NULL OR p_longitude < -180 OR p_longitude > 180 THEN
    RAISE EXCEPTION 'Invalid longitude';
  END IF;
  
  IF p_category IS NULL OR p_category = '' THEN
    RAISE EXCEPTION 'Category cannot be null or empty';
  END IF;
  
  IF p_radius_meters IS NULL OR p_radius_meters < 0 THEN
    RAISE EXCEPTION 'Invalid radius';
  END IF;
  
  -- Cap radius server-side to prevent unrestricted data dump
  IF p_radius_meters > v_max_radius THEN
    RAISE EXCEPTION 'Radius too large. Maximum allowed is % meters', v_max_radius;
  END IF;
  
  -- Return only needed fields, cap result count
  -- Use CTE to calculate distance once safely with clamped acos input
  RETURN QUERY
  WITH distance_calculation AS (
    SELECT 
      r.id as report_id,
      r.category,
      r.description,
      r.address,
      r.latitude,
      r.longitude,
      r.status,
      r.created_at,
      r.photo_url,
      -- Calculate distance using Haversine formula with clamped acos input
      (
        6371000 * acos(
          LEAST(
            1.0,
            GREATEST(
              -1.0,
              cos(radians(p_latitude)) * cos(radians(r.latitude)) * 
              cos(radians(r.longitude) - radians(p_longitude)) + 
              sin(radians(p_latitude)) * sin(radians(r.latitude))
            )
          )
        )
      ) as distance_meters,
      -- Support count only, never supporter identities
      (SELECT COUNT(*) FROM public.report_supports WHERE report_id = r.id) as support_count
    FROM public.reports r
    WHERE 
      r.category = p_category
      AND r.status IN ('new', 'in_progress')  -- Only unresolved reports
  )
  SELECT 
    report_id,
    category,
    description,
    address,
    latitude,
    longitude,
    status,
    created_at,
    photo_url,
    distance_meters,
    support_count
  FROM distance_calculation
  WHERE distance_meters <= p_radius_meters
  ORDER BY distance_meters ASC
  LIMIT v_max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- =========================================================
-- 4. SECURITY: REVOKE PUBLIC EXECUTE, GRANT ONLY REQUIRED ROLES
-- =========================================================

-- Revoke execute from PUBLIC (security best practice)
REVOKE EXECUTE ON FUNCTION get_report_support_count(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION has_supported_report(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION add_report_support(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION find_nearby_reports(numeric, numeric, text, numeric) FROM PUBLIC;

-- Grant execute only to anon and authenticated (for server-side API routes)
GRANT EXECUTE ON FUNCTION get_report_support_count(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION has_supported_report(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION add_report_support(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION find_nearby_reports(numeric, numeric, text, numeric) TO anon, authenticated;

-- =========================================================
-- 5. VERIFICATION NOTES
-- =========================================================

-- This migration:
-- ✓ Does NOT modify existing reports table
-- ✓ Does NOT modify existing organizations table  
-- ✓ Does NOT touch assign_report_organization function
-- ✓ Does NOT expose supporter_token to anon users
-- ✓ Does NOT grant anon SELECT on report_supports
-- ✓ Uses SECURITY DEFINER with fixed search_path
-- ✓ Validates all function inputs
-- ✓ Caps radius and result count server-side
-- ✓ Returns only necessary fields from find_nearby_reports
-- ✓ Does NOT expose organization contact information
-- ✓ Does NOT expose privileged credentials
-- ✓ Preserves existing Phase 1 routing architecture
