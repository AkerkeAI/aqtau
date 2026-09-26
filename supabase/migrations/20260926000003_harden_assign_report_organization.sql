/*
# Harden assign_report_organization RPC

Replaces the two-argument SECURITY DEFINER function with a tightly scoped
one-argument version:

- accepts only report ID
- reads category from reports (never from the caller)
- chooses only an active organization for that category
- updates only reports.organization_id
- fixed search_path
- returns only the organization UUID (no destination/contact details)

Does not grant anon general UPDATE on reports.
*/

DROP FUNCTION IF EXISTS assign_report_organization(uuid, text);
DROP FUNCTION IF EXISTS assign_report_organization(uuid);

CREATE FUNCTION assign_report_organization(p_report_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_category text;
  v_organization_id uuid;
BEGIN
  SELECT category INTO v_category
  FROM reports
  WHERE id = p_report_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Report not found: %', p_report_id;
  END IF;

  SELECT id INTO v_organization_id
  FROM organizations
  WHERE category = v_category AND active = true
  LIMIT 1;

  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for category: %', v_category;
  END IF;

  UPDATE reports
  SET organization_id = v_organization_id
  WHERE id = p_report_id;

  RETURN v_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION assign_report_organization(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION assign_report_organization(uuid) TO anon;
GRANT EXECUTE ON FUNCTION assign_report_organization(uuid) TO authenticated;
