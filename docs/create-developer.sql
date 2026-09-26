-- Run manually as project administrator AFTER migration 00008.
-- Replace the placeholder with the UUID of the Auth user you created.
-- No password belongs in this SQL.
INSERT INTO public.operator_profiles (id, is_operator, role)
VALUES ('PASTE_AUTH_USER_UUID_HERE'::uuid, true, 'developer')
ON CONFLICT (id) DO UPDATE
SET is_operator = true, role = 'developer';

SELECT id, role, is_operator
FROM public.operator_profiles
WHERE id = 'PASTE_AUTH_USER_UUID_HERE'::uuid;
