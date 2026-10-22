package checkout

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

type subscriptionTestRow struct {
	proof []byte
	state string
	value bool
	err error
}
func (r subscriptionTestRow) Scan(d ...any) error {
	if r.err!=nil{return r.err}
	if len(d)==2 {
		*d[0].(*[]byte)=r.proof
		*d[1].(*sql.NullString)=sql.NullString{String:r.state,Valid:r.state!=""}
		return nil
	}
	switch v:=d[0].(type) {
	case *[]byte:*v=r.proof
	case *bool:*v=r.value
	default:return errors.New("unexpected test SQL scan")
	}
	return nil
}
type subscriptionTestDB struct {fn func(string,...any) pgx.Row}
func(d subscriptionTestDB)QueryRow(_ context.Context,q string,a ...any)pgx.Row{return d.fn(q,a...)}

func subscriptionQueue(state string) []byte {
	return []byte(`[{"intent_id":"10000000-0000-4000-8000-000000000003","invoice_id":"10000000-0000-4000-8000-000000000005","workspace_id":"10000000-0000-4000-8000-000000000001","receiving_workspace_id":"10000000-0000-4000-8000-000000000002","amount_minor":2500,"checkout_token_digest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","state":"`+state+`"}]`)
}
func TestSubscriptionWorkerIsolatedRealms(t *testing.T) {
	for _,v:=range []struct{realm string;enabled bool}{{"sandbox",true},{"live",false}}{
		if err:=reconcileSubscriptionPayments(context.Background(),nil,nil,v.realm,v.enabled);err!=nil {t.Fatal(err)}
	}
	if err:=reconcileSubscriptionPayments(context.Background(),nil,nil,"live",true);err==nil{t.Fatal("missing isolated databases accepted")}
}
func TestSubscriptionVerifiedOnlyAndLateMoney(t *testing.T){
	proof:=billingPaymentProof{ID:"10000000-0000-4000-8000-000000000004",Workspace:"10000000-0000-4000-8000-000000000002",Amount:2500,At:time.Now().UTC()}
	valid,_:=json.Marshal(proof)
	for _,tc:=range []struct{
		name,controlState,financialState string
		proof []byte
		wantMutation string
		wantError bool
	}{
		{"paid","awaiting_payment","completed",valid,"payment_settle",false},
		{"unpaid","awaiting_payment","awaiting_payment",[]byte("null"),"",false},
		{"processing","awaiting_payment","processing",[]byte("null"),"",false},
		{"missing financial intent","awaiting_payment","",[]byte("null"),"",false},
		{"no evidence completed","awaiting_payment","completed",[]byte("null"),"",true},
		{"bad amount","awaiting_payment","completed",func()[]byte{p:=proof;p.Amount++;b,_:=json.Marshal(p);return b}(),"",true},
		{"wrong receiver","awaiting_payment","completed",func()[]byte{p:=proof;p.Workspace="10000000-0000-4000-8000-000000000001";b,_:=json.Marshal(p);return b}(),"",true},
		{"cancelled after transfer","cancelled","completed",valid,"payment_recover",false},
		{"expired after transfer","expired","completed",valid,"payment_recover",false},
		{"expired with late proof","awaiting_payment","expired",valid,"payment_recover",false},
		{"expired unverified","awaiting_payment","expired",[]byte("null"),"payment_terminal",false},
		{"cancelled unverified","awaiting_payment","cancelled",[]byte("null"),"payment_terminal",false},
		{"fake browser status","awaiting_payment","paid",valid,"",true},
	} {
		t.Run(tc.name,func(t *testing.T){
			mutations:=[]string{}
			control:=subscriptionTestDB{fn:func(q string,a ...any)pgx.Row{
				if strings.Contains(q,"payment_pending"){return subscriptionTestRow{proof:subscriptionQueue(tc.controlState)}}
				mutations=append(mutations,q)
				return subscriptionTestRow{value:true}
			}}
			finance:=subscriptionTestDB{fn:func(q string,a ...any)pgx.Row{
				if q!="SELECT pg13_platform_payment($1),pg05_checkout_view($1)->>'state'" ||len(a)!=1||a[0]!="aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"{t.Fatalf("wrong financial locator: %s %v",q,a)}
				return subscriptionTestRow{proof:tc.proof,state:tc.financialState}
			}}
			err:=reconcileSubscriptionPayments(context.Background(),control,finance,"live",true)
			if (err!=nil)!=tc.wantError{t.Fatalf("err=%v",err)}
			if tc.wantMutation=="" {
				if len(mutations)!=0{t.Fatalf("unverified/invalid evidence mutated subscription: %v",mutations)}
			}else if len(mutations)!=1||!strings.Contains(mutations[0],tc.wantMutation){
				t.Fatalf("expected %s once: %v",tc.wantMutation,mutations)
			}
		})
	}
}
func TestSubscriptionWorkerInvalidQueueAndFinanceOutage(t *testing.T) {
	control:=subscriptionTestDB{fn:func(string,...any)pgx.Row{return subscriptionTestRow{proof:[]byte("{}")}}}
	finance:=subscriptionTestDB{fn:func(string,...any)pgx.Row{t.Fatal("financial proof must not be queried");return subscriptionTestRow{}}}
	if err:=reconcileSubscriptionPayments(context.Background(),control,finance,"live",true);err==nil{t.Fatal("invalid queue accepted")}
	control.fn=func(string,...any)pgx.Row{return subscriptionTestRow{proof:subscriptionQueue("awaiting_payment")}}
	finance.fn=func(string,...any)pgx.Row{return subscriptionTestRow{err:errors.New("offline receiver")}}
	if err:=reconcileSubscriptionPayments(context.Background(),control,finance,"live",true);err==nil{t.Fatal("offline financial source appeared paid")}
}
