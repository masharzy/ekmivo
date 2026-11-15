package checkout

import (
	"context"
	"encoding/json"
	"os"
	"strings"
	"unicode"
)

// aiPresearchEnabled: the worker searches the catalogue for the customer's words before the model answers
// (migration 0257). Default off: earlier behaviour.
func aiPresearchEnabled() bool { return os.Getenv("BRIOFOLD_AI_PRESEARCH_ENABLED") == "true" }

const aiPresearchRule = "\nSHOP_SEARCH is a catalogue search the server already ran for the customer's words. It is current and overrides the business description, knowledge and earlier replies: a product listed there is sold by this shop. If it lists the product the customer means, answer from it (available is the stock count; 0 means out of stock now). If it does not list it, still call search_products with the likely product name before saying the shop does not have it."

// Words that never name a product: Bangla and Banglish filler, question words, quantities and verbs of buying.
var aiPresearchStop = map[string]bool{}

func init() {
	for _, w := range strings.Fields(`ase ache achhe achey ace asay nai nei na ki kii koto dam daam price
		nibo nebo nite chai chaitesi chaichi lagbe dorkar den diben dibo dite pathan pathaben order kinbo kinte
		vai bhai bhaiya apu apa sir madam hi hello salam assalamualaikum ok okay thik ache acha accha hae ha haa yes no
		ar aar er r o e te to ta ti ekta duita tinta 1ta 2ta kg kilo gram pcs piece sure plz please
		amar apnar apnader amader apni ami tumi kemon kivabe kibhabe keno kothay kobe ekhon aj kal
		is are do you have the a an any of in for with what how much and or
		আছে নাই নেই না কি কী কত দাম নিব নেব নিতে চাই লাগবে দরকার দেন দিবেন দিব অর্ডার কিনব কিনতে ভাই আপু আপা স্যার
		হাই হ্যালো সালাম ঠিক আছে হ্যাঁ হা জি আর এর ও তো টা টি একটা দুইটা কেজি গ্রাম পিস প্লিজ আমার আপনার আপনাদের আমাদের
		আপনি আমি তুমি কেমন কিভাবে কীভাবে কেন কোথায় কবে এখন আজ কাল`) {
		aiPresearchStop[w] = true
	}
}

// aiPresearchWords keeps up to five candidate product words from the customer's message, in order.
func aiPresearchWords(question string) []string {
	var words []string
	seen := map[string]bool{}
	for _, raw := range strings.FieldsFunc(strings.ToLower(question), func(r rune) bool {
		return !(unicode.IsLetter(r) || unicode.Is(unicode.Mn, r) || unicode.Is(unicode.Mc, r))
	}) {
		if len([]rune(raw)) < 2 || len([]rune(raw)) > 40 || aiPresearchStop[raw] || seen[raw] {
			continue
		}
		seen[raw] = true
		words = append(words, raw)
		if len(words) == 5 {
			break
		}
	}
	return words
}

// aiPresearch runs the read-only catalogue search for the customer's words. Best effort: on any error the model
// still has its search tool, so the caller continues without it.
func (s *Service) aiPresearch(ctx context.Context, jobID, lease, question string) json.RawMessage {
	words := aiPresearchWords(question)
	if len(words) == 0 {
		return nil
	}
	var raw []byte
	if err := s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_presearch($1::uuid,$2::uuid,$3::text[])", jobID, lease, words).Scan(&raw); err != nil {
		return nil
	}
	if !json.Valid(raw) {
		return nil
	}
	return raw
}
