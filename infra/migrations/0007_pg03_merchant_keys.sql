-- PG03: scoped merchant API credentials. Source hash ONLY, no raw token storage.
-- The public key prefix is an identifier, not an authorization credential.
-- Requires PG00..PG02 migrations and the dedicated nonprivileged runtime role.
BEGIN;
CREATE TABLE merchant_api_keys (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 public_id char(16) NOT NULL UNIQUE CHECK(public_id ~ '^[a-f0-9]{16}$'),
 secret_digest char(64) NOT NULL CHECK(secret_digest ~ '^[a-f0-9]{64}$'),
 name text NOT NULL CHECK(char_length(trim(name)) BETWEEN 2 AND 80),
 scopes text[] NOT NULL CHECK (
  cardinality(scopes) BETWEEN 1 AND 9
  AND scopes <@ ARRAY[
   'payments:read','payments:write','customers:read','customers:write',
   'invoices:read','invoices:write','refunds:read','refunds:write','webhooks:manage'
  ]::text[]
 ),
 created_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at > created_at),
 revoked_at timestamptz,
 last_used_at timestamptz,
 FOREIGN KEY (workspace_id,environment)
  REFERENCES workspace_environments(workspace_id,environment) ON DELETE CASCADE
);
CREATE INDEX merchant_api_keys_workspace_idx
 ON merchant_api_keys(workspace_id,environment,created_at DESC);
CREATE INDEX merchant_api_keys_active_idx
 ON merchant_api_keys(workspace_id,environment) WHERE revoked_at IS NULL;

CREATE TABLE merchant_api_key_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 key_id uuid NOT NULL REFERENCES merchant_api_keys(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(action IN ('created','rotated','revoked')),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX merchant_api_key_audit_scope_idx
 ON merchant_api_key_audit(workspace_id,environment,occurred_at DESC);

-- Financial runtime NEVER sees hashed key material or broad tenant rows.
-- Explicit key hash + public ID is required to resolve capability context.
ALTER TABLE merchant_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_api_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE merchant_api_key_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_api_key_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON merchant_api_keys, merchant_api_key_audit FROM PUBLIC;
REVOKE ALL ON merchant_api_keys, merchant_api_key_audit FROM ekmivo_financial_runtime;

-- Function result exposes only metadata after a full 256-bit credential match.
-- Additional server checks deny a suspended environment/disabled payment product.
CREATE FUNCTION resolve_merchant_api_key(p_public_id text,p_digest text)
RETURNS TABLE(key_id uuid,tenant_id uuid,realm text,allowed_scopes text[])
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
 SELECT k.id,k.workspace_id,k.environment,k.scopes
 FROM merchant_api_keys k
 JOIN workspace_environments e ON e.workspace_id=k.workspace_id
   AND e.environment=k.environment AND e.status='active'
 JOIN workspace_product_access p ON p.workspace_id=k.workspace_id
   AND p.product='payments' AND p.enabled
 WHERE k.public_id=p_public_id AND k.secret_digest=p_digest
   AND k.revoked_at IS NULL AND k.expires_at>now()
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION resolve_merchant_api_key(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_merchant_api_key(text,text) TO ekmivo_financial_runtime;
COMMIT;
