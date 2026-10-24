-- A reviewed uncertain generation must not permanently silence later questions.
-- Keep same-key recovery and the workspace-wide unresolved-outcome cap intact.
BEGIN;
DO $$
DECLARE definition text;
 needle text:='WHERE workspace_id=w AND thread_id=thread AND state IN(''running'',''unknown'')';
 replacement text:='WHERE workspace_id=w AND thread_id=thread AND state=''running''';
BEGIN
 SELECT pg_get_functiondef('briofold_ai_request_begin(uuid,uuid,text,text,text,bigint,uuid)'::regprocedure) INTO definition;
 IF position(needle IN definition)>0 THEN
  EXECUTE replace(definition,needle,replacement);
 ELSIF position(replacement IN definition)=0 THEN
  RAISE EXCEPTION 'Unexpected AI request definition; inspect before applying';
 END IF;
END $$;
COMMIT;
