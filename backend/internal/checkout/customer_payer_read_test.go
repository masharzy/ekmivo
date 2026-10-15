package checkout

import (
 "encoding/base64"
 "testing"

 "github.com/masharzy/ekmivo/backend/internal/deviceevidence"
)

func TestReadEncryptedPayerPhone(t *testing.T){
 key:=[]byte("01234567890123456789012345678901")
 aad:="workspace|live|refund-customer"
 receipt:=[]byte(`{"name":"","email":"","phone":"01712345678"}`)
 cipher,err:=deviceevidence.Encrypt(key,receipt,aad)
 if err!=nil{t.Fatal(err)}
 encoded:=base64.StdEncoding.EncodeToString(cipher)
 if got:=readEncryptedPayerPhone(key,encoded,aad);got!="+8801712345678"{t.Fatalf("expected canonical phone, got %q",got)}
 if got:=readEncryptedPayerPhone(key,encoded,"wrong|live|refund-customer");got!=""{t.Fatalf("wrong associated data revealed phone")}
 if got:=readEncryptedPayerPhone(key,"not base64",aad);got!=""{t.Fatalf("invalid ciphertext revealed phone")}
 wrong:=[]byte("abcdefghijklmnopqrstuvwxyzABCDEF")
 if got:=readEncryptedPayerPhone(wrong,encoded,aad);got!=""{t.Fatalf("wrong key revealed phone")}
}
func TestSetVerifiedPayerPhoneReplacesOnlySyntheticName(t *testing.T){
 body:=map[string]any{"name":"Payer · ••••5678","phone":"••••5678"}
 setVerifiedPayerPhone(body,"+8801712345678")
 if body["name"]!="+8801712345678"||body["phone"]!="+8801712345678"{t.Fatal("synthetic identity not replaced")}
 manuallyNamed:=map[string]any{"name":"Customer Name"}
 setVerifiedPayerPhone(manuallyNamed,"+8801712345678")
 if manuallyNamed["name"]!="Customer Name"{t.Fatal("custom name was replaced")}
}
