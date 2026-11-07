// Package envcompat is a TEMPORARY bridge for the Ekmivo -> Briofold rename.
// Deployed services may still carry the old EKMIVO_* variable names. When a
// BRIOFOLD_* variable is not set, the matching legacy variable is copied into
// it at process start so the renamed code keeps working. Remove this package
// once every deployed environment uses the BRIOFOLD_* names.
package envcompat

import (
	"os"
	"strings"
)

const (
	legacyPrefix  = "EKMIVO_"
	currentPrefix = "BRIOFOLD_"
)

func init() { Apply(os.Environ(), os.LookupEnv, os.Setenv) }

// Apply copies each legacy variable to its BRIOFOLD_ name when that is unset.
func Apply(environ []string, lookup func(string) (string, bool), set func(string, string) error) {
	for _, kv := range environ {
		name, value, ok := strings.Cut(kv, "=")
		if !ok || !strings.HasPrefix(name, legacyPrefix) {
			continue
		}
		target := currentPrefix + strings.TrimPrefix(name, legacyPrefix)
		if _, exists := lookup(target); !exists {
			_ = set(target, value)
		}
	}
}
