-- 0252 (control): the owner's COD advance rule is saved with the other AI selling settings.
-- briofold_ai_selling_save is the production definition plus the two new fields; briofold_ai_selling_read already
-- returns every column of commerce_ai_settings. Requires 0247. Idempotent.
BEGIN;
DO $preflight$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='commerce_ai_settings' AND column_name='advance_rule') THEN
  RAISE EXCEPTION '0252 requires 0247' USING ERRCODE='42501';
 END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.briofold_ai_selling_save(w uuid,e text,a uuid,rev bigint,patch jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE cur bigint;BEGIN
 PERFORM briofold_customer_actor(w,a,'contact');
 IF e NOT IN('live','sandbox') OR rev IS NULL OR rev<0 THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';END IF;
 INSERT INTO commerce_ai_settings(workspace_id,environment) VALUES(w,e) ON CONFLICT DO NOTHING;
 SELECT revision INTO cur FROM commerce_ai_settings WHERE workspace_id=w AND environment=e FOR UPDATE;
 -- rev 0 = the caller saw no row yet; a fresh row starts at revision 1.
 IF cur<>rev AND NOT(rev=0 AND cur=1) THEN RAISE EXCEPTION 'Settings changed' USING ERRCODE='40001';END IF;
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail)
  VALUES(w,e,w,a,'ai-selling-settings',jsonb_build_object('fields',(SELECT coalesce(jsonb_agg(k ORDER BY k),'[]') FROM jsonb_object_keys(patch) k)));
 IF jsonb_exists(patch,'handover_above_minor') THEN
  UPDATE commerce_ai_settings SET handover_above_minor=(patch->>'handover_above_minor')::bigint WHERE workspace_id=w AND environment=e;END IF;
 IF jsonb_exists(patch,'advance_rule') THEN
  IF patch->>'advance_rule' NOT IN('none','delivery','percent','full') THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';END IF;
  UPDATE commerce_ai_settings SET advance_rule=patch->>'advance_rule' WHERE workspace_id=w AND environment=e;END IF;
 IF jsonb_exists(patch,'advance_pct') THEN
  IF (patch->>'advance_pct')::integer NOT BETWEEN 1 AND 99 THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';END IF;
  UPDATE commerce_ai_settings SET advance_pct=(patch->>'advance_pct')::integer WHERE workspace_id=w AND environment=e;END IF;
 RETURN briofold_ai_selling_write(w,e,a,patch-'handover_above_minor'-'advance_rule'-'advance_pct');
END $$;
COMMIT;
