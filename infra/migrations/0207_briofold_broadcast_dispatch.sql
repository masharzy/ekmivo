-- CONTROL only. Approval queues existing saved reply sequences to consented
-- Messenger/Instagram threads within the current conversation window. No flags
-- or provider configuration are enabled by this migration.
BEGIN;
DO $$BEGIN
 IF to_regprocedure('briofold_saved_reply_send(uuid,text,uuid,uuid,uuid,jsonb)') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN
 RAISE EXCEPTION '0207 requires CONTROL saved sequences';END IF;
END $$;
CREATE TABLE briofold_broadcast_runs(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,environment text NOT NULL,
 campaign_id uuid NOT NULL,campaign_revision bigint NOT NULL,actor_id uuid NOT NULL REFERENCES app_users(id),
 reply_id uuid NOT NULL REFERENCES briofold_inbox_saved_replies(id),reply_revision bigint NOT NULL,
 channel text NOT NULL CHECK(channel IN ('messenger','instagram')),
 preview jsonb NOT NULL,test_customer uuid,status text NOT NULL DEFAULT 'approved' CHECK(status IN ('approved','cancelled')),
 due_at timestamptz NOT NULL,expires_at timestamptz NOT NULL,time_zone text NOT NULL,quiet_start time,quiet_end time,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment,campaign_id) REFERENCES briofold_campaign_drafts(workspace_id,environment,id),
 CHECK(expires_at>due_at AND expires_at<=due_at+interval '7 days'),
 CHECK((quiet_start IS NULL AND quiet_end IS NULL) OR (quiet_start IS NOT NULL AND quiet_end IS NOT NULL AND quiet_start<>quiet_end))
);
CREATE UNIQUE INDEX briofold_broadcast_once ON briofold_broadcast_runs(campaign_id,campaign_revision) WHERE test_customer IS NULL;
CREATE UNIQUE INDEX briofold_broadcast_test_once ON briofold_broadcast_runs(campaign_id,campaign_revision,test_customer) WHERE test_customer IS NOT NULL;
CREATE TABLE briofold_broadcast_recipients(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),run_id uuid NOT NULL REFERENCES briofold_broadcast_runs(id),
 customer_id uuid NOT NULL REFERENCES briofold_customers(id),thread_id uuid NOT NULL REFERENCES inbox_threads(id),
 consent_id uuid NOT NULL REFERENCES briofold_growth_channel_consents(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','queued','blocked')),
 reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(run_id,customer_id),UNIQUE(run_id,thread_id)
);
CREATE INDEX briofold_broadcast_pending ON briofold_broadcast_recipients(run_id,id) WHERE state='pending';
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['briofold_broadcast_runs','briofold_broadcast_recipients'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_operator',t,current_user);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;
CREATE FUNCTION briofold_broadcast_actor(w uuid,a uuid) RETURNS void
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_growth_store_actor(w,a,'contact');PERFORM briofold_inbox_actor(w,a,'inbox:send');
 IF NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role IN ('owner','admin')) THEN
 RAISE EXCEPTION 'Only owner/admin may approve broadcasts' USING ERRCODE='42501';END IF;
END $$;
-- Select one exact currently consented thread per profile, never inherit consent
-- from a different identity or a merged/edited customer record.
CREATE FUNCTION briofold_broadcast_audience(w uuid,e text,ch text,segment text,test_id uuid)
 RETURNS TABLE(customer_id uuid,thread_id uuid,consent_id uuid)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT DISTINCT ON(c.id) c.id,t.id,p.id FROM briofold_customers c
 JOIN briofold_growth_channel_consents p ON p.workspace_id=c.workspace_id AND p.environment=c.environment AND p.customer_id=c.id
 JOIN briofold_customer_sources s ON s.id=p.identity_source_id AND s.workspace_id=w AND s.environment=e AND s.customer_id=c.id AND s.kind='thread'
 JOIN inbox_threads t ON t.id=s.source_id AND t.workspace_id=w
 JOIN inbox_connections n ON n.id=t.connection_id AND n.workspace_id=w AND n.environment=e AND n.enabled
 WHERE c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
 AND (test_id IS NULL OR c.id=test_id)
 AND c.preferences->>'marketing'='opted-in' AND (c.preferences->>'do_not_contact')::boolean IS FALSE
 AND (segment='all' OR (segment='qualified' AND c.stage IN ('qualified','proposal','won')) OR (segment='won' AND c.stage='won'))
 AND p.channel=ch AND p.revoked_at IS NULL AND p.verified_at<=now() AND (p.expires_at IS NULL OR p.expires_at>now())
 AND n.provider=CASE ch WHEN 'messenger' THEN 'ms' WHEN 'instagram' THEN 'ig' ELSE '' END
 AND t.last_customer_at>now()-interval '24 hours'
 AND NOT EXISTS(SELECT 1 FROM briofold_growth_suppressions x WHERE x.workspace_id=w AND x.environment=e AND x.customer_id=c.id AND x.channel IN ('all',ch))
 ORDER BY c.id,t.id,p.id
$$;
CREATE FUNCTION briofold_broadcast_preview(w uuid,e text,a uuid,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c briofold_campaign_drafts;r briofold_inbox_saved_replies;aud jsonb;parts jsonb;token text;test_id uuid:=nullif(b->>'test_customer','')::uuid;
BEGIN
 PERFORM briofold_broadcast_actor(w,a);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR b->>'channel' IS NULL OR b->>'channel' NOT IN ('messenger','instagram') THEN
 RAISE EXCEPTION 'Only current-window Messenger/Instagram is supported; other channels require approved templates/transports' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM briofold_campaign_drafts WHERE id=(b->>'campaign_id')::uuid AND workspace_id=w AND environment=e AND kind='broadcast' AND status<>'archived';
 SELECT * INTO r FROM briofold_inbox_saved_replies WHERE id=(b->>'reply_id')::uuid AND workspace_id=w AND environment=e AND active AND (visibility='team' OR created_by=a);
 IF c.id IS NULL OR r.id IS NULL THEN RAISE EXCEPTION 'Campaign or reply unavailable' USING ERRCODE='42501';END IF;
 IF c.revision IS DISTINCT FROM (b->>'campaign_revision')::bigint OR r.revision IS DISTINCT FROM (b->>'reply_revision')::bigint THEN
 RAISE EXCEPTION 'Content changed; preview again' USING ERRCODE='40001';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.customer_id),'[]') INTO aud FROM (SELECT * FROM briofold_broadcast_audience(w,e,b->>'channel',c.audience,test_id) LIMIT 501)x;
 IF jsonb_array_length(aud)>500 THEN RAISE EXCEPTION 'Narrow audience to at most 500 profiles' USING ERRCODE='54000';END IF;
 IF test_id IS NOT NULL AND jsonb_array_length(aud)<>1 THEN RAISE EXCEPTION 'Test recipient must have fresh exact channel consent' USING ERRCODE='42501';END IF;
 parts:=CASE WHEN jsonb_array_length(r.messages)>0 THEN r.messages ELSE jsonb_build_array(jsonb_build_object('type','text','text',r.body)) END;
 IF b->>'channel'='instagram' AND EXISTS(SELECT 1 FROM jsonb_array_elements(parts) x WHERE x->>'type'='document') THEN RAISE EXCEPTION 'Instagram does not support document replies' USING ERRCODE='22023';END IF;
 token:=encode(digest(jsonb_build_object('store',w,'realm',e,'actor',a,'campaign',c.id,'revision',c.revision,'reply',r.id,'reply_revision',r.revision,'channel',b->>'channel','test_customer',test_id,'audience',aud,'messages',parts)::text,'sha256'),'hex');
 RETURN jsonb_build_object('token',token,'recipients',jsonb_array_length(aud),'audience',aud,'messages',parts,'campaign_title',c.title,'channel',b->>'channel','test_customer',test_id,'window','current-24-hours','note','No message sent. Fresh consent, suppression, role, content revision, expiry and quiet hours are checked again at dispatch.');
END $$;
CREATE FUNCTION briofold_broadcast_command(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old briofold_growth_commands;fp text;res jsonb;p jsonb;c briofold_campaign_drafts;due timestamptz;expiry timestamptz;zone text;qs time;qe time;run briofold_broadcast_runs;
BEGIN
 PERFORM briofold_broadcast_actor(w,a);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>8192 OR act IS NULL OR act NOT IN ('broadcast-preview','broadcast-approve','broadcast-cancel') THEN RAISE EXCEPTION 'Invalid broadcast command' USING ERRCODE='22023';END IF;
 IF act='broadcast-preview' THEN RETURN briofold_broadcast_preview(w,e,a,b);END IF;
 fp:=encode(digest(e||':'||act||':'||b::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('growth:'||w::text||':'||e,0));
 SELECT * INTO old FROM briofold_growth_commands WHERE workspace_id=w AND actor_id=a AND operation_key=k;
 IF FOUND THEN IF old.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key conflict' USING ERRCODE='23505';END IF;RETURN old.result;END IF;
 IF act='broadcast-cancel' THEN
  SELECT * INTO run FROM briofold_broadcast_runs WHERE id=(b->>'id')::uuid AND workspace_id=w AND environment=e FOR UPDATE;
  IF run.id IS NULL THEN RAISE EXCEPTION 'Run unavailable' USING ERRCODE='42501';END IF;
  UPDATE briofold_broadcast_runs SET status='cancelled' WHERE id=run.id;
  UPDATE inbox_messages SET state='failed',error_code='BROADCAST_CANCELLED' WHERE state='queued' AND batch_id IN(SELECT id FROM briofold_broadcast_recipients WHERE run_id=run.id);
  UPDATE briofold_broadcast_recipients SET state='blocked',reason='CANCELLED' WHERE run_id=run.id AND state='pending';
  res:=jsonb_build_object('id',run.id,'status','cancelled','note','Already sending/accepted messages cannot be recalled.');
 ELSE
  IF b->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Explicit approval required' USING ERRCODE='22023';END IF;
  SELECT * INTO c FROM briofold_campaign_drafts WHERE id=(b->>'campaign_id')::uuid AND workspace_id=w AND environment=e FOR SHARE;
  PERFORM 1 FROM briofold_inbox_saved_replies WHERE id=(b->>'reply_id')::uuid AND workspace_id=w AND environment=e FOR SHARE;
  p:=briofold_broadcast_preview(w,e,a,b);
  IF p->>'token' IS DISTINCT FROM b->>'preview_token' OR (p->>'recipients')::integer=0 THEN RAISE EXCEPTION 'Audience changed or empty; preview again' USING ERRCODE='40001';END IF;
  zone:=b->>'time_zone';qs:=nullif(b->>'quiet_start','')::time;qe:=nullif(b->>'quiet_end','')::time;
  due:=briofold_followup_due((b->>'due_at')::timestamptz,zone,qs,qe);expiry:=(b->>'expires_at')::timestamptz;
  IF due IS NULL OR due<now()-interval '1 minute' OR due>now()+interval '30 days' OR expiry IS NULL OR NOT isfinite(expiry) OR expiry<=due OR expiry>due+interval '7 days' THEN RAISE EXCEPTION 'Invalid delivery schedule/expiry' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM briofold_broadcast_runs WHERE workspace_id=w AND created_at>now()-interval '1 day')>=20 THEN RAISE EXCEPTION 'Daily broadcast approval limit' USING ERRCODE='54000';END IF;
  INSERT INTO briofold_broadcast_runs(id,workspace_id,environment,campaign_id,campaign_revision,actor_id,reply_id,reply_revision,channel,preview,test_customer,due_at,expires_at,time_zone,quiet_start,quiet_end)
  VALUES(k,w,e,c.id,c.revision,a,(b->>'reply_id')::uuid,(b->>'reply_revision')::bigint,b->>'channel',p,nullif(b->>'test_customer','')::uuid,due,expiry,zone,qs,qe);
  INSERT INTO briofold_broadcast_recipients(run_id,customer_id,thread_id,consent_id)
  SELECT k,x.customer_id,x.thread_id,x.consent_id FROM jsonb_to_recordset(p->'audience') AS x(customer_id uuid,thread_id uuid,consent_id uuid);
  res:=jsonb_build_object('id',k,'status','approved','recipients',p->'recipients','due_at',due,'expires_at',expiry);
 END IF;
 INSERT INTO briofold_growth_commands VALUES(w,a,k,fp,res);RETURN res;
END $$;
CREATE FUNCTION briofold_broadcast_valid(recipient uuid) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r briofold_broadcast_recipients;n briofold_broadcast_runs;c briofold_campaign_drafts;BEGIN
 SELECT * INTO r FROM briofold_broadcast_recipients WHERE id=recipient;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO n FROM briofold_broadcast_runs WHERE id=r.run_id;
 IF n.status<>'approved' OR n.expires_at<=now() THEN RETURN false;END IF;
 BEGIN PERFORM briofold_broadcast_actor(n.workspace_id,n.actor_id);EXCEPTION WHEN insufficient_privilege THEN RETURN false;END;
 SELECT * INTO c FROM briofold_campaign_drafts WHERE id=n.campaign_id;
 IF c.revision<>n.campaign_revision OR c.status='archived' OR NOT EXISTS(SELECT 1 FROM briofold_inbox_saved_replies WHERE id=n.reply_id AND workspace_id=n.workspace_id AND environment=n.environment AND active AND revision=n.reply_revision AND (visibility='team' OR created_by=n.actor_id)) THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM briofold_broadcast_audience(n.workspace_id,n.environment,n.channel,c.audience,r.customer_id)x WHERE x.thread_id=r.thread_id AND x.consent_id=r.consent_id);
END $$;
CREATE FUNCTION briofold_broadcast_due(recipient uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT n.due_at<=now() AND briofold_followup_due(now(),n.time_zone,n.quiet_start,n.quiet_end)<=now()
 FROM briofold_broadcast_recipients r JOIN briofold_broadcast_runs n ON n.id=r.run_id WHERE r.id=recipient),false)
$$;
CREATE FUNCTION briofold_broadcast_tick() RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r briofold_broadcast_recipients;n briofold_broadcast_runs;total integer:=0;BEGIN
 FOR r IN SELECT x.* FROM briofold_broadcast_recipients x JOIN briofold_broadcast_runs y ON y.id=x.run_id WHERE x.state='pending' AND y.due_at<=now() AND (briofold_broadcast_due(x.id) OR NOT briofold_broadcast_valid(x.id)) ORDER BY y.due_at,x.id FOR UPDATE OF x SKIP LOCKED LIMIT 5 LOOP
  IF NOT briofold_broadcast_valid(r.id) THEN UPDATE briofold_broadcast_recipients SET state='blocked',reason='CONSENT_SCOPE_CONTENT_OR_EXPIRY_CHANGED' WHERE id=r.id;CONTINUE;END IF;
  IF NOT briofold_broadcast_due(r.id) THEN CONTINUE;END IF;
  SELECT * INTO n FROM briofold_broadcast_runs WHERE id=r.run_id FOR SHARE;
  BEGIN
   PERFORM briofold_saved_reply_send(n.workspace_id,n.environment,n.actor_id,r.thread_id,r.id,jsonb_build_object('id',n.reply_id,'revision',n.reply_revision,'confirmed',true));
   UPDATE briofold_broadcast_recipients SET state='queued' WHERE id=r.id;total:=total+1;
  EXCEPTION WHEN program_limit_exceeded THEN NULL; -- existing per-Store rate limit: defer, do not duplicate
   WHEN OTHERS THEN UPDATE briofold_broadcast_recipients SET state='blocked',reason='QUEUE_REJECTED_'||SQLSTATE WHERE id=r.id;
  END;
 END LOOP;RETURN total;
END $$;
CREATE FUNCTION briofold_broadcast_read(w uuid,e text,a uuid,q text DEFAULT '',off integer DEFAULT 0) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE res jsonb;BEGIN
 PERFORM briofold_broadcast_actor(w,a);
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid realm' USING ERRCODE='22023';END IF;
 IF q IS NULL OR length(q)>100 OR off IS NULL OR off NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid reply filter' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO res FROM (
 SELECT n.id,n.campaign_id,n.campaign_revision,n.channel,n.test_customer,n.status,n.due_at,n.expires_at,n.created_at,n.preview,
 (SELECT count(*) FROM briofold_broadcast_recipients r WHERE r.run_id=n.id) AS recipients,
 (SELECT count(*) FROM briofold_broadcast_recipients r WHERE r.run_id=n.id AND r.state='blocked') AS blocked,
 (SELECT count(*) FROM inbox_messages m JOIN briofold_broadcast_recipients r ON r.id=m.batch_id WHERE r.run_id=n.id AND m.state IN ('sent','delivered','seen')) AS messages_sent,
 (SELECT count(*) FROM inbox_messages m JOIN briofold_broadcast_recipients r ON r.id=m.batch_id WHERE r.run_id=n.id AND m.state IN ('failed','uncertain')) AS messages_failed_or_unknown
 FROM briofold_broadcast_runs n WHERE n.workspace_id=w AND n.environment=e ORDER BY n.created_at DESC,n.id LIMIT 100)x;
 RETURN jsonb_build_object('replies',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT id,title,body,messages,revision FROM briofold_inbox_saved_replies WHERE workspace_id=w AND environment=e AND active AND (visibility='team' OR created_by=a) AND (q='' OR title ILIKE '%'||q||'%') ORDER BY updated_at DESC,id OFFSET off LIMIT 51)x),'[]'),'items',res,'channels',jsonb_build_array('messenger','instagram'),'templates','outside-window-unavailable','note','Accepted by provider is not proof of recipient delivery. Uncertain outcomes are never automatically resent.');
END $$;
CREATE FUNCTION briofold_broadcast_send_check(i uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT briofold_broadcast_valid(m.batch_id) AND briofold_broadcast_due(m.batch_id)
 FROM inbox_messages m JOIN briofold_broadcast_recipients r ON r.id=m.batch_id WHERE m.id=i AND m.state='sending'),false)
$$;
REVOKE ALL ON FUNCTION briofold_broadcast_send_check(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_broadcast_send_check(uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
REVOKE ALL ON FUNCTION briofold_broadcast_actor(uuid,uuid),briofold_broadcast_audience(uuid,text,text,text,uuid),briofold_broadcast_preview(uuid,text,uuid,jsonb),briofold_broadcast_command(uuid,text,uuid,uuid,text,jsonb),briofold_broadcast_valid(uuid),briofold_broadcast_due(uuid),briofold_broadcast_tick(),briofold_broadcast_read(uuid,text,uuid,text,integer) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_broadcast_command(uuid,text,uuid,uuid,text,jsonb),briofold_broadcast_read(uuid,text,uuid,text,integer),briofold_broadcast_tick() TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE OR REPLACE FUNCTION inbox_next_send_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE m inbox_messages;result jsonb;BEGIN
 PERFORM briofold_inbox_due_returns();
 UPDATE inbox_messages x SET state='failed',error_code='AI_CONTEXT_CHANGED' WHERE x.sender='ai' AND x.state='queued' AND NOT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id));
 UPDATE inbox_messages x SET state='failed',error_code='BROADCAST_APPROVAL_INVALID' WHERE x.state='queued' AND EXISTS(SELECT 1 FROM briofold_broadcast_recipients r WHERE r.id=x.batch_id) AND NOT briofold_broadcast_valid(x.batch_id);
 UPDATE inbox_messages SET state='uncertain',error_code='WORKER_OUTCOME_UNKNOWN' WHERE state='sending' AND attempt_at<now()-interval '1 minute';
 UPDATE inbox_messages x SET state='failed',error_code='HUMAN_TAKEOVER' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND x.sender='ai' AND (NOT t.ai_enabled OR EXISTS(SELECT 1 FROM briofold_inbox_work z WHERE z.thread_id=t.id AND (z.disputed OR z.status='resolved')) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets q WHERE q.thread_id=t.id AND q.category IN ('complaint','refund','return') AND q.status<>'resolved'));
 UPDATE inbox_messages x SET state='failed',error_code='WINDOW_CLOSED' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND t.last_customer_at<=now()-interval '24 hours';
 SELECT x.* INTO m FROM inbox_messages x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND (NOT EXISTS(SELECT 1 FROM briofold_broadcast_recipients r WHERE r.id=x.batch_id) OR (briofold_broadcast_valid(x.batch_id) AND briofold_broadcast_due(x.batch_id))) AND (x.batch_id IS NULL OR NOT EXISTS(SELECT 1 FROM inbox_messages earlier WHERE earlier.thread_id=x.thread_id AND earlier.batch_id=x.batch_id AND earlier.sequence<x.sequence AND earlier.state NOT IN ('sent','delivered','seen'))) AND (x.sender<>'ai' OR (t.ai_enabled AND EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id)))) AND t.last_customer_at>now()-interval '24 hours' ORDER BY x.sequence FOR UPDATE OF t,x SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN NULL;END IF;
 UPDATE inbox_messages SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE id=m.id;
 SELECT jsonb_build_object('broadcast',EXISTS(SELECT 1 FROM briofold_broadcast_recipients WHERE id=m.batch_id),'id',m.id,'workspace_id',m.workspace_id,'text',m.body,'channel',c.provider,'account',c.external_id,'recipient',t.external_id,'credential',encode(c.credential_cipher,'base64')) INTO result FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id WHERE t.id=m.thread_id;RETURN result;
END $$;
COMMIT;
