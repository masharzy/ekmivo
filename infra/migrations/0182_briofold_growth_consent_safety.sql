-- CONTROL-only channel consent evidence and permanent opt-out suppression.
-- This migration deliberately installs NO broadcast dispatcher. Only a
-- trusted future provider callback may supply opt-in evidence; merchant UI
-- can inspect aggregate eligibility and record opt-outs, never self-grant.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_campaign_drafts') IS NULL
    OR to_regclass('public.briofold_customer_proofs') IS NULL
    OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0182 requires Phase 7 and 0180 CONTROL schema';
 END IF;
END $$;

CREATE TABLE briofold_growth_channel_consents(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 customer_id uuid NOT NULL,
 channel text NOT NULL CHECK(channel IN ('email','sms','whatsapp','messenger','instagram')),
 -- Consent binds to an exact verified identity, never merely to an editable
 -- profile UUID. A new email/phone proof cannot inherit an earlier opt-in.
 identity_proof_id uuid REFERENCES briofold_customer_proofs(id),
 identity_source_id uuid REFERENCES briofold_customer_sources(id),
 source_kind text NOT NULL CHECK(source_kind IN ('provider-opt-in','confirmed-double-opt-in')),
 evidence_digest text NOT NULL CHECK(evidence_digest ~ '^[0-9a-f]{64}$'),
 verified_at timestamptz NOT NULL,expires_at timestamptz,revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment,customer_id)
  REFERENCES briofold_customers(workspace_id,environment,id),
 CHECK(expires_at IS NULL OR expires_at>verified_at),
 CHECK((channel IN ('email','sms','whatsapp') AND identity_proof_id IS NOT NULL AND identity_source_id IS NULL)
  OR (channel IN ('messenger','instagram') AND identity_proof_id IS NULL AND identity_source_id IS NOT NULL))
);
CREATE INDEX briofold_growth_consents_active ON briofold_growth_channel_consents
 (workspace_id,environment,channel,customer_id)
 WHERE revoked_at IS NULL;
CREATE FUNCTION briofold_growth_consent_append_only() RETURNS trigger
 LANGUAGE plpgsql AS $$BEGIN
 IF TG_OP='DELETE' THEN
  RAISE EXCEPTION 'Consent evidence cannot be deleted' USING ERRCODE='42501';
 END IF;
 IF (to_jsonb(NEW)-'revoked_at') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at')
  OR OLD.revoked_at IS NOT NULL OR NEW.revoked_at IS NULL OR NEW.revoked_at<OLD.verified_at THEN
  RAISE EXCEPTION 'Consent evidence may only be revoked' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER briofold_growth_consent_append_only
 BEFORE UPDATE OR DELETE ON briofold_growth_channel_consents
 FOR EACH ROW EXECUTE FUNCTION briofold_growth_consent_append_only();

CREATE TABLE briofold_growth_suppressions(
 workspace_id uuid NOT NULL,environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 customer_id uuid NOT NULL,channel text NOT NULL
   CHECK(channel IN ('all','email','sms','whatsapp','messenger','instagram')),
 reason text NOT NULL CHECK(reason IN ('customer-request','provider-opt-out','staff-reported','legal')),
 actor_id uuid NOT NULL REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,environment,customer_id,channel),
 FOREIGN KEY(workspace_id,environment,customer_id)
  REFERENCES briofold_customers(workspace_id,environment,id)
);
CREATE TABLE briofold_growth_suppression_events(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id uuid NOT NULL,environment text NOT NULL,customer_id uuid NOT NULL,
 channel text NOT NULL,reason text NOT NULL,actor_id uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['briofold_growth_channel_consents','briofold_growth_suppressions','briofold_growth_suppression_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING (true) WITH CHECK (true)',t||'_operator',t,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;
CREATE FUNCTION briofold_growth_suppression_immutable() RETURNS trigger
 LANGUAGE plpgsql AS $$BEGIN
 RAISE EXCEPTION 'Marketing suppression audit is immutable' USING ERRCODE='42501';
END $$;
CREATE TRIGGER briofold_growth_suppression_immutable
 BEFORE UPDATE OR DELETE ON briofold_growth_suppressions
 FOR EACH ROW EXECUTE FUNCTION briofold_growth_suppression_immutable();
CREATE TRIGGER briofold_growth_suppression_audit_immutable
 BEFORE UPDATE OR DELETE ON briofold_growth_suppression_events
 FOR EACH ROW EXECUTE FUNCTION briofold_growth_suppression_immutable();

CREATE FUNCTION briofold_growth_audience_preview(w uuid,e text,a uuid,ch text,segment text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE eligible bigint;total bigint;opted_out bigint;unverified bigint;without_channel bigint;suppressed bigint;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'contact');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR ch IS NULL
    OR ch NOT IN ('email','sms','whatsapp','messenger','instagram')
    OR segment IS NULL OR segment NOT IN ('all','qualified','won') THEN
  RAISE EXCEPTION 'Invalid preview scope' USING ERRCODE='22023';
 END IF;
 WITH candidates AS (
  SELECT
   c.preferences->>'marketing'='opted-in' AND
    coalesce((c.preferences->>'do_not_contact')::boolean,true)=false AS profile_opt_in,
   CASE WHEN ch IN ('email','sms','whatsapp') THEN
    EXISTS(SELECT 1 FROM briofold_customer_proofs p
     WHERE p.workspace_id=w AND p.environment=e AND p.customer_id=c.id
      AND p.revoked_at IS NULL AND p.kind=CASE WHEN ch='email' THEN 'email' ELSE 'phone' END
      AND p.value=CASE WHEN ch='email' THEN c.email ELSE c.phone END)
    ELSE EXISTS(SELECT 1 FROM briofold_customer_sources s
     JOIN inbox_threads t ON t.id=s.source_id
     JOIN inbox_connections conn ON conn.id=t.connection_id
     WHERE s.workspace_id=w AND s.environment=e AND s.customer_id=c.id
      AND s.kind='thread' AND conn.workspace_id=w AND conn.environment=e
      AND conn.provider=CASE WHEN ch='messenger' THEN 'ms' ELSE 'ig' END)
   END AS verified_identity,
   EXISTS(SELECT 1 FROM briofold_growth_channel_consents proof
     WHERE proof.workspace_id=w AND proof.environment=e AND proof.customer_id=c.id
      AND proof.channel=ch AND proof.revoked_at IS NULL AND proof.verified_at<=now()
      AND (proof.expires_at IS NULL OR proof.expires_at>now())
      AND ((ch IN ('email','sms','whatsapp') AND EXISTS(
       SELECT 1 FROM briofold_customer_proofs p WHERE p.id=proof.identity_proof_id
        AND p.workspace_id=w AND p.environment=e AND p.customer_id=c.id AND p.revoked_at IS NULL
        AND p.kind=CASE WHEN ch='email' THEN 'email' ELSE 'phone' END
        AND p.value=CASE WHEN ch='email' THEN c.email ELSE c.phone END))
       OR (ch IN ('messenger','instagram') AND EXISTS(
        SELECT 1 FROM briofold_customer_sources s
         JOIN inbox_threads t ON t.id=s.source_id
         JOIN inbox_connections conn ON conn.id=t.connection_id
         WHERE s.id=proof.identity_source_id AND s.workspace_id=w AND s.environment=e
          AND s.customer_id=c.id AND s.kind='thread' AND conn.workspace_id=w AND conn.environment=e
          AND conn.provider=CASE WHEN ch='messenger' THEN 'ms' ELSE 'ig' END)))) AS channel_opt_in,
   EXISTS(SELECT 1 FROM briofold_growth_suppressions suppression
     WHERE suppression.workspace_id=w AND suppression.environment=e
      AND suppression.customer_id=c.id AND suppression.channel IN ('all',ch)) AS is_suppressed
  FROM briofold_customers c
  WHERE c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
   AND (segment='all' OR (segment='qualified' AND c.stage IN ('qualified','proposal','won'))
    OR (segment='won' AND c.stage='won'))
 )
 SELECT count(*),count(*) FILTER (WHERE NOT profile_opt_in),
  count(*) FILTER (WHERE NOT verified_identity),
  count(*) FILTER (WHERE NOT channel_opt_in),
  count(*) FILTER (WHERE is_suppressed),
  count(*) FILTER (WHERE profile_opt_in AND verified_identity AND channel_opt_in AND NOT is_suppressed)
 INTO total,opted_out,unverified,without_channel,suppressed,eligible FROM candidates;
 RETURN jsonb_build_object('channel',ch,'audience',segment,'candidate_profiles',total,
  'profile_permission_blocked',opted_out,'identity_unverified',unverified,
  'channel_proof_missing',without_channel,'suppressed',suppressed,
  'potentially_eligible_with_proof',eligible,'send_ready',false,
  'provider_status','not-configured',
  'note','Preview only. Recheck proof, suppression, provider rules and local quiet hours at dispatch; delivery is disabled.');
END $$;

CREATE FUNCTION briofold_growth_suppress_contact(w uuid,e text,a uuid,k uuid,b jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid;ch text;why text;prior briofold_growth_commands;fp text;result jsonb;inserted_count bigint;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'contact');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL
  OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>2048 THEN
  RAISE EXCEPTION 'Invalid suppression command' USING ERRCODE='22023';
 END IF;
 cid:=(b->>'customer_id')::uuid;ch:=b->>'channel';why:=b->>'reason';
 IF cid IS NULL OR ch IS NULL OR ch NOT IN ('all','email','sms','whatsapp','messenger','instagram')
  OR why IS NULL OR why NOT IN ('customer-request','provider-opt-out','staff-reported','legal') THEN
  RAISE EXCEPTION 'Invalid suppression input' USING ERRCODE='22023';
 END IF;
 fp:=encode(sha256(convert_to(e||'suppress-contact'||b::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('growth:'||w::text||':'||e,0));
 SELECT * INTO prior FROM briofold_growth_commands
  WHERE workspace_id=w AND actor_id=a AND operation_key=k;
 IF prior.operation_key IS NOT NULL THEN
  IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key reused' USING ERRCODE='23505';END IF;
  RETURN prior.result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM briofold_customers c
  WHERE c.id=cid AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL) THEN
  RAISE EXCEPTION 'Customer unavailable in Store' USING ERRCODE='42501';
 END IF;
 INSERT INTO briofold_growth_suppressions(workspace_id,environment,customer_id,channel,reason,actor_id)
  VALUES(w,e,cid,ch,why,a) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted_count = ROW_COUNT;
 IF inserted_count=1 THEN
  INSERT INTO briofold_growth_suppression_events(workspace_id,environment,customer_id,channel,reason,actor_id)
   VALUES(w,e,cid,ch,why,a);
 END IF;
 result:=jsonb_build_object('customer_id',cid,'channel',ch,'suppressed',true);
 INSERT INTO briofold_growth_commands VALUES(w,a,k,fp,result);
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION briofold_growth_audience_preview(uuid,text,uuid,text,text),
 briofold_growth_suppress_contact(uuid,text,uuid,uuid,jsonb),
 briofold_growth_consent_append_only(),
 briofold_growth_suppression_immutable()
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_growth_audience_preview(uuid,text,uuid,text,text),
 briofold_growth_suppress_contact(uuid,text,uuid,uuid,jsonb)
 TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
