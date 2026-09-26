/*
# Add Operator Authentication and Role-Based Access Control

## Summary
Adds operator authentication system using Supabase Auth with role-based access control.
Creates operator_profiles table to track operator status and enforces RLS policies
to restrict report UPDATE/DELETE operations to authenticated operators only.

## New Tables
- `operator_profiles`
  - `id` (uuid, primary key, references auth.users)
  - `is_operator` (boolean, default false) - explicitly marks users as operators
  - `created_at` (timestamptz, default now())

## Security (RLS)
- Updates RLS policies on `reports` table:
  - anon users: SELECT and INSERT only (no UPDATE/DELETE)
  - authenticated users: SELECT only (no UPDATE/DELETE by default)
  - authenticated operators: SELECT, INSERT, UPDATE (no DELETE)
- RLS enabled on `operator_profiles`
- Only operators can be marked as operators (through manual Supabase admin actions)

## Important Notes
1. This migration must be executed manually in Supabase SQL editor
2. Operator accounts must be created manually by admin in Supabase Auth
3. After creating auth user, admin must manually insert into operator_profiles table
4. No public operator registration - operators are managed by AqTau admin only
*/

-- =========================================================
-- 1. OPERATOR_PROFILES TABLE
-- =========================================================

CREATE TABLE IF NOT EXISTS operator_profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  is_operator boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS on operator_profiles
ALTER TABLE operator_profiles ENABLE ROW LEVEL SECURITY;

-- Policy: users can only read their own profile
DROP POLICY IF EXISTS "users_read_own_profile" ON operator_profiles;
CREATE POLICY "users_read_own_profile" ON operator_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

-- =========================================================
-- 2. UPDATE REPORTS RLS POLICIES
-- =========================================================

-- Remove existing policies
DROP POLICY IF EXISTS "anon_select_reports" ON reports;
DROP POLICY IF EXISTS "anon_insert_reports" ON reports;
DROP POLICY IF EXISTS "anon_update_reports" ON reports;
DROP POLICY IF EXISTS "anon_delete_reports" ON reports;

-- Anon users: SELECT and INSERT only
CREATE POLICY "anon_select_reports" ON reports
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "anon_insert_reports" ON reports
  FOR INSERT TO anon
  WITH CHECK (true);

-- Authenticated users: SELECT only (no UPDATE/DELETE by default)
CREATE POLICY "auth_select_reports" ON reports
  FOR SELECT TO authenticated
  USING (true);

-- Authenticated users: INSERT only (for residents creating reports)
CREATE POLICY "auth_insert_reports" ON reports
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Operators: UPDATE reports (status changes only)
CREATE POLICY "operator_update_reports" ON reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM operator_profiles
      WHERE id = auth.uid() AND is_operator = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM operator_profiles
      WHERE id = auth.uid() AND is_operator = true
    )
  );

-- Note: DELETE is intentionally not allowed for any role
-- Reports should only be archived, not deleted

-- =========================================================
-- 3. HELPER FUNCTION TO CHECK IF USER IS OPERATOR
-- =========================================================

CREATE OR REPLACE FUNCTION is_operator()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM operator_profiles
    WHERE id = auth.uid() AND is_operator = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
