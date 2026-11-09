package checkout

import (
	"crypto/hmac"
	"encoding/base64"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"sort"
	"strings"
	"time"
)

const (
	aiButtonPrefix = "bc1."
	aiButtonBody   = 57
	aiButtonLength = aiButtonBody + 32
)

type aiCardButton struct {
	Ref   string `json:"ref,omitempty"`
	Label string `json:"label"`
	Token string `json:"token,omitempty"`
	Price int64  `json:"price_minor"`
}
type aiProductCard struct {
	Name    string         `json:"name"`
	Price   int64          `json:"price_minor"`
	Buttons []aiCardButton `json:"buttons"`
}
type aiProductCards struct {
	Expires int64           `json:"expires"`
	Cards   []aiProductCard `json:"cards"`
}

func signAIOrderButton(key []byte, workspace, thread, ref string, expiry int64) string {
	if len(key) != 32 || expiry <= 0 {
		return ""
	}
	buf := make([]byte, aiButtonBody, aiButtonLength)
	buf[0] = 1 // select a variant as a customer turn
	binary.BigEndian.PutUint64(buf[49:], uint64(expiry))
	for index, id := range []string{workspace, thread, ref} {
		if !uuidPattern.MatchString(id) {
			return ""
		}
		value, err := hex.DecodeString(strings.ReplaceAll(id, "-", ""))
		if err != nil {
			return ""
		}
		copy(buf[1+index*16:], value)
	}
	mac := channelHMAC(key, append([]byte(aiButtonPrefix), buf...))
	return aiButtonPrefix + base64.RawURLEncoding.EncodeToString(append(buf, mac...))
}

func aiOrderButtonTurn(key []byte, token, workspace, thread string, now time.Time) (string, bool) {
	if len(key) != 32 || !strings.HasPrefix(token, aiButtonPrefix) || len(token) != len(aiButtonPrefix)+base64.RawURLEncoding.EncodedLen(aiButtonLength) {
		return "", false
	}
	buf, err := base64.RawURLEncoding.Strict().DecodeString(strings.TrimPrefix(token, aiButtonPrefix))
	if err != nil || len(buf) != aiButtonLength || buf[0] != 1 {
		return "", false
	}
	want := channelHMAC(key, append([]byte(aiButtonPrefix), buf[:aiButtonBody]...))
	if !hmac.Equal(want, buf[aiButtonBody:]) || now.Unix() >= int64(binary.BigEndian.Uint64(buf[49:57])) {
		return "", false
	}
	if hex.EncodeToString(buf[1:17]) != strings.ReplaceAll(strings.ToLower(workspace), "-", "") ||
		hex.EncodeToString(buf[17:33]) != strings.ReplaceAll(strings.ToLower(thread), "-", "") {
		return "", false
	}
	ref := buf[33:49]
	return fmt.Sprintf("I would like to order variant %x-%x-%x-%x-%x.", ref[:4], ref[4:6], ref[6:8], ref[8:10], ref[10:]), true
}

type aiCardProductFact struct {
	Ref      string `json:"product_ref"`
	Name     string `json:"name"`
	Variants []struct {
		Ref       string            `json:"variant_ref"`
		Options   map[string]string `json:"options"`
		Price     int64             `json:"price_minor"`
		Available int64             `json:"available"`
	} `json:"variants"`
}

func buildAIProductCards(facts []json.RawMessage, lang string, now time.Time) aiProductCards {
	out := aiProductCards{Expires: now.Add(30 * time.Minute).Unix()}
	seen := make(map[string]bool)
	for _, fact := range facts {
		var list struct {
			Products []aiCardProductFact `json:"products"`
		}
		if json.Unmarshal(fact, &list) != nil {
			continue
		}
		if list.Products == nil {
			var product aiCardProductFact
			if json.Unmarshal(fact, &product) == nil {
				list.Products = []aiCardProductFact{product}
			}
		}
		for _, product := range list.Products {
			if len(out.Cards) >= 10 {
				return out
			}
			if !uuidPattern.MatchString(product.Ref) || product.Name == "" || seen[product.Ref] {
				continue
			}
			card := aiProductCard{Name: product.Name}
			for _, variant := range product.Variants {
				if variant.Available < 1 || variant.Price < 0 || !uuidPattern.MatchString(variant.Ref) {
					continue
				}
				label := "Order"
				if lang == "bn" {
					label = "অর্ডার করুন"
				}
				options := make([]string, 0, len(variant.Options))
				for _, option := range variant.Options {
					options = append(options, option)
				}
				sort.Strings(options)
				if len(options) > 0 {
					label += " · " + strings.Join(options, " / ")
				}
				if len(card.Buttons) == 0 || variant.Price < card.Price {
					card.Price = variant.Price
				}
				card.Buttons = append(card.Buttons, aiCardButton{Ref: variant.Ref, Label: cardLabel(label, 80), Price: variant.Price})
				if len(card.Buttons) == 3 {
					break
				}
			}
			if len(card.Buttons) > 0 {
				out.Cards = append(out.Cards, card)
				seen[product.Ref] = true
			}
		}
	}
	return out
}

func (s *Service) signAIProductCards(raw []byte, workspace, thread string, now time.Time) []aiProductCard {
	var source aiProductCards
	if s.Pipeline == nil || json.Unmarshal(raw, &source) != nil || source.Expires <= now.Unix() || len(source.Cards) > 10 {
		return nil
	}
	for index := range source.Cards {
		card := &source.Cards[index]
		if len(card.Buttons) == 0 || len(card.Buttons) > 3 {
			return nil
		}
		for i := range card.Buttons {
			button := &card.Buttons[i]
			button.Token = signAIOrderButton(s.Pipeline.Key, workspace, thread, button.Ref, source.Expires)
			button.Ref = ""
			if button.Token == "" {
				return nil
			}
		}
	}
	return source.Cards
}

func cardLabel(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}

func (s *Service) aiMetaCardPayload(j inboxSendJob) map[string]any {
	if !aiChannelCommerceEnabledFor(j.Workspace) || (j.Channel != "ms" && j.Channel != "ig" && j.Channel != "wa") {
		return nil
	}
	raw, err := json.Marshal(j.Content["ai_cards"])
	if err != nil {
		return nil
	}
	cards := s.signAIProductCards(raw, j.Workspace, j.Thread, time.Now())
	if len(cards) == 0 {
		return nil
	}
	if j.Channel == "wa" {
		rows := make([]map[string]string, 0, 10)
		for _, card := range cards {
			for _, button := range card.Buttons {
				if len(rows) < 10 {
					rows = append(rows, map[string]string{"id": button.Token, "title": cardLabel(card.Name, 24), "description": cardLabel(button.Label+" · "+formatMinor(button.Price)+" BDT", 72)})
				}
			}
		}
		payload := map[string]any{"messaging_product": "whatsapp", "to": j.Recipient, "type": "interactive",
			"interactive": map[string]any{"type": "list", "body": map[string]string{"text": cardLabel(j.Text, 1024)},
				"action": map[string]any{"button": "Products", "sections": []any{map[string]any{"rows": rows}}}}}
		if j.Reply != "" {
			payload["context"] = map[string]string{"message_id": j.Reply}
		}
		return payload
	}
	elements := make([]map[string]any, 0, len(cards))
	for _, card := range cards {
		buttons := make([]map[string]string, 0, len(card.Buttons))
		for _, button := range card.Buttons {
			buttons = append(buttons, map[string]string{"type": "postback", "title": cardLabel(button.Label, 20), "payload": button.Token})
		}
		elements = append(elements, map[string]any{"title": cardLabel(card.Name, 80), "subtitle": "From " + formatMinor(card.Price) + " BDT", "buttons": buttons})
	}
	return map[string]any{"recipient": map[string]string{"id": j.Recipient}, "messaging_type": "RESPONSE",
		"message": map[string]any{"attachment": map[string]any{"type": "template", "payload": map[string]any{"template_type": "generic", "elements": elements}}}}
}

// The provider event can still be deduplicated and audited without retaining
// an active button capability in the stored webhook body.
func redactAIChannelButtons(raw []byte) []byte {
	if !strings.Contains(string(raw), aiButtonPrefix) {
		return raw
	}
	var payload any
	if json.Unmarshal(raw, &payload) != nil {
		return raw
	}
	var redact func(any)
	redact = func(value any) {
		switch object := value.(type) {
		case map[string]any:
			for key, item := range object {
				if text, ok := item.(string); ok && (key == "id" || key == "payload") && strings.HasPrefix(text, aiButtonPrefix) {
					object[key] = "[redacted]"
				} else {
					redact(item)
				}
			}
		case []any:
			for _, item := range object {
				redact(item)
			}
		}
	}
	redact(payload)
	safe, err := json.Marshal(payload)
	if err != nil {
		return raw
	}
	return safe
}
