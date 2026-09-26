/*
# Fix find_nearby_reports Ambiguous Column Reference

## Problem
The find_nearby_reports function has an ambiguous column reference to "report_id"
in the support-count subquery, causing it to fail with:
"column reference report_id is ambiguous"

## Root Cause
The function RETURNS TABLE includes a column named "report_id", and the subquery
also references report_id without table aliasing, causing PostgreSQL to be unable
to distinguish between the RETURNS TABLE column and the table column.

## Solution
- Add table alias "rs" to public.report_supports in the subquery
- Add table alias "dc" to the CTE distance_calculation
- Explicitly qualify all column references to remove ambiguity
- Preserve all security features, validation, and clamped Haversine

## What This Changes
- ONLY replaces the find_nearby_reports function
- Does NOT modify report_supports table
- Does NOT modify reports table
- Does NOT modify organizations
- Does NOT modify assign_report_organization
- Does NOT modify other Phase 2 RPCs
*/

-- =========================================================
-- REPLACE find_nearby_reports WITH FIXED AMBIGUOUS COLUMN
-- =========================================================

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
  -- Fixed: added table aliases to remove ambiguous column references
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
      -- Fixed: added table alias "rs" to remove ambiguous report_id reference
      (SELECT COUNT(*) FROM public.report_supports AS rs WHERE rs.report_id = r.id) as support_count
    FROM public.reports r
    WHERE 
      r.category = p_category
      AND r.status IN ('new', 'in_progress')  -- Only unresolved reports
  )
  SELECT 
    dc.report_id,
    dc.category,
    dc.description,
    dc.address,
    dc.latitude,
    dc.longitude,
    dc.status,
    dc.created_at,
    dc.photo_url,
    dc.distance_meters,
    dc.support_count
  FROM distance_calculation AS dc
  WHERE dc.distance_meters <= p_radius_meters
  ORDER BY dc.distance_meters ASC
  LIMIT v_max_results;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog;

-- =========================================================
-- SECURITY: REVOKE PUBLIC EXECUTE, GRANT ONLY REQUIRED ROLES
-- =========================================================

-- Revoke execute from PUBLIC (security best practice)
REVOKE EXECUTE ON FUNCTION find_nearby_reports(numeric, numeric, text, numeric) FROM PUBLIC;

-- Grant execute only to anon and authenticated (for server-side API routes)
GRANT EXECUTE ON FUNCTION find_nearby_reports(numeric, numeric, text, numeric) TO anon, authenticated;
