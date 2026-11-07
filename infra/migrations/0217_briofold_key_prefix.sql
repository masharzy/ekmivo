-- API keys are issued as bf_test_/bf_live_ from now on. Keys already issued as ek_* stay valid.
BEGIN;
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public_sandbox_config'::regclass AND contype='c'
      AND pg_get_constraintdef(oid) LIKE '%published_test_key%'
  LOOP EXECUTE format('ALTER TABLE public_sandbox_config DROP CONSTRAINT %I', c); END LOOP;
END $$;
ALTER TABLE public_sandbox_config ADD CONSTRAINT public_sandbox_config_test_key_shape
  CHECK(published_test_key ~ '^(bf|ek)_test_[a-f0-9]{16}_[A-Za-z0-9_-]{43}$');
COMMIT;
