-- Review and apply manually AFTER 00006. No existing report data is rewritten.
BEGIN;

CREATE TABLE public.report_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.reports(id),
  note text NOT NULL CHECK (length(btrim(note)) BETWEEN 5 AND 2000),
  after_photo_path text NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN
    ('pending','ai_checked','needs_review','resident_confirmed','verified','reopened')),
  ai_result jsonb,
  resident_confirmed_at timestamptz,
  verified_at timestamptz,
  reopened_at timestamptz
);
CREATE INDEX ON public.report_resolutions(report_id, submitted_at DESC);
CREATE UNIQUE INDEX one_current_resolution ON public.report_resolutions(report_id)
  WHERE state <> 'reopened';
ALTER TABLE public.report_resolutions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.report_resolutions TO anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.report_resolutions FROM anon, authenticated;
CREATE POLICY public_read_resolutions ON public.report_resolutions FOR SELECT TO anon, authenticated USING (true);

-- Browser tokens are not identities. Store only a digest, never expose votes publicly.
CREATE TABLE public.resolution_feedback (
  resolution_id uuid NOT NULL REFERENCES public.report_resolutions(id),
  token_hash text NOT NULL,
  decision text NOT NULL CHECK (decision IN ('confirm','reopen')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (resolution_id, token_hash)
);
ALTER TABLE public.resolution_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.resolution_feedback FROM anon, authenticated;

INSERT INTO storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
VALUES ('resolution-images','resolution-images',true,5242880,ARRAY['image/jpeg','image/png','image/webp']);
CREATE POLICY resolution_image_read ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'resolution-images');
CREATE POLICY resolution_image_upload ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'resolution-images' AND public.is_operator()
    AND (storage.foldername(name))[1] = auth.uid()::text);
-- No UPDATE/DELETE policies: submitted evidence cannot be replaced by clients.

ALTER TABLE public.report_events DROP CONSTRAINT report_events_event_type_check;
ALTER TABLE public.report_events ADD CONSTRAINT report_events_event_type_check CHECK (event_type IN (
  'report_created','routed','message_prepared','message_sent','organization_replied','status_changed',
  'resolution_submitted','resolution_check','resolution_review','resolution_resident_confirmed',
  'resolution_verified','resolution_reopened'));
ALTER TABLE public.report_events DROP CONSTRAINT report_events_actor_type_check;
ALTER TABLE public.report_events ADD CONSTRAINT report_events_actor_type_check
  CHECK (actor_type IN ('system','operator','organization','ai','resident'));

CREATE FUNCTION public.submit_report_resolution(p_report_id uuid, p_note text, p_photo_path text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid; v_status text;
BEGIN
  IF NOT public.is_operator() THEN RAISE EXCEPTION 'Operator required' USING ERRCODE='42501'; END IF;
  IF p_note IS NULL OR length(btrim(p_note)) NOT BETWEEN 5 AND 2000 THEN RAISE EXCEPTION 'Invalid note'; END IF;
  SELECT status INTO v_status FROM public.reports WHERE id=p_report_id FOR UPDATE;
  IF NOT FOUND OR v_status NOT IN ('new','in_progress') THEN RAISE EXCEPTION 'Report is not active'; END IF;
  IF p_photo_path IS NULL OR p_photo_path NOT LIKE auth.uid()::text || '/' || p_report_id::text || '/%'
    OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id='resolution-images' AND name=p_photo_path)
    THEN RAISE EXCEPTION 'Uploaded evidence required'; END IF;
  INSERT INTO public.report_resolutions(report_id,note,after_photo_path)
    VALUES(p_report_id,btrim(p_note),p_photo_path) RETURNING id INTO v_id;
  UPDATE public.reports SET status='in_progress',resolved_at=NULL WHERE id=p_report_id;
  INSERT INTO public.report_events(report_id,event_type,title,actor_type,actor_user_id) VALUES
    (p_report_id,'resolution_submitted','Решение предоставлено','operator',auth.uid()),
    (p_report_id,'resolution_check','Проверка решения','system',NULL);
  RETURN v_id;
END $$;

CREATE FUNCTION public.record_resolution_ai(p_resolution_id uuid, p_result jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_report uuid; v_review boolean;
BEGIN
  IF NOT public.is_operator() THEN RAISE EXCEPTION 'Operator required' USING ERRCODE='42501'; END IF;
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

CREATE FUNCTION public.resolution_resident_feedback(p_resolution_id uuid,p_token uuid,p_decision text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_row public.report_resolutions; v_report uuid;
BEGIN
  IF p_token IS NULL OR p_decision IS NULL OR p_decision NOT IN ('confirm','reopen') THEN RAISE EXCEPTION 'Invalid feedback'; END IF;
  SELECT report_id INTO v_report FROM public.report_resolutions WHERE id=p_resolution_id;
  PERFORM 1 FROM public.reports WHERE id=v_report FOR UPDATE;
  SELECT * INTO v_row FROM public.report_resolutions WHERE id=p_resolution_id FOR UPDATE;
  IF NOT FOUND OR v_row.state='reopened' OR (v_row.state='verified' AND p_decision='confirm') THEN RAISE EXCEPTION 'Feedback closed'; END IF;
  INSERT INTO public.resolution_feedback(resolution_id,token_hash,decision)
    VALUES(p_resolution_id,encode(sha256(convert_to(p_token::text,'UTF8')),'hex'),p_decision);
  IF p_decision='reopen' THEN
    UPDATE public.report_resolutions SET state='reopened',reopened_at=now() WHERE id=p_resolution_id;
    UPDATE public.reports SET status='in_progress',resolved_at=NULL WHERE id=v_report;
  ELSE
    UPDATE public.report_resolutions SET state='resident_confirmed',resident_confirmed_at=now() WHERE id=p_resolution_id;
  END IF;
  INSERT INTO public.report_events(report_id,event_type,title,description,actor_type) VALUES
    (v_report,CASE WHEN p_decision='reopen' THEN 'resolution_reopened' ELSE 'resolution_resident_confirmed' END,
     CASE WHEN p_decision='reopen' THEN 'Повторно открыто' ELSE 'Житель сообщил об устранении проблемы' END,
     'Анонимный отзыв из браузера; личность не подтверждена.','resident');
END $$;

CREATE FUNCTION public.verify_report_resolution(p_resolution_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_report uuid; v_state text;
BEGIN
  IF NOT public.is_operator() THEN RAISE EXCEPTION 'Operator required' USING ERRCODE='42501'; END IF;
  SELECT report_id INTO v_report FROM public.report_resolutions WHERE id=p_resolution_id;
  PERFORM 1 FROM public.reports WHERE id=v_report FOR UPDATE;
  SELECT state INTO v_state FROM public.report_resolutions WHERE id=p_resolution_id FOR UPDATE;
  IF NOT FOUND OR v_state NOT IN ('pending','ai_checked','needs_review','resident_confirmed') THEN RAISE EXCEPTION 'Invalid transition'; END IF;
  UPDATE public.report_resolutions SET state='verified',verified_at=now() WHERE id=p_resolution_id;
  UPDATE public.reports SET status='resolved',resolved_at=now() WHERE id=v_report;
  INSERT INTO public.report_events(report_id,event_type,title,actor_type,actor_user_id)
    VALUES(v_report,'resolution_verified','Решение подтверждено после проверки оператором','operator',auth.uid());
END $$;

-- Prevent the old status control or direct REST requests from bypassing verification.
-- Existing historical resolved rows are preserved, without retroactive verification.
CREATE FUNCTION public.guard_report_resolution_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'new' OR NEW.resolved_at IS NOT NULL THEN RAISE EXCEPTION 'New reports must start unverified'; END IF;
  ELSE
    IF NEW.status='resolved' AND OLD.status<>'resolved' AND NOT EXISTS (
      SELECT 1 FROM public.report_resolutions WHERE report_id=NEW.id AND state='verified'
    ) THEN RAISE EXCEPTION 'Resolution verification required'; END IF;
    IF NEW.status<>'in_progress' AND EXISTS (
      SELECT 1 FROM public.report_resolutions WHERE report_id=NEW.id AND state IN ('pending','ai_checked','needs_review','resident_confirmed')
    ) THEN RAISE EXCEPTION 'Resolution is under review'; END IF;
    IF NEW.status<>'resolved' AND EXISTS (
      SELECT 1 FROM public.report_resolutions WHERE report_id=NEW.id AND state='verified'
    ) THEN RAISE EXCEPTION 'Reopen via resolution feedback'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guard_resolution_status BEFORE INSERT OR UPDATE OF status ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.guard_report_resolution_status();

REVOKE ALL ON FUNCTION public.submit_report_resolution(uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_resolution_ai(uuid,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolution_resident_feedback(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_report_resolution(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_report_resolution_status() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_report_resolution(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_resolution_ai(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolution_resident_feedback(uuid,uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_report_resolution(uuid) TO authenticated;
COMMIT;
