/*
# Add Secure Server-Side Routing Function

## Summary
Creates a SECURITY DEFINER function that allows server-side code to
assign organizations to reports without exposing UPDATE permissions to anonymous users.

## Security
- This function uses SECURITY DEFINER to bypass RLS
- It only allows updating organization_id on reports
- It does NOT allow arbitrary field updates
- It validates that the organization exists and is active
- It does NOT expose organization contact details

## Usage
The Next.js server-side API routes can call this function via RPC to
securely assign organizations to reports without giving anon users
general UPDATE permissions.
*/

-- Create the secure routing function
CREATE OR REPLACE FUNCTION assign_report_organization(
  p_report_id uuid,
  p_category text
)
RETURNS uuid AS $$
DECLARE
  v_organization_id uuid;
  v_organization_name text;
BEGIN
  -- Find the active organization for this category
  SELECT id, name INTO v_organization_id, v_organization_name
  FROM organizations
  WHERE category = p_category AND active = true
  LIMIT 1;
  
  IF v_organization_id IS NULL THEN
    RAISE EXCEPTION 'No active organization found for category: %', p_category;
  END IF;
  
  -- Update the report with the organization ID
  UPDATE reports
  SET organization_id = v_organization_id
  WHERE id = p_report_id;
  
  RETURN v_organization_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users (for server-side API routes)
GRANT EXECUTE ON FUNCTION assign_report_organization(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION assign_report_organization(uuid, text) TO anon;
