-- Phase 1: the Go product API needs the key's owning actor to store images
-- fetched from image_urls. Scope is checked inside the function; it returns
-- nothing for a revoked, expired or wrong-scope key.
GRANT EXECUTE ON FUNCTION commerce_api_key_actor(uuid,text,uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
