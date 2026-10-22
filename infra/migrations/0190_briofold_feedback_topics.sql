-- CONTROL only. Existing workspace support tickets remain durable and private.
-- Add explicit feedback categories without rewriting the support writer or its
-- Store/actor authorization, idempotency, reply and history contracts.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.pg13_support') IS NULL OR
    NOT EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='pg13_support' AND column_name='topic')
 THEN RAISE EXCEPTION '0190 requires installed CONTROL support topic schema'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid='public.pg13_support'::regclass
   AND conname='pg13_support_topic_check' AND contype='c')
 THEN RAISE EXCEPTION '0190 requires known support topic constraint'; END IF;
END $$;
ALTER TABLE pg13_support DROP CONSTRAINT pg13_support_topic_check;
ALTER TABLE pg13_support ADD CONSTRAINT pg13_support_topic_check
 CHECK(topic IN ('payments','sms','refunds','account','bug','feature','usability','other'));
COMMIT;
