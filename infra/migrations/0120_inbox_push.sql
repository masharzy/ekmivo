BEGIN;
CREATE TABLE inbox_push_tokens(device_id uuid PRIMARY KEY REFERENCES mobile_devices(id),token_cipher bytea NOT NULL,updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE inbox_push_jobs(device_id uuid NOT NULL REFERENCES mobile_devices(id),message_id uuid NOT NULL REFERENCES inbox_messages(id),state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','sending','sent','failed')),attempt_at timestamptz,attempts integer NOT NULL DEFAULT 0,PRIMARY KEY(device_id,message_id));
ALTER TABLE inbox_push_tokens ENABLE ROW LEVEL SECURITY;ALTER TABLE inbox_push_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbox_push_tokens,inbox_push_jobs FROM PUBLIC,ekmivo_financial_runtime;
CREATE FUNCTION inbox_register_push(d uuid,t bytea) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO inbox_push_tokens(device_id,token_cipher) SELECT id,t FROM mobile_devices WHERE id=d AND revoked_at IS NULL ON CONFLICT(device_id) DO UPDATE SET token_cipher=EXCLUDED.token_cipher,updated_at=now()
$$;
CREATE FUNCTION inbox_queue_push() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.sender='customer' THEN INSERT INTO inbox_push_jobs(device_id,message_id)
 SELECT d.id,NEW.id FROM mobile_devices d JOIN inbox_push_tokens t ON t.device_id=d.id JOIN inbox_threads th ON th.id=NEW.thread_id JOIN inbox_connections c ON c.id=th.connection_id AND c.environment=d.environment
 WHERE d.workspace_id=NEW.workspace_id AND d.revoked_at IS NULL AND d.claimed_at IS NOT NULL ON CONFLICT DO NOTHING; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER inbox_push_after_receive AFTER INSERT ON inbox_messages FOR EACH ROW EXECUTE FUNCTION inbox_queue_push();
CREATE FUNCTION inbox_next_push() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE job inbox_push_jobs;result jsonb;
BEGIN
 UPDATE inbox_push_jobs SET state='queued' WHERE state='sending' AND attempt_at<now()-interval '1 minute' AND attempts<8;
 SELECT j.* INTO job FROM inbox_push_jobs j JOIN mobile_devices d ON d.id=j.device_id AND d.revoked_at IS NULL JOIN workspace_product_access p ON p.workspace_id=d.workspace_id AND p.product='ai' AND p.enabled
 WHERE j.state='queued' AND j.attempts<8 AND (j.attempt_at IS NULL OR j.attempt_at<now()-interval '30 seconds') ORDER BY j.attempt_at NULLS FIRST FOR UPDATE OF j SKIP LOCKED LIMIT 1;
 IF job.device_id IS NULL THEN RETURN NULL; END IF;
 UPDATE inbox_push_jobs SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE device_id=job.device_id AND message_id=job.message_id;
 SELECT jsonb_build_object('device_id',d.id,'workspace_id',d.workspace_id,'thread_id',m.thread_id,'message_id',m.id,'token',encode(t.token_cipher,'base64')) INTO result FROM mobile_devices d JOIN inbox_push_tokens t ON t.device_id=d.id JOIN inbox_messages m ON m.id=job.message_id WHERE d.id=job.device_id;
 RETURN result;
END $$;
CREATE FUNCTION inbox_finish_push(d uuid,m uuid,s text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN IF s NOT IN ('sent','queued','failed') THEN RAISE EXCEPTION 'invalid state'; END IF;UPDATE inbox_push_jobs SET state=s WHERE device_id=d AND message_id=m AND state='sending';END $$;
REVOKE ALL ON FUNCTION inbox_register_push(uuid,bytea),inbox_queue_push(),inbox_next_push(),inbox_finish_push(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_register_push(uuid,bytea),inbox_next_push(),inbox_finish_push(uuid,uuid,text) TO ekmivo_financial_runtime;
COMMIT;
