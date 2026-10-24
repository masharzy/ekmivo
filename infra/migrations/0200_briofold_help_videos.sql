-- CONTROL: published tutorial inventory and account-private watch progress.
BEGIN;
DO $$BEGIN IF to_regclass('public.pg13_support') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0200 requires CONTROL help';END IF;END $$;
CREATE TABLE briofold_help_videos(
 id uuid PRIMARY KEY,module text NOT NULL CHECK(module IN ('payments','inbox','orders','customers','settings')),
 title_en text NOT NULL CHECK(length(trim(title_en)) BETWEEN 1 AND 160),title_bn text NOT NULL CHECK(length(trim(title_bn)) BETWEEN 1 AND 160),
 media_path text NOT NULL CHECK(media_path ~ '^/help-videos/[a-zA-Z0-9_/-]+\.(mp4|webm)$'),
 captions_en text NOT NULL CHECK(captions_en ~ '^/help-videos/[a-zA-Z0-9_/-]+\.vtt$'),
 captions_bn text NOT NULL CHECK(captions_bn ~ '^/help-videos/[a-zA-Z0-9_/-]+\.vtt$'),
 duration_seconds integer NOT NULL CHECK(duration_seconds BETWEEN 1 AND 14400),
 published boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE briofold_help_watch_state(
 user_id uuid NOT NULL REFERENCES app_users(id),video_id uuid NOT NULL REFERENCES briofold_help_videos(id),
 position_seconds integer NOT NULL DEFAULT 0 CHECK(position_seconds BETWEEN 0 AND 14400),watched boolean NOT NULL DEFAULT false,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(user_id,video_id)
);
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['briofold_help_videos','briofold_help_watch_state'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
END LOOP;END $$;
CREATE FUNCTION briofold_help_videos_read(w uuid,a uuid,category text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM pg13_actor(w,a,false);
 IF category IS NULL OR category NOT IN ('','payments','inbox','orders','customers','settings') THEN RAISE EXCEPTION 'Invalid tutorial module' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.module,x.title_en,x.id) FROM (
 SELECT v.id,v.module,v.title_en,v.title_bn,v.media_path,v.captions_en,v.captions_bn,v.duration_seconds,coalesce(s.position_seconds,0) position_seconds,coalesce(s.watched,false) watched
 FROM briofold_help_videos v LEFT JOIN briofold_help_watch_state s ON s.video_id=v.id AND s.user_id=a
 WHERE v.published AND (category='' OR v.module=category) ORDER BY v.module,v.title_en,v.id LIMIT 100
 )x),'[]'::jsonb));
END $$;
CREATE FUNCTION briofold_help_video_progress(w uuid,a uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v briofold_help_videos;position integer;reset boolean;BEGIN
 PERFORM pg13_actor(w,a,false);
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>1024 THEN RAISE EXCEPTION 'Invalid watch state' USING ERRCODE='22023';END IF;
 SELECT * INTO v FROM briofold_help_videos WHERE id=(b->>'id')::uuid AND published;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tutorial unavailable' USING ERRCODE='42501';END IF;
 position:=(b->>'position_seconds')::integer;reset:=coalesce((b->>'reset')::boolean,false);
 IF position IS NULL OR position<0 OR position>v.duration_seconds THEN RAISE EXCEPTION 'Invalid video position' USING ERRCODE='22023';END IF;
 IF reset THEN
  INSERT INTO briofold_help_watch_state VALUES(a,v.id,0,false,now()) ON CONFLICT(user_id,video_id) DO UPDATE SET position_seconds=0,watched=false,updated_at=now();
 ELSE
  INSERT INTO briofold_help_watch_state VALUES(a,v.id,position,position>=v.duration_seconds,now())
  ON CONFLICT(user_id,video_id) DO UPDATE SET position_seconds=greatest(briofold_help_watch_state.position_seconds,excluded.position_seconds),watched=briofold_help_watch_state.watched OR excluded.watched,updated_at=now();
 END IF;
 RETURN (SELECT to_jsonb(s)-'user_id' FROM briofold_help_watch_state s WHERE user_id=a AND video_id=v.id);
END $$;
REVOKE ALL ON FUNCTION briofold_help_videos_read(uuid,uuid,text),briofold_help_video_progress(uuid,uuid,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_help_videos_read(uuid,uuid,text),briofold_help_video_progress(uuid,uuid,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
