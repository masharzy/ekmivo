package checkout

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
)

type aiPaymentLink struct {
	Order     string    `json:"order_id"`
	Intent    string    `json:"intent_id"`
	Amount    int64     `json:"amount_minor"`
	ExpiresAt time.Time `json:"expires_at"`
	Error     string    `json:"error"`
}

func (s *Service) createAIOrderPaymentLink(ctx context.Context, workspace, job, lease string) (aiPaymentLink, error) {
	var link aiPaymentLink
	if len(s.TokenKey) < 32 {
		link.Error = "payment_link_unavailable"
		return link, nil
	}
	control, err := s.Pipeline.Control.Begin(ctx)
	if err != nil {
		return link, err
	}
	defer control.Rollback(ctx)
	var raw []byte
	if err = control.QueryRow(ctx, "SELECT briofold_ai_payment_link_prepare($1::uuid,$2::uuid)", job, lease).Scan(&raw); err != nil {
		return link, err
	}
	if err = json.Unmarshal(raw, &link); err != nil || link.Error != "" {
		return link, err
	}
	if link.Intent != "" {
		return link, control.Commit(ctx)
	}
	err = s.creationScoped(ctx, workspace, "live", func(tx pgx.Tx) error {
		tokenDigest := digest(s.token(workspace, "live", "ai-order:"+link.Order))
		return tx.QueryRow(ctx, "SELECT pg243_ai_payment_link($1::uuid,'live',$2::uuid,$3,$4,$5)->>'id'",
			workspace, link.Order, link.Amount, link.ExpiresAt, tokenDigest).Scan(&link.Intent)
	})
	if err != nil {
		return link, err
	}
	var bound bool
	if err = control.QueryRow(ctx, "SELECT briofold_ai_payment_link_bind($1::uuid,$2::uuid,$3::uuid,$4::uuid,$5,$6)",
		job, lease, link.Order, link.Intent, link.Amount, link.ExpiresAt).Scan(&bound); err != nil {
		return link, err
	}
	if !bound {
		link.Error = "payment_link_unavailable"
		return link, nil
	}
	return link, control.Commit(ctx)
}

// The checkout capability is derived at delivery, never stored in an inbox
// message, a model prompt, or a tool result.
func (s *Service) aiOrderCheckoutURL(ctx context.Context, workspace, thread, order string) string {
	if !uuidPattern.MatchString(order) || len(s.TokenKey) < 32 || !aiChannelCommerceEnabledFor(workspace) {
		return ""
	}
	var active bool
	if s.Pipeline.Control.QueryRow(ctx, "SELECT briofold_ai_payment_link_active($1::uuid,$2::uuid,$3::uuid)",
		workspace, thread, order).Scan(&active) != nil || !active {
		return ""
	}
	return publicCheckoutURL(s.token(workspace, "live", "ai-order:"+order))
}

func (s *Service) resolveAIOrderPaymentLinks(ctx context.Context) {
	rows, err := s.Pipeline.Control.Query(ctx, "SELECT * FROM briofold_ai_payment_links_due()")
	if err != nil {
		log.Print("AI payment link reconciliation unavailable")
		return
	}
	type due struct {
		order, workspace, intent string
		amount                   int64
	}
	var links []due
	for rows.Next() {
		var link due
		if rows.Scan(&link.order, &link.workspace, &link.intent, &link.amount) == nil {
			links = append(links, link)
		}
	}
	rows.Close()
	for _, link := range links {
		if !aiChannelCommerceEnabledFor(link.workspace) {
			continue
		}
		var state string
		var amount int64
		err := s.scoped(ctx, link.workspace, "live", func(tx pgx.Tx) error {
			return tx.QueryRow(ctx, `SELECT value->>'state',(value->>'amount_minor')::bigint
				FROM pg05_merchant_detail($1::uuid,'live',$2::uuid) value`, link.workspace, link.intent).Scan(&state, &amount)
		})
		if err != nil || amount != link.amount || (state != "completed" && state != "expired" && state != "cancelled") {
			continue
		}
		if _, err = s.Pipeline.Control.Exec(ctx, "SELECT briofold_ai_payment_link_resolve($1::uuid,$2::uuid,$3)", link.order, link.intent, state); err != nil {
			log.Print("AI payment link settlement deferred")
		}
	}
}
