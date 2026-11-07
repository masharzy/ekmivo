package envcompat

import "testing"

func TestApplyCopiesLegacyOnlyWhenNewUnset(t *testing.T) {
	env := map[string]string{"BRIOFOLD_B": "new"}
	lookup := func(k string) (string, bool) { v, ok := env[k]; return v, ok }
	set := func(k, v string) error { env[k] = v; return nil }
	Apply([]string{"EKMIVO_A=old-a", "EKMIVO_B=old-b", "OTHER=x", "EKMIVO_C=a=b"}, lookup, set)
	if env["BRIOFOLD_A"] != "old-a" || env["BRIOFOLD_B"] != "new" || env["BRIOFOLD_C"] != "a=b" || len(env) != 3 {
		t.Fatalf("unexpected env: %v", env)
	}
}
