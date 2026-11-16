-- Both financial realms. "Recheck" on SMS data failed for every SMS that came
-- through the Android phone forwarder: the SMS list (pg56_incoming_read) returns
-- pg06_phone_forwarded ids, but pg09_action 'reprocess' only looked the id up in
-- the legacy pg06_transport table, updated 0 rows and raised P0002.
-- Fix: resolve the observation from either table. Nothing else changes: only
-- unmatched/ambiguous results go back to pending, the matcher decides again.
-- Safe to run twice (skips when already applied).
BEGIN;
DO $migration$
DECLARE d text;
 old_lookup text:='observation_id=(SELECT observation_id FROM pg06_transport WHERE workspace_id=w AND environment=e AND id=resource_id)';
 new_lookup text:='observation_id=coalesce((SELECT observation_id FROM pg06_transport WHERE workspace_id=w AND environment=e AND id=resource_id),(SELECT observation_id FROM pg06_phone_forwarded WHERE workspace_id=w AND environment=e AND id=resource_id))';
BEGIN
 PERFORM 1 FROM financial_realm;
 d:=pg_get_functiondef('pg09_action(uuid,text,text,uuid,text,jsonb,bytea)'::regprocedure);
 IF position(new_lookup IN d)>0 THEN RETURN; END IF;
 IF position(old_lookup IN d)=0 THEN
  RAISE EXCEPTION 'Unknown pg09_action reprocess branch; inspect before applying migration';
 END IF;
 EXECUTE replace(d,old_lookup,new_lookup);
END $migration$;
COMMIT;
