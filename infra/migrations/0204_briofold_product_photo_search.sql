-- CONTROL: bounded local visual similarity, text retrieval and private labelled evaluations.
BEGIN;
DO $$BEGIN IF to_regclass('public.commerce_media') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0204 requires CONTROL catalog';END IF;END $$;
CREATE FUNCTION commerce_photo_signature_valid(h text,c jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $$BEGIN
 IF h IS NULL OR h!~'^[01]{64}$' OR jsonb_typeof(c) IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF jsonb_array_length(c)<>3 THEN RETURN false;END IF;
 RETURN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c) x WHERE x::text!~'^[0-9]{1,3}$' OR CASE WHEN x::text~'^[0-9]{1,3}$' THEN (x::text)::integer>255 ELSE true END);
END $$;
CREATE TABLE commerce_photo_features(media_id uuid PRIMARY KEY REFERENCES commerce_media(id),source_sha256 text NOT NULL CHECK(source_sha256~'^[0-9a-f]{64}$'),hash bit(64) NOT NULL,colors jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),CHECK(commerce_photo_signature_valid(hash::text,colors)));
CREATE TABLE commerce_photo_evaluations(workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),actor_id uuid NOT NULL REFERENCES app_users(id),operation_key uuid NOT NULL,expected_product_id uuid NOT NULL REFERENCES commerce_products(id),query_fingerprint text NOT NULL,result jsonb NOT NULL,top5_hit boolean NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,environment,actor_id,operation_key));
CREATE INDEX commerce_photo_eval_actor ON commerce_photo_evaluations(workspace_id,environment,actor_id,created_at);
ALTER TABLE commerce_photo_features ENABLE ROW LEVEL SECURITY;ALTER TABLE commerce_photo_features FORCE ROW LEVEL SECURITY;
ALTER TABLE commerce_photo_evaluations ENABLE ROW LEVEL SECURITY;ALTER TABLE commerce_photo_evaluations FORCE ROW LEVEL SECURITY;
CREATE POLICY commerce_photo_features_owner ON commerce_photo_features TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY commerce_photo_evaluations_owner ON commerce_photo_evaluations TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON commerce_photo_features,commerce_photo_evaluations FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE TRIGGER commerce_photo_evaluations_immutable BEFORE UPDATE OR DELETE ON commerce_photo_evaluations FOR EACH ROW EXECUTE FUNCTION briofold_customer_event_immutable();
CREATE FUNCTION commerce_photo_actor(w uuid,a uuid,manage boolean DEFAULT false) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r text;BEGIN
 r:=commerce_actor(w,a,manage);
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w AND p.enabled AND pg13_capability_override(w,a,'product:'||p.product) IS DISTINCT FROM false) THEN RAISE EXCEPTION 'Catalog access denied' USING ERRCODE='42501';END IF;RETURN r;
END $$;
CREATE FUNCTION commerce_photo_index_source(w uuid,e text,a uuid,i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r jsonb;BEGIN
 PERFORM commerce_photo_actor(w,a,true);IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Photo realm invalid' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object('object_key',object_key,'sha256',sha256) INTO r FROM commerce_media WHERE workspace_id=w AND environment=e AND id=i;
 IF r IS NULL THEN RAISE EXCEPTION 'Photo unavailable' USING ERRCODE='42501';END IF;RETURN r;
END $$;
CREATE FUNCTION commerce_photo_index(w uuid,e text,a uuid,i uuid,sha text,h text,c jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM commerce_photo_index_source(w,e,a,i);
 IF NOT commerce_photo_signature_valid(h,c) THEN RAISE EXCEPTION 'Invalid photo signature' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM commerce_media WHERE workspace_id=w AND environment=e AND id=i AND sha256=sha) THEN RAISE EXCEPTION 'Photo source changed' USING ERRCODE='40001';END IF;
 INSERT INTO commerce_photo_features(media_id,source_sha256,hash,colors) VALUES(i,sha,h::bit(64),c) ON CONFLICT(media_id) DO UPDATE SET source_sha256=EXCLUDED.source_sha256,hash=EXCLUDED.hash,colors=EXCLUDED.colors,updated_at=now();RETURN true;
END $$;
CREATE FUNCTION commerce_photo_similarity(h text,c jsonb,sh bit(64),sc jsonb) RETURNS numeric LANGUAGE sql IMMUTABLE AS $$
 SELECT round((1-bit_count(h::bit(64)#sh)::numeric/64*0.7-(abs((c->>0)::integer-(sc->>0)::integer)+abs((c->>1)::integer-(sc->>1)::integer)+abs((c->>2)::integer-(sc->>2)::integer))::numeric/765*0.3)*100,1)
$$;
CREATE FUNCTION commerce_photo_metrics(w uuid,e text,a uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r text;BEGIN
 r:=commerce_photo_actor(w,a,false);IF r NOT IN ('owner','admin') OR pg13_capability_override(w,a,'workspace:settings') IS false THEN RAISE EXCEPTION 'Private photo evaluation denied' USING ERRCODE='42501';END IF;
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Photo realm invalid' USING ERRCODE='22023';END IF;
 RETURN(SELECT jsonb_build_object('tested',count(*),'top5_hits',count(*) FILTER(WHERE top5_hit),'period_days',30) FROM commerce_photo_evaluations WHERE workspace_id=w AND environment=e AND actor_id=a AND created_at>=now()-interval '30 days');
END $$;
CREATE FUNCTION commerce_photo_search(w uuid,e text,a uuid,h text,c jsonb,q text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r text;items jsonb;BEGIN
 r:=commerce_photo_actor(w,a,false);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR q IS NULL OR length(q)>100 OR (h IS NULL AND (c IS NOT NULL OR length(trim(q))=0)) OR (h IS NOT NULL AND NOT commerce_photo_signature_valid(h,c)) THEN RAISE EXCEPTION 'Invalid photo search' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.similarity DESC NULLS LAST,x.name,x.product_id),'[]') INTO items FROM(
  SELECT p.id AS product_id,p.name,f.media_id,f.similarity
  FROM commerce_products p LEFT JOIN LATERAL(
   SELECT m.id AS media_id,CASE WHEN h IS NOT NULL THEN commerce_photo_similarity(h,c,ph.hash,ph.colors) ELSE NULL END AS similarity
   FROM commerce_media m JOIN commerce_photo_features ph ON ph.media_id=m.id AND ph.source_sha256=m.sha256
   WHERE m.workspace_id=w AND m.environment=e AND m.id=ANY(p.images)
   ORDER BY similarity DESC NULLS LAST,m.id LIMIT 1
  )f ON true
  WHERE p.workspace_id=w AND p.environment=e AND p.active AND (h IS NULL OR f.similarity>=90)
   AND (q='' OR p.name ILIKE '%'||q||'%' OR to_tsvector('simple',p.name||' '||p.description)@@websearch_to_tsquery('simple',q) OR EXISTS(SELECT 1 FROM commerce_variants v WHERE v.workspace_id=w AND v.environment=e AND v.product_id=p.id AND v.sku ILIKE '%'||q||'%'))
  ORDER BY f.similarity DESC NULLS LAST,p.name,p.id LIMIT 20
 )x;
 RETURN jsonb_build_object('items',items,'can_index',r IN ('owner','admin','editor'),'can_evaluate',r IN ('owner','admin') AND pg13_capability_override(w,a,'workspace:settings') IS DISTINCT FROM false,
 'stored_photos',(SELECT count(*) FROM commerce_media WHERE workspace_id=w AND environment=e),
 'indexed_photos',(SELECT count(*) FROM commerce_media m JOIN commerce_photo_features f ON f.media_id=m.id AND f.source_sha256=m.sha256 WHERE m.workspace_id=w AND m.environment=e));
END $$;
CREATE FUNCTION commerce_photo_evaluate(w uuid,e text,a uuid,k uuid,expected uuid,h text,c jsonb,q text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE prior commerce_photo_evaluations;fp text;r jsonb;rank integer;BEGIN
 PERFORM commerce_photo_metrics(w,e,a);
 IF k IS NULL OR NOT EXISTS(SELECT 1 FROM commerce_products WHERE id=expected AND workspace_id=w AND environment=e AND active) THEN RAISE EXCEPTION 'Expected product unavailable' USING ERRCODE='42501';END IF;
 fp:=encode(digest(jsonb_build_array(expected,h,c,q)::text,'sha256'),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('commerce:photo-eval:'||w::text||a::text,0));
 SELECT * INTO prior FROM commerce_photo_evaluations WHERE workspace_id=w AND environment=e AND actor_id=a AND operation_key=k;
 IF FOUND THEN IF prior.query_fingerprint<>fp THEN RAISE EXCEPTION 'Evaluation operation conflict' USING ERRCODE='23505';END IF;RETURN prior.result;END IF;
 r:=commerce_photo_search(w,e,a,h,c,q);
 SELECT ord::integer INTO rank FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(value,ord) WHERE value->>'product_id'=expected::text;
 r:=r||jsonb_build_object('expected_rank',rank,'top5_hit',coalesce(rank<=5,false));
 INSERT INTO commerce_photo_evaluations VALUES(w,e,a,k,expected,fp,r,coalesce(rank<=5,false),now());
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION commerce_photo_signature_valid(text,jsonb),commerce_photo_actor(uuid,uuid,boolean),commerce_photo_similarity(text,jsonb,bit,jsonb),commerce_photo_index_source(uuid,text,uuid,uuid),commerce_photo_index(uuid,text,uuid,uuid,text,text,jsonb),commerce_photo_metrics(uuid,text,uuid),commerce_photo_search(uuid,text,uuid,text,jsonb,text),commerce_photo_evaluate(uuid,text,uuid,uuid,uuid,text,jsonb,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_photo_index_source(uuid,text,uuid,uuid),commerce_photo_index(uuid,text,uuid,uuid,text,text,jsonb),commerce_photo_metrics(uuid,text,uuid),commerce_photo_search(uuid,text,uuid,text,jsonb,text),commerce_photo_evaluate(uuid,text,uuid,uuid,uuid,text,jsonb,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
