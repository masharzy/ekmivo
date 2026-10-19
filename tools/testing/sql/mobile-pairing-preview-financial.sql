-- Run after 0115 inside an enclosing transaction on an isolated Neon test branch.
DO $test$
DECLARE w uuid:=gen_random_uuid(); p uuid:=gen_random_uuid(); got jsonb; e text;
BEGIN
 SELECT environment INTO e FROM financial_realm WHERE singleton;
 INSERT INTO financial_workspace_registry(workspace_id,environment,status,entitlement_version) VALUES(w,e,'active',1);
 INSERT INTO pg06_phones(id,workspace_id,environment,name,pair_digest,pair_expires_at)
 VALUES(p,w,e,'Synthetic preview test',repeat('a',64),now()+interval '5 minutes');
 got:=pg06_phone_pairing_preview(repeat('a',64));
 IF got->>'workspace_id'<>w::text OR got->>'environment'<>e THEN RAISE EXCEPTION 'valid preview scope failed'; END IF;
 IF pg06_phone_pairing_preview(repeat('a',64)) IS NULL THEN RAISE EXCEPTION 'preview consumed the token'; END IF;
 IF (SELECT pair_digest<>repeat('a',64) OR public_key IS NOT NULL FROM pg06_phones WHERE id=p) THEN RAISE EXCEPTION 'preview mutated pairing'; END IF;
 UPDATE pg06_phones SET pair_expires_at=now()-interval '1 second' WHERE id=p;
 IF pg06_phone_pairing_preview(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'expired code leaked workspace'; END IF;
 UPDATE pg06_phones SET pair_expires_at=now()+interval '5 minutes',revoked_at=now() WHERE id=p;
 IF pg06_phone_pairing_preview(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'revoked code leaked workspace'; END IF;
 UPDATE pg06_phones SET revoked_at=NULL,public_key=decode('abcd','hex'),claimed_at=now() WHERE id=p;
 IF pg06_phone_pairing_preview(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'claimed code leaked workspace'; END IF;
 UPDATE pg06_phones SET public_key=NULL,claimed_at=NULL WHERE id=p;
 UPDATE financial_workspace_registry SET status='suspended' WHERE workspace_id=w AND environment=e;
 IF pg06_phone_pairing_preview(repeat('a',64)) IS NOT NULL THEN RAISE EXCEPTION 'suspended workspace leaked'; END IF;
 IF pg06_phone_pairing_preview('invalid') IS NOT NULL THEN RAISE EXCEPTION 'invalid digest leaked'; END IF;
END $test$;
SELECT true AS preview_readonly_expired_revoked_claimed_suspended_checks_passed;
