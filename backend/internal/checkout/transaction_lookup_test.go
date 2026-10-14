package checkout

import "testing"

func TestMerchantTransactionReferenceValidation(t *testing.T) {
 valid := []string{"TXN123456789","ABCD-12:34","ABCDE_432.1"}
 invalid := []string{"","a","contains space","<script>","Receipt\nInjected"}
 for _, s := range valid { if !merchantTrxIDPattern.MatchString(s) {t.Errorf("rejected valid reference %q",s)} }
 for _, s := range invalid { if merchantTrxIDPattern.MatchString(s) {t.Errorf("accepted invalid reference %q",s)} }
}
