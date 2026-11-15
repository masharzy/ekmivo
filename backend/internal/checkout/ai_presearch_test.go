package checkout

import (
	"reflect"
	"testing"
)

func TestAIPresearchWords(t *testing.T) {
	cases := map[string][]string{
		"Alu ase?":                       {"alu"},
		"Sure? alu nai?":                 {"alu"},
		"ALu nite chai":                  {"alu"},
		"nakshi kantha nil ta ache vai?": {"nakshi", "kantha", "nil"},
		"আলু আছে?":                       {"আলু"},
		"পেঁয়াজ কত টাকা কেজি?": {"পেঁয়াজ", "টাকা"},
		"hi":                                nil,
		"5 kg alu nibo":                     {"alu"},
		"Rahim Uddin, 01711111111, Mirpur":  {"rahim", "uddin", "mirpur"},
		"a b c d e f g h i j k":             nil,
		"one two three four five six seven": {"one", "two", "three", "four", "five"},
	}
	for in, want := range cases {
		if got := aiPresearchWords(in); !reflect.DeepEqual(got, want) {
			t.Errorf("%q: got %q want %q", in, got, want)
		}
	}
	t.Setenv("BRIOFOLD_AI_PRESEARCH_ENABLED", "")
	if aiPresearchEnabled() {
		t.Fatal("default must be off")
	}
}
