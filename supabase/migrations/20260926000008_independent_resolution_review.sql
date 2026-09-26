-- Corrective migration AFTER 00007. Review manually; do not run automatically.
BEGIN;
ALTER TABLE public.operator_profiles ADD COLUMN role text NOT NULL DEFAULT 'operator'
  CHECK (role IN ('operator','developer'));
-- is_operator remains the existing administrative enable/disable flag.
REVOKE INSERT, UPDATE, DELETE ON public.operator_profiles FROM anon, authenticated;
GRANT SELECT ON public.operator_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.is_operator()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.operator_profiles
    WHERE id=auth.uid() AND is_operator AND role='operator');
$$;
CREATE FUNCTION public.is_developer()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT EXISTS (SELECT 1 FROM public.operator_profiles
    WHERE id=auth.uid() AND is_operator AND role='developer');
$$;
REVOKE ALL ON FUNCTION public.is_operator() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_developer() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_operator(), public.is_developer() TO authenticated;

-- Existing status-only UI keeps working; operators cannot rewrite original evidence.
DROP POLICY operator_update_reports ON public.reports;
CREATE POLICY operator_update_reports ON public.reports FOR UPDATE TO authenticated
  USING (public.is_operator()) WITH CHECK (public.is_operator());
REVOKE UPDATE ON public.reports FROM anon, authenticated;
GRANT UPDATE(status,resolved_at) ON public.reports TO authenticated;

ALTER TABLE public.report_resolutions ADD COLUMN submitted_by uuid REFERENCES auth.users(id);
ALTER TABLE public.report_resolutions ADD COLUMN reviewed_at timestamptz;
-- 00007 enforced this storage prefix against auth.uid(); do not guess unknown authors.
UPDATE public.report_resolutions r SET submitted_by=u.id
  FROM auth.users u WHERE split_part(r.after_photo_path,'/',1)=u.id::text;

CREATE TABLE public.resolution_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resolution_id uuid NOT NULL REFERENCES public.report_resolutions(id),
  reviewer_user_id uuid NOT NULL REFERENCES auth.users(id),
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  decision text NOT NULL CHECK (decision IN ('verify','reopen')),
  previous_state text NOT NULL,
  verification_state text NOT NULL CHECK (verification_state IN ('verified','reopened'))
);
CREATE INDEX ON public.resolution_reviews(resolution_id,reviewed_at DESC);
ALTER TABLE public.resolution_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resolution_reviews FROM anon, authenticated;
GRANT SELECT ON public.resolution_reviews TO authenticated;
CREATE POLICY developer_read_reviews ON public.resolution_reviews FOR SELECT TO authenticated
  USING (public.is_developer());

ALTER TABLE public.report_events DROP CONSTRAINT report_events_actor_type_check;
ALTER TABLE public.report_events ADD CONSTRAINT report_events_actor_type_check
  CHECK (actor_type IN ('system','operator','organization','ai','resident','developer'));
-- Protect verification timeline rows from direct operator insert/update/delete.
DROP POLICY operator_manage_report_events ON public.report_events;
CREATE POLICY operator_manage_report_events ON public.report_events FOR ALL TO authenticated
  USING (public.is_operator() AND event_type NOT LIKE 'resolution_%' AND actor_type <> 'developer')
  WITH CHECK (public.is_operator() AND event_type NOT LIKE 'resolution_%' AND actor_type <> 'developer');

CREATE OR REPLACE FUNCTION public.submit_report_resolution(p_report_id uuid, p_note text, p_photo_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  IF NOT public.is_operator() THEN RAISE EXCEPTION 'Operator required' USING ERRCODE='42501'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Invalid note'; END IF;
  SELECT status INTO v_status FROM public.reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND OR v_status NOT IN ('new','in_progress') THEN RAISE EXCEPTION 'Report is not active'; END IF;
  IF p_photo_path IS NULL OR p_photo_path NOT LIKE auth.uid()::text || '/' || p_report_id::text || '/%'
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='resolution-images' AND name=p_photo_path)
    THEN RAISE EXCEPTION 'Uploaded evidence required'; END IF;
  INSERT INTO public.report_resolutions(report_id,note,after_photo_path,submitted_by)
    VALUES(p_report_id,btrim(p_note),p_photo_path,auth.uid()) RETURNING id INTO v_id;
  UPDATE public.reports SET status='in_progress',resolved_at=NULL WHERE id=p_report_id;
  INSERT INTO public.report_events(report_id,event_type,title,actor_type,actor_user_id) VALUES
    (p_report_id,'resolution_submitted','Решение предоставлено','operator',auth.uid()),
    (p_report_id,'resolution_check','Проверка решения','system',NULL);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.record_resolution_ai(p_resolution_id uuid, p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_report uuid; v_review boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Server-only advisory' USING ERRCODE='42501'; END IF;
  IF p_result IS NULL OR jsonb_typeof(p_result->'likely_resolved') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_result->'confidence') IS DISTINCT FROM 'number'
    OR (p_result->>'confidence')::numeric NOT BETWEEN 0 AND 1
    OR jsonb_typeof(p_result->'requires_human_review') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_result->'observations') IS DISTINCT FROM 'array'
    OR length(p_result::text)>6000 THEN RAISE EXCEPTION 'Invalid advisory'; END IF;
  v_review := (p_result->>'requires_human_review')::boolean
    OR NOT (p_result->>'likely_resolved')::boolean OR (p_result->>'confidence')::numeric < 0.8;
  UPDATE public.report_resolutions SET ai_result=p_result,
    state=CASE WHEN v_review THEN 'needs_review' ELSE 'ai_checked' END
    WHERE id=p_resolution_id AND state='pending' RETURNING report_id INTO v_report;
  -- Late AI responses must never overwrite resident feedback or human decisions.
  IF v_report IS NOT NULL THEN
    INSERT INTO public.report_events(report_id,event_type,title,actor_type) VALUES
      (v_report,CASE WHEN v_review THEN 'resolution_review' ELSE 'resolution_check' END,
       CASE WHEN v_review THEN 'Требуется дополнительная проверка' ELSE 'Анализ фото завершён — требуется подтверждение человека' END,'ai');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.record_resolution_ai(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_resolution_ai(uuid,jsonb) TO service_role;

CREATE FUNCTION public.review_report_resolution(p_resolution_id uuid,p_decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
DECLARE v_report uuid; v_row public.report_resolutions; v_next text; v_time timestamptz := now();
BEGIN
  IF NOT public.is_developer() THEN RAISE EXCEPTION 'Developer required' USING ERRCODE='42501'; END IF;
  IF p_resolution_id IS NULL OR p_decision IS NULL OR p_decision NOT IN ('verify','reopen')
    THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
  SELECT report_id INTO v_report FROM public.report_resolutions WHERE id=p_resolution_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resolution not found' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.reports WHERE id=v_report FOR UPDATE;
  SELECT * INTO v_row FROM public.report_resolutions WHERE id=p_resolution_id FOR UPDATE;
  -- Even an operator later promoted to developer cannot review their own evidence.
  -- Unknown legacy author fails closed until an administrator establishes provenance.
  IF v_row.submitted_by IS NULL OR v_row.submitted_by=auth.uid()
    THEN RAISE EXCEPTION 'Independent reviewer required' USING ERRCODE='42501'; END IF;
  IF v_row.state='reopened' OR (p_decision='verify' AND v_row.state='verified' AND v_row.reviewed_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Review already completed' USING ERRCODE='22023'; END IF;
  v_next := CASE WHEN p_decision='verify' THEN 'verified' ELSE 'reopened' END;
  INSERT INTO public.resolution_reviews(resolution_id,reviewer_user_id,reviewed_at,decision,previous_state,verification_state)
    VALUES(p_resolution_id,auth.uid(),v_time,p_decision,v_row.state,v_next);
  UPDATE public.report_resolutions SET state=v_next,reviewed_at=v_time,
    verified_at=CASE WHEN p_decision='verify' THEN v_time ELSE verified_at END,
    reopened_at=CASE WHEN p_decision='reopen' THEN v_time ELSE reopened_at END WHERE id=p_resolution_id;
  UPDATE public.reports SET status=CASE WHEN p_decision='verify' THEN 'resolved' ELSE 'in_progress' END,
    resolved_at=CASE WHEN p_decision='verify' THEN v_time ELSE NULL END WHERE id=v_report;
  INSERT INTO public.report_events(report_id,event_type,title,actor_type,actor_user_id)
    VALUES(v_report,CASE WHEN p_decision='verify' THEN 'resolution_verified' ELSE 'resolution_reopened' END,
      CASE WHEN p_decision='verify' THEN 'Решение подтверждено независимым проверяющим' ELSE 'Повторно открыто' END,
      'developer',auth.uid());
END $$;

-- Preserve the old RPC name, but REMOVE its old operator authorization.
CREATE OR REPLACE FUNCTION public.verify_report_resolution(p_resolution_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  PERFORM public.review_report_resolution(p_resolution_id,'verify');
END $$;
REVOKE ALL ON FUNCTION public.review_report_resolution(uuid,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_report_resolution(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_report_resolution(uuid,text), public.verify_report_resolution(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_report_resolution_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'new' OR NEW.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'New reports must start unverified'; END IF;
  ELSE
    IF NEW.status='resolved' AND (OLD.status<>'resolved' OR NEW.resolved_at IS DISTINCT FROM OLD.resolved_at) THEN
      IF NOT public.is_developer() OR NOT EXISTS (
        SELECT 1 FROM public.report_resolutions r JOIN public.resolution_reviews a ON a.resolution_id=r.id
        WHERE r.report_id=NEW.id AND r.state='verified' AND r.reviewed_at=a.reviewed_at
          AND a.decision='verify' AND a.reviewer_user_id=auth.uid()
          AND r.submitted_by<>auth.uid() AND NEW.resolved_at=r.verified_at
      ) THEN RAISE EXCEPTION 'Independent developer verification required' USING ERRCODE='42501'; END IF;
    END IF;
    IF NEW.status<>'resolved' AND NEW.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'Active reports cannot have a resolution date'; END IF;
    IF NEW.status<>'in_progress' AND EXISTS (
      SELECT 1 FROM public.report_resolutions WHERE report_id=NEW.id AND state IN ('pending','ai_checked','needs_review','resident_confirmed')
    ) THEN RAISE EXCEPTION 'Resolution is under review'; END IF;
    IF NEW.status<>'resolved' AND EXISTS (
      SELECT 1 FROM public.report_resolutions WHERE report_id=NEW.id AND state='verified'
    ) THEN RAISE EXCEPTION 'Reopen through resolution review or resident feedback'; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER guard_resolution_status ON public.reports;
CREATE TRIGGER guard_resolution_status BEFORE INSERT OR UPDATE OF status,resolved_at ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_report_resolution_status();
REVOKE ALL ON FUNCTION public.guard_report_resolution_status() FROM PUBLIC,anon,authenticated;

-- Keep the public resident signal; it cannot ever produce a verified state.
ALTER FUNCTION public.resolution_resident_feedback(uuid,uuid,text) SET search_path = public, pg_catalog;
REVOKE ALL ON FUNCTION public.submit_report_resolution(uuid,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.submit_report_resolution(uuid,text,text) TO authenticated;

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
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_event_id uuid;
BEGIN

  -- Only a verified operator may call this RPC directly.
  IF NOT public.is_operator() THEN
    RAISE EXCEPTION 'Operator access required';
  END IF;

  IF p_event_type LIKE 'resolution_%' OR p_actor_type='developer' THEN
    RAISE EXCEPTION 'Use the authorized resolution workflow' USING ERRCODE='42501';
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

REVOKE ALL ON FUNCTION public.create_report_event(uuid,text,text,text,text,uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.create_report_event(uuid,text,text,text,text,uuid,uuid) TO authenticated;
COMMIT;
